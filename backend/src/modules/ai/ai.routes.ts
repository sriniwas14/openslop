import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { aiConfigs } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { AI_PROVIDERS } from "../../lib/mastra";
import {
  aiConfigIdParamsSchema,
  aiConfigResponseSchema,
  createAiConfigSchema,
  errorResponseSchema,
  modelQuerySchema,
  updateAiConfigSchema,
} from "./ai.schemas";

function maskKey(k: string | null | undefined) {
  if (!k) return null;
  if (k.length <= 8) return "****";
  return `${k.slice(0, 3)}****${k.slice(-4)}`;
}

function toResponse(row: typeof aiConfigs.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    apiKeyMasked: maskKey(row.apiKey),
    baseUrl: row.baseUrl,
    model: row.model,
    name: row.name,
    isDefault: row.isDefault === "1",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const CURATED: Record<string, string[]> = {
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ],
  google: [
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash-exp",
    "gemini-pro",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o1-preview"],
  openrouter: [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-1.5-pro",
    "meta-llama/llama-3.1-70b-instruct",
    "mistralai/mistral-large",
  ],
  xai: ["grok-2", "grok-2-mini", "grok-beta"],
  ollama: ["llama3.1", "llama3", "mistral", "qwen2", "gemma2", "phi3"],
};

// ponytail: 5m in-mem cache for model lists
const modelCache = new Map<string, { at: number; data: { id: string; name: string }[] }>();

async function fetchOpenAiModels(baseUrl: string, apiKey: string): Promise<{ id: string; name: string }[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json: any = await res.json();
    const list = json.data ?? json.models ?? [];
    return list.map((m: any) => ({ id: m.id ?? m.name, name: m.id ?? m.name })).filter((m: any) => m.id);
  } finally {
    clearTimeout(t);
  }
}

async function fetchOllamaModels(baseUrl: string): Promise<{ id: string; name: string }[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    const json: any = await res.json();
    const list = json.models ?? [];
    return list.map((m: any) => ({ id: m.name ?? m.model, name: m.name ?? m.model })).filter((m: any) => m.id);
  } finally {
    clearTimeout(t);
  }
}

export async function aiRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/ai/configs",
    { preHandler: requireSession, schema: { response: { 200: z.array(aiConfigResponseSchema) } } },
    async (request) =>
      (await db
        .select()
        .from(aiConfigs)
        .where(eq(aiConfigs.userId, request.session!.user.id))
        .orderBy(desc(aiConfigs.createdAt))).map(toResponse),
  );

  r.post(
    "/ai/configs",
    { preHandler: requireSession, schema: { body: createAiConfigSchema, response: { 201: aiConfigResponseSchema } } },
    async (request, reply) => {
      const body: any = request.body;
      const isDefault = body.isDefault ? "1" : "0";
      if (isDefault === "1") {
        await db.update(aiConfigs).set({ isDefault: "0", updatedAt: new Date().toISOString() }).where(eq(aiConfigs.userId, request.session!.user.id));
      }
      const [row] = await db
        .insert(aiConfigs)
        .values({
          userId: request.session!.user.id,
          provider: body.provider,
          apiKey: body.apiKey || null,
          baseUrl: body.baseUrl || null,
          model: body.model || null,
          name: body.name || null,
          isDefault,
        })
        .returning();
      return reply.status(201).send(toResponse(row));
    },
  );

  r.patch(
    "/ai/configs/:id",
    {
      preHandler: requireSession,
      schema: { params: aiConfigIdParamsSchema, body: updateAiConfigSchema, response: { 200: aiConfigResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const body: any = request.body;
      const patch: any = { updatedAt: new Date().toISOString() };
      if (body.provider !== undefined) patch.provider = body.provider;
      if (body.apiKey !== undefined) patch.apiKey = body.apiKey || null;
      if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl || null;
      if (body.model !== undefined) patch.model = body.model || null;
      if (body.name !== undefined) patch.name = body.name || null;
      if (body.isDefault !== undefined) {
        patch.isDefault = body.isDefault ? "1" : "0";
        if (patch.isDefault === "1") {
          await db.update(aiConfigs).set({ isDefault: "0", updatedAt: new Date().toISOString() }).where(eq(aiConfigs.userId, request.session!.user.id));
        }
      }
      const [row] = await db
        .update(aiConfigs)
        .set(patch)
        .where(and(eq(aiConfigs.id, request.params.id), eq(aiConfigs.userId, request.session!.user.id)))
        .returning();
      if (!row) return reply.status(404).send({ error: "Not found" } as any);
      return toResponse(row) as any;
    },
  );

  r.delete(
    "/ai/configs/:id",
    { preHandler: requireSession, schema: { params: aiConfigIdParamsSchema, response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema } } },
    async (request, reply) => {
      const rows = await db
        .delete(aiConfigs)
        .where(and(eq(aiConfigs.id, request.params.id), eq(aiConfigs.userId, request.session!.user.id)))
        .returning({ id: aiConfigs.id });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      return { success: true };
    },
  );

  r.post(
    "/ai/configs/:id/default",
    { preHandler: requireSession, schema: { params: aiConfigIdParamsSchema, response: { 200: aiConfigResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      await db.update(aiConfigs).set({ isDefault: "0", updatedAt: new Date().toISOString() }).where(eq(aiConfigs.userId, request.session!.user.id));
      const [row] = await db
        .update(aiConfigs)
        .set({ isDefault: "1", updatedAt: new Date().toISOString() })
        .where(and(eq(aiConfigs.id, request.params.id), eq(aiConfigs.userId, request.session!.user.id)))
        .returning();
      if (!row) return reply.status(404).send({ error: "Not found" } as any);
      return toResponse(row) as any;
    },
  );

  r.get(
    "/ai/models",
    {
      preHandler: requireSession,
      schema: { querystring: modelQuerySchema, response: { 200: z.array(z.object({ id: z.string(), name: z.string() })), 400: errorResponseSchema, 401: errorResponseSchema } },
    },
    async (request, reply) => {
      const { provider, configId, apiKey: qApiKey, baseUrl: qBaseUrl, q } = request.query as any;
      if (!AI_PROVIDERS.includes(provider)) return reply.status(400).send({ error: "unknown provider" } as any);

      // curated for anthropic/google — static, no DB needed
      if (provider === "anthropic" || provider === "google") {
        let list = CURATED[provider].map((id) => ({ id, name: id }));
        if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
        return list.slice(0, 50);
      }

      // strict DB-only for dynamic providers — no env fallback, but allow transient qApiKey/qBaseUrl for live preview before save
      let hasConfig = false;

      // for dynamic providers, try to fetch if we have creds — strict DB-only
      let apiKey: string | null = null;
      let baseUrl: string | null = null;
      if (configId) {
        const [cfg] = await db
          .select()
          .from(aiConfigs)
          .where(and(eq(aiConfigs.id, configId), eq(aiConfigs.userId, request.session!.user.id)));
        if (cfg) {
          apiKey = cfg.apiKey;
          baseUrl = cfg.baseUrl;
          hasConfig = true;
        }
      } else {
        const [def] = await db
          .select()
          .from(aiConfigs)
          .where(and(eq(aiConfigs.userId, request.session!.user.id), eq(aiConfigs.provider, provider), eq(aiConfigs.isDefault, "1")));
        if (def) {
          apiKey = def.apiKey;
          baseUrl = def.baseUrl;
          hasConfig = true;
        } else {
          // fallback to any config for this user (single default per user)
          const [any] = await db.select().from(aiConfigs).where(and(eq(aiConfigs.userId, request.session!.user.id), eq(aiConfigs.provider, provider)));
          if (any) {
            apiKey = any.apiKey;
            baseUrl = any.baseUrl;
            hasConfig = true;
          }
        }
      }
      if (!hasConfig) {
        // ponytail: live preview with just-typed key before POST /ai/configs
        if (qApiKey || (provider === "ollama" && qBaseUrl)) {
          apiKey = (qApiKey as string) || null;
          baseUrl = (qBaseUrl as string) || null;
        } else if (CURATED[provider]) {
          // no key yet — show curated fallback so dropdown is not empty
          let list = CURATED[provider].map((id) => ({ id, name: id }));
          if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
          return list.slice(0, 50);
        } else {
          // ponytail: onboarding calls this before POST /ai/configs — return 200 [] so ModelSelector can fallback to manual entry
          return [];
        }
      }

      const cacheKey = `${provider}|${apiKey ?? ""}|${baseUrl ?? ""}|${q ?? ""}`;
      const cached = modelCache.get(cacheKey);
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;

      try {
        let list: { id: string; name: string }[] = [];
        if (provider === "ollama") {
          list = await fetchOllamaModels(baseUrl || "http://localhost:11434");
        } else if (provider === "openai" || provider === "openrouter" || provider === "custom" || provider === "xai") {
          if (!apiKey) {
            // ponytail: no key — show curated if available so dropdown not empty
            if (CURATED[provider]) {
              let list = CURATED[provider].map((id) => ({ id, name: id }));
              if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
              const out = list.slice(0, 50);
              modelCache.set(cacheKey, { at: Date.now(), data: out });
              return out;
            }
            return [];
          }
          const defaultBase =
            provider === "openai"
              ? "https://api.openai.com/v1"
              : provider === "openrouter"
                ? "https://openrouter.ai/api/v1"
                : provider === "xai"
                  ? "https://api.x.ai/v1"
                  : baseUrl || "https://api.openai.com/v1";
          const urlBase = baseUrl || defaultBase;
          list = await fetchOpenAiModels(urlBase, apiKey);
        }
        if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
        const out = list.slice(0, 50);
        modelCache.set(cacheKey, { at: Date.now(), data: out });
        return out;
      } catch (e: any) {
        request.log.warn({ err: e, provider }, "model fetch failed");
        // ponytail: on fetch fail, fall back to curated if exists, else empty
        if (CURATED[provider]) {
          let list = CURATED[provider].map((id) => ({ id, name: id }));
          if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
          return list.slice(0, 50);
        }
        return [];
      }
    },
  );
}
