import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { aiConfigs, aiPreferences, companies } from "../../db/schema";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";

export type TaskKind = "video" | "image" | "text" | "default";

// ponytail: strict DB-only — no env fallback; provider-aware routing so openrouter key hits openrouter, not api.openai.com
// task-aware: uses ai_preferences fallback to isDefault/first
export async function resolveUserModel(userId: string, task: TaskKind = "default") {
  // ponytail: provider+model independent — prefs hold per-task {configId, model}; config holds credentials
  if (task !== "default") {
    try {
      const [pref] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, userId));
      const pair =
        task === "video" ? { id: pref?.videoConfigId ?? null, model: (pref as any)?.videoModel ?? null } :
        task === "image" ? { id: pref?.imageConfigId ?? null, model: (pref as any)?.imageModel ?? null } :
        { id: pref?.textConfigId ?? null, model: (pref as any)?.textModel ?? null };
      if (pair.id && pair.model) {
        const [row] = await db.select().from(aiConfigs).where(and(eq(aiConfigs.id, pair.id), eq(aiConfigs.userId, userId)));
        if (row) {
          const provider = row.provider as string;
          const model = pair.model;
          const apiKey = row.apiKey ?? "not-set";
          if (provider === "ollama") return createOllama(row.baseUrl ? { baseURL: row.baseUrl } : undefined)(model);
          if (provider === "anthropic") {
            if (row.baseUrl) return createOpenAI({ apiKey, baseURL: row.baseUrl })(model);
            return createAnthropic({ apiKey })(model);
          }
          if (provider === "google") {
            if (row.baseUrl) return createOpenAI({ apiKey, baseURL: row.baseUrl })(model);
            return createGoogleGenerativeAI({ apiKey })(model);
          }
          const baseURL = row.baseUrl ?? (provider === "openrouter" ? "https://openrouter.ai/api/v1" : provider === "openai" ? "https://api.openai.com/v1" : provider === "xai" ? "https://api.x.ai/v1" : undefined);
          return createOpenAI({ apiKey, baseURL })(model);
        }
      }
      if (pair.id || pair.model) {
        // partial — require both
        throw new Error(`Configure ${task} provider + model in Settings → AI Providers (both required)`);
      }
    } catch (e: any) {
      if (e?.message?.includes("Configure")) throw e;
      // table missing before migration — fall through
    }
  }

  // fallback: isDefault/first, uses its own model column (legacy)
  let cfg: typeof aiConfigs.$inferSelect | undefined;
  {
    const [def] = await db
      .select()
      .from(aiConfigs)
      .where(and(eq(aiConfigs.userId, userId), eq(aiConfigs.isDefault, "1")));
    cfg = def ?? (await db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).then((r) => r[0]));
  }
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
    const model = await resolveUserModel(inputData.userId, "text");
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
