import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { companies } from "../../db/schema";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../../env";

export type TaskKind = "video" | "image" | "text" | "default";

// ponytail: server-managed keys — single OpenRouter key for all users (no per-user ai_config).
// task-aware: model comes from env per task; userId kept in signature so callers don't change.
export async function resolveUserModel(_userId: string, task: TaskKind = "default") {
  const apiKey = (env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing — set it in backend/.env (see .env.example)");
  const model =
    task === "video" ? env.OPENROUTER_VIDEO_MODEL
    : task === "image" ? env.OPENROUTER_IMAGE_MODEL
    : env.OPENROUTER_TEXT_MODEL;
  return createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" })(model);
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
