import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { aiConfigs, companies } from "../../db/schema";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";

// ponytail: strict DB-only — no env fallback; provider-aware routing so openrouter key hits openrouter, not api.openai.com
async function resolvePersonaModel(userId: string) {
  const [def] = await db
    .select()
    .from(aiConfigs)
    .where(and(eq(aiConfigs.userId, userId), eq(aiConfigs.isDefault, "1")));
  const cfg = def ?? (await db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).then((r) => r[0]));
  if (!cfg?.model) throw new Error("No AI provider configured — add one in Settings → AI Providers and set as Default");
  const provider = cfg.provider as string;
  const model = cfg.model!;
  const apiKey = cfg.apiKey ?? "not-set";
  if (provider === "ollama") {
    return createOllama(cfg.baseUrl ? { baseURL: cfg.baseUrl } : undefined)(model);
  }
  if (provider === "anthropic") {
    // ponytail: native anthropic client; baseUrl override via custom provider if needed
    if (cfg.baseUrl) return createOpenAI({ apiKey, baseURL: cfg.baseUrl })(model);
    return createAnthropic({ apiKey })(model);
  }
  if (provider === "google") {
    if (cfg.baseUrl) return createOpenAI({ apiKey, baseURL: cfg.baseUrl })(model);
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  // openai/openrouter/xai/custom — OpenAI-compatible with provider-specific default baseURL
  const baseURL =
    cfg.baseUrl ??
    (provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : provider === "openai"
        ? "https://api.openai.com/v1"
        : provider === "xai"
          ? "https://api.x.ai/v1"
          : undefined);
  return createOpenAI({ apiKey, baseURL })(model);
}

const fetchStep = createStep({
  id: "fetch-homepage",
  inputSchema: z.object({
    companyId: z.string(),
    website: z.string().url(),
    name: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    content: z.string(),
    companyId: z.string(),
    name: z.string(),
    userId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const url = inputData.website;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "openslop/1.0" },
      });
      if (!res.ok) throw new Error(`fetch ${res.status} ${res.statusText}`);
      const html = await res.text();
      // ponytail: regex strip, no cheerio until proven insufficient
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
      if (!text) throw new Error("empty content");
      return { content: text, companyId: inputData.companyId, name: inputData.name, userId: inputData.userId };
    } finally {
      clearTimeout(tid);
    }
  },
});

const generateStep = createStep({
  id: "generate-persona",
  inputSchema: z.object({
    content: z.string(),
    companyId: z.string(),
    name: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    persona: z.string(),
    companyId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const model = await resolvePersonaModel(inputData.userId);
    const agent = new (await import("@mastra/core/agent")).Agent({
      id: "persona-agent",
      name: "persona-agent",
      instructions:
        "You create concise company personas. Return audience, voice, values, pain points, positioning in <1800 chars.",
      model: model as any,
    });
    const res = await agent.generate(
      `Company "${inputData.name}" website content:\n"""${inputData.content}"""\n\nCreate persona: audience, voice, values, pain points, positioning. <=1800 chars.`,
    );
    return { persona: res.text.slice(0, 10_000), companyId: inputData.companyId };
  },
});

const persistStep = createStep({
  id: "persist-persona",
  inputSchema: z.object({
    persona: z.string(),
    companyId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    await db
      .update(companies)
      .set({ persona: inputData.persona, updatedAt: new Date().toISOString() })
      .where(eq(companies.id, inputData.companyId));
    return { success: true };
  },
});

export const companyPersonaWorkflow = createWorkflow({
  id: "company-persona-workflow",
  inputSchema: z.object({
    companyId: z.string(),
    website: z.string().url(),
    name: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  retryConfig: { attempts: 0 },
})
  .then(fetchStep)
  .then(generateStep)
  .then(persistStep)
  .commit();
