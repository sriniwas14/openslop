import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { aiConfigs, aiPreferences, companies } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { AI_PROVIDERS } from "../../lib/mastra";
import { resolveUserModel } from "../company/company.workflow";
import {
  aiConfigIdParamsSchema,
  aiConfigResponseSchema,
  createAiConfigSchema,
  errorResponseSchema,
  generateContentBodySchema,
  generatedContentSchema,
  modelQuerySchema,
  onboardingProgressResponseSchema,
  onboardingProgressSchema,
  preferencesSchema,
  updateAiConfigSchema,
  updatePreferencesSchema,
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
    serviceAccountConfigured: Boolean(row.serviceAccountJson),
    baseUrl: row.baseUrl,
    projectId: row.projectId,
    location: row.location,
    model: (row as any).model,
    configId: (row as any).configId ?? null,
    name: row.name,
    isDefault: row.isDefault === "1",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type ModelTask = "video" | "image" | "text";

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

const CURATED_BY_TASK: Record<string, Partial<Record<ModelTask, string[]>>> = {
  runway: {
    video: ["wan3", "seedance2_5", "grok_imagine_1_5", "seedance2", "seedance2_fast", "seedance2_mini", "hailuo3", "aleph2", "gen4.5", "gen4_turbo", "act_two", "veo3.1", "veo3.1_fast", "happyhorse_1_0", "gemini_omni_flash"],
    image: ["muse_image", "grok_imagine_image_2", "seedream5_pro", "seedream5_lite", "gen4_image", "gen4_image_turbo", "gemini_image3_pro", "gemini_image3.1_flash", "gpt_image_2", "gemini_2.5_flash"],
  },
  vertex: {
    text: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    image: ["imagen-4.0-generate-001", "imagen-4.0-fast-generate-001", "imagen-3.0-generate-002"],
    video: ["veo-3.0-generate-001", "veo-2.0-generate-001"],
  },
  fal: {
    image: [],
    video: [],
  },
  openrouter: {
    image: [
      "google/gemini-2.5-flash-image",
      "openai/gpt-image-1",
      "bytedance-seed/seedream-4.5",
      "black-forest-labs/flux.2-pro",
      "xai/grok-2-image",
    ],
    video: [],
  },
  luma: {
    image: ["photon-1", "photon-flash-1"],
    video: ["ray-2", "ray-flash-2"],
  },
};

function curatedModels(provider: string, task: ModelTask): { id: string; name: string }[] {
  const ids = CURATED_BY_TASK[provider]?.[task] ?? CURATED[provider] ?? [];
  return ids.map((id) => ({ id, name: id }));
}

// ponytail: 5m in-mem cache for model lists
const modelCache = new Map<string, { at: number; data: { id: string; name: string }[] }>();

const KIND_LABELS: Record<string, string> = {
  carousel: "Carousel (multi-slide social post)",
  "talking-head": "Talking Head Video (presenter-style video)",
  "short-video": "Short Video (short-form video)",
  image: "Image Post (visual social post)",
  text: "Text Post (text-based content)",
  article: "Article (long-form content)",
};

const VALID_PLATFORMS = ["instagram", "linkedin", "x", "tiktok", "youtube", "blog"];

// ponytail: models sometimes wrap JSON in markdown fences — extract the first { ... } block
function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model response");
  return JSON.parse(raw.slice(start, end + 1));
}

async function fetchOpenAiModels(baseUrl: string, apiKey: string, path = "/models"): Promise<{ id: string; name: string }[]> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
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
    return list
      .map((m: any) => ({ id: m.id ?? m.name, name: m.name ?? m.id }))
      .filter((m: any) => m.id);
  } finally {
    clearTimeout(t);
  }
}

async function fetchOpenRouterModels(baseUrl: string, apiKey: string, task: ModelTask): Promise<{ id: string; name: string }[]> {
  const path = task === "video" ? "/videos/models" : task === "image" ? "/images/models" : "/models";
  return fetchOpenAiModels(baseUrl, apiKey, path);
}

async function fetchFalModels(baseUrl: string, apiKey: string, task: ModelTask): Promise<{ id: string; name: string }[]> {
  const categories = task === "image"
    ? ["text-to-image", "image-to-image"]
    : task === "video"
      ? ["text-to-video", "image-to-video"]
      : [];
  if (!categories.length) return [];

  const results = await Promise.all(categories.map(async (category) => {
    const url = `${baseUrl.replace(/\/$/, "")}/models?limit=50&status=active&category=${encodeURIComponent(category)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { headers: { Authorization: `Key ${apiKey}` }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json: any = await res.json();
      return (json.models ?? []).map((m: any) => ({
        id: m.endpoint_id ?? m.id,
        name: m.metadata?.display_name ?? m.endpoint_id ?? m.id,
      })).filter((m: any) => m.id);
    } finally {
      clearTimeout(t);
    }
  }));

  const seen = new Set<string>();
  return results.flat().filter((m) => !seen.has(m.id) && seen.add(m.id));
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
          serviceAccountJson: body.serviceAccountJson || null,
          baseUrl: body.baseUrl || null,
          projectId: body.projectId || null,
          location: body.location || null,
          model: body.model || null,
          configId: body.configId || null,
          name: body.name || null,
          isDefault,
        } as any)
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
      if (body.serviceAccountJson !== undefined) patch.serviceAccountJson = body.serviceAccountJson || null;
      if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl || null;
      if (body.projectId !== undefined) patch.projectId = body.projectId || null;
      if (body.location !== undefined) patch.location = body.location || null;
      if (body.model !== undefined) patch.model = body.model || null;
      if (body.configId !== undefined) patch.configId = body.configId || null;
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
      // ponytail: clear prefs referencing deleted config — fallback to default
      try {
        const [pref] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, request.session!.user.id));
        if (pref) {
          const patch: any = {};
          if (pref.videoConfigId === request.params.id) patch.videoConfigId = null;
          if (pref.imageConfigId === request.params.id) patch.imageConfigId = null;
          if (pref.textConfigId === request.params.id) patch.textConfigId = null;
          if (Object.keys(patch).length) {
            patch.updatedAt = new Date().toISOString();
            await db.update(aiPreferences).set(patch).where(eq(aiPreferences.userId, request.session!.user.id));
          }
        }
      } catch {}
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
      if (!request.session) return;
      const { provider, task = "text", configId, apiKey: qApiKey, baseUrl: qBaseUrl, q } = request.query as any;
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
        } else if (curatedModels(provider, task).length) {
          // no key yet — show curated fallback so dropdown is not empty
          let list = curatedModels(provider, task);
          if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
          return list.slice(0, 50);
        } else {
          // ponytail: onboarding calls this before POST /ai/configs — return 200 [] so ModelSelector can fallback to manual entry
          return [];
        }
      }

      const cacheKey = `${provider}|${task}|${apiKey ?? ""}|${baseUrl ?? ""}|${q ?? ""}`;
      const cached = modelCache.get(cacheKey);
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;

      try {
        let list: { id: string; name: string }[] = [];
        if (provider === "ollama") {
          list = await fetchOllamaModels(baseUrl || "http://localhost:11434");
        } else if (provider === "openai" || provider === "openrouter" || provider === "custom" || provider === "xai" || provider === "runway" || provider === "vertex" || provider === "fal" || provider === "luma") {
          if (!apiKey) {
            // ponytail: no key — show curated if available so dropdown not empty
            if (curatedModels(provider, task).length) {
              let list = curatedModels(provider, task);
              if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
              const out = list.slice(0, 50);
              modelCache.set(cacheKey, { at: Date.now(), data: out });
              return out;
            }
            return [];
          }
          if (provider === "runway" || provider === "vertex" || provider === "luma") {
            list = curatedModels(provider, task);
          } else if (provider === "fal") {
            list = await fetchFalModels(baseUrl || "https://api.fal.ai/v1", apiKey, task);
          } else {
            const defaultBase =
              provider === "openai"
                ? "https://api.openai.com/v1"
                : provider === "openrouter"
                  ? "https://openrouter.ai/api/v1"
                  : provider === "xai"
                    ? "https://api.x.ai/v1"
                    : baseUrl || "https://api.openai.com/v1";
            const urlBase = baseUrl || defaultBase;
            list = provider === "openrouter"
              ? await fetchOpenRouterModels(urlBase, apiKey, task)
              : await fetchOpenAiModels(urlBase, apiKey);
          }
        }
        if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
        const out = list.slice(0, 50);
        modelCache.set(cacheKey, { at: Date.now(), data: out });
        return out;
      } catch (e: any) {
        request.log.warn({ err: e, provider }, "model fetch failed");
        // ponytail: on fetch fail, fall back to curated if exists, else empty
        if (curatedModels(provider, task).length) {
          let list = curatedModels(provider, task);
          if (q) list = list.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()));
          return list.slice(0, 50);
        }
        return [];
      }
    },
  );

  // ---------- preferences (provider+model independent) ----------
  r.get(
    "/ai/preferences",
    { preHandler: requireSession, schema: { response: { 200: preferencesSchema } } },
    async (request) => {
      try {
        const [pref] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, request.session!.user.id));
        return {
          videoConfigId: (pref as any)?.videoConfigId ?? pref?.videoConfigId ?? null,
          videoModel: (pref as any)?.videoModel ?? null,
          imageConfigId: (pref as any)?.imageConfigId ?? pref?.imageConfigId ?? null,
          imageModel: (pref as any)?.imageModel ?? null,
          textConfigId: (pref as any)?.textConfigId ?? pref?.textConfigId ?? null,
          textModel: (pref as any)?.textModel ?? null,
        } as any;
      } catch { return { videoConfigId: null, videoModel: null, imageConfigId: null, imageModel: null, textConfigId: null, textModel: null } as any; }
    },
  );

  r.put(
    "/ai/preferences",
    { preHandler: requireSession, schema: { body: updatePreferencesSchema, response: { 200: preferencesSchema, 400: errorResponseSchema, 500: errorResponseSchema } } },
    async (request, reply) => {
      const body = request.body as any;
      const patch: any = { updatedAt: new Date().toISOString() };
      const pairs: [string, string][] = [
        ["videoConfigId", "videoModel"],
        ["imageConfigId", "imageModel"],
        ["textConfigId", "textModel"],
      ];
      for (const [idKey, modelKey] of pairs) {
        if (body[idKey] !== undefined) {
          if (body[idKey] === null) {
            patch[idKey] = null;
            // if provider cleared, also clear model unless explicitly set
            if (body[modelKey] === undefined) patch[modelKey] = null;
          } else {
            const [cfg] = await db.select().from(aiConfigs).where(and(eq(aiConfigs.id, body[idKey]), eq(aiConfigs.userId, request.session!.user.id)));
            if (!cfg) return reply.status(400).send({ error: `${idKey} not found` } as any);
            patch[idKey] = body[idKey];
          }
        }
        if (body[modelKey] !== undefined) {
          const v = body[modelKey];
          if (v === null || v === "") patch[modelKey] = null;
          else patch[modelKey] = String(v).slice(0, 255);
        }
        // validate pair completeness: if one set without the other, error when model empty but id set
        if (patch[idKey] !== undefined || patch[modelKey] !== undefined) {
          // let partial saves through — required check is done at generation time; onboarding will validate all three
        }
      }
      try {
        const [existing] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, request.session!.user.id));
        if (!existing) {
          const [row] = await db
            .insert(aiPreferences)
            .values({
              userId: request.session!.user.id,
              videoConfigId: patch.videoConfigId ?? null,
              videoModel: patch.videoModel ?? null,
              imageConfigId: patch.imageConfigId ?? null,
              imageModel: patch.imageModel ?? null,
              textConfigId: patch.textConfigId ?? null,
              textModel: patch.textModel ?? null,
            } as any)
            .returning();
          return {
            videoConfigId: (row as any).videoConfigId ?? null,
            videoModel: (row as any).videoModel ?? null,
            imageConfigId: (row as any).imageConfigId ?? null,
            imageModel: (row as any).imageModel ?? null,
            textConfigId: (row as any).textConfigId ?? null,
            textModel: (row as any).textModel ?? null,
          } as any;
        } else {
          const [row] = await db.update(aiPreferences).set(patch as any).where(eq(aiPreferences.userId, request.session!.user.id)).returning();
          return {
            videoConfigId: (row as any).videoConfigId ?? null,
            videoModel: (row as any).videoModel ?? null,
            imageConfigId: (row as any).imageConfigId ?? null,
            imageModel: (row as any).imageModel ?? null,
            textConfigId: (row as any).textConfigId ?? null,
            textModel: (row as any).textModel ?? null,
          } as any;
        }
      } catch (e: any) {
        try {
          await db.run(
            // @ts-ignore
            `CREATE TABLE IF NOT EXISTS ai_preferences (user_id TEXT PRIMARY KEY, video_config_id TEXT, video_model TEXT, image_config_id TEXT, image_model TEXT, text_config_id TEXT, text_model TEXT, updated_at TEXT NOT NULL)`,
          );
          const [row] = await db
            .insert(aiPreferences)
            .values({
              userId: request.session!.user.id,
              videoConfigId: patch.videoConfigId ?? null,
              videoModel: patch.videoModel ?? null,
              imageConfigId: patch.imageConfigId ?? null,
              imageModel: patch.imageModel ?? null,
              textConfigId: patch.textConfigId ?? null,
              textModel: patch.textModel ?? null,
            } as any)
            .returning();
          return {
            videoConfigId: (row as any).videoConfigId ?? null,
            videoModel: (row as any).videoModel ?? null,
            imageConfigId: (row as any).imageConfigId ?? null,
            imageModel: (row as any).imageModel ?? null,
            textConfigId: (row as any).textConfigId ?? null,
            textModel: (row as any).textModel ?? null,
          } as any;
        } catch {
          return reply.status(500).send({ error: "failed to save preferences" } as any);
        }
      }
    },
  );

  // ---------- onboarding progress (resume) ----------
  r.get(
    "/ai/onboarding/progress",
    { preHandler: requireSession, schema: { response: { 200: onboardingProgressResponseSchema, 500: errorResponseSchema } } },
    async (request, reply) => {
      try {
        const { onboardingProgress } = await import("../../db/schema");
        const [row] = await db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, request.session!.user.id));
        if (!row) return { step: "1", data: null, updatedAt: new Date().toISOString() } as any;
        return { step: row.step, data: row.data, updatedAt: row.updatedAt } as any;
      } catch (e: any) {
        try {
          await db.run(`CREATE TABLE IF NOT EXISTS onboarding_progress (user_id TEXT PRIMARY KEY, step TEXT NOT NULL DEFAULT '1', data TEXT, updated_at TEXT NOT NULL)` as any);
          return { step: "1", data: null, updatedAt: new Date().toISOString() } as any;
        } catch { return reply.status(500).send({ error: "failed" } as any); }
      }
    },
  );

  const saveOnboardingProgress = async (request: any, reply: any) => {
    const body = request.body as any;
    const step = String(body.step ?? "1");
    const data = body.data ? JSON.stringify(body.data) : null;
    try {
      const { onboardingProgress } = await import("../../db/schema");
      const [existing] = await db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, request.session!.user.id));
      if (!existing) {
        const [row] = await db.insert(onboardingProgress).values({ userId: request.session!.user.id, step, data, updatedAt: new Date().toISOString() } as any).returning();
        return { step: row.step, data: row.data, updatedAt: row.updatedAt } as any;
      } else {
        const [row] = await db.update(onboardingProgress).set({ step, data, updatedAt: new Date().toISOString() } as any).where(eq(onboardingProgress.userId, request.session!.user.id)).returning();
        return { step: row.step, data: row.data, updatedAt: row.updatedAt } as any;
      }
    } catch {
      try {
        await db.run(`CREATE TABLE IF NOT EXISTS onboarding_progress (user_id TEXT PRIMARY KEY, step TEXT NOT NULL DEFAULT '1', data TEXT, updated_at TEXT NOT NULL)` as any);
        const { onboardingProgress } = await import("../../db/schema");
        const [row] = await db.insert(onboardingProgress).values({ userId: request.session!.user.id, step, data, updatedAt: new Date().toISOString() } as any).returning();
        return { step: row.step, data: row.data, updatedAt: row.updatedAt } as any;
      } catch { return reply.status(500).send({ error: "failed" } as any); }
    }
  };

  const onboardingProgressPutOptions = {
    preHandler: requireSession,
    schema: { body: onboardingProgressSchema, response: { 200: onboardingProgressResponseSchema, 500: errorResponseSchema } },
  };

  // Keep the legacy path while exposing the same /ai namespace used by the frontend proxy.
  r.put("/ai/onboarding/progress", onboardingProgressPutOptions, saveOnboardingProgress);
  r.put("/onboarding/progress", onboardingProgressPutOptions, saveOnboardingProgress);

  // ponytail: persona-driven content generation — user only picks a content type; the brand persona drives everything
  r.post(
    "/ai/generate-content",
    {
      preHandler: requireSession,
      schema: { body: generateContentBodySchema, response: { 200: generatedContentSchema, 400: errorResponseSchema, 404: errorResponseSchema, 502: errorResponseSchema } },
    },
    async (request, reply) => {
      const { type, companyId } = request.body;
      const userId = request.session!.user.id;

      const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      if (!company.persona)
        return reply.status(400).send({ error: "This brand has no persona yet — complete onboarding to generate it first." } as any);

      let model;
      try {
        model = await resolveUserModel(userId, "text");
      } catch (e: any) {
        return reply.status(400).send({ error: e?.message || "No AI provider configured" } as any);
      }

      const agent = new (await import("@mastra/core/agent")).Agent({
        id: "content-planner-agent",
        name: "content-planner-agent",
        instructions:
          "You are GeoAlt's content strategist. You plan brand content strictly from the brand's persona — audience, voice, values, pain points and positioning. Always respond with a single valid JSON object and nothing else — no markdown, no commentary.",
        model: model as any,
      });

      let res;
      try {
        res = await agent.generate(
          `Brand: ${company.name}\n` +
            `Brand persona:\n"""${company.persona.slice(0, 6000)}"""\n\n` +
            `Content type to plan: ${KIND_LABELS[type]}\n\n` +
            `Plan ONE fresh piece of content of this type that fits this brand's audience, voice and positioning. Respond with ONLY this JSON shape:\n` +
            `{"title": string, "summary": string, "platforms": string[], "aiScore": number}\n` +
            `- title: catchy working title in the brand's voice, at most 90 characters\n` +
            `- summary: 1-2 sentence description of what the content will be, at most 220 characters\n` +
            `- platforms: 1-3 values from ${JSON.stringify(VALID_PLATFORMS)} that best fit this brand and content type\n` +
            `- aiScore: integer 0-100 estimating AI visibility / relevance potential for this topic`,
        );
      } catch (e: any) {
        request.log.warn({ err: e }, "content generation failed");
        return reply.status(502).send({ error: e?.message || "content generation failed" } as any);
      }

      try {
        const parsed = extractJson(res.text);
        const platforms = Array.isArray(parsed.platforms)
          ? (parsed.platforms as unknown[]).filter((p): p is string => typeof p === "string" && VALID_PLATFORMS.includes(p))
          : [];
        const aiScore = Math.max(0, Math.min(100, Math.round(Number(parsed.aiScore ?? 60) || 60)));
        return {
          title: String(parsed.title || "Untitled content").slice(0, 120),
          summary: String(parsed.summary || "Planned from your brand persona.").slice(0, 300),
          platforms: [...new Set(platforms)].slice(0, 3),
          aiScore,
        };
      } catch (e: any) {
        request.log.warn({ err: e }, "could not parse generated content JSON");
        return reply.status(502).send({ error: "AI returned an unusable response — try again" } as any);
      }
    },
  );
}
