import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../../lib/db";
import { companies, influencers } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { createMediaJob, pollMediaJob } from "../media/media.service";
import {
  companyIdParamsSchema,
  createInfluencerSchema,
  errorResponseSchema,
  influencerIdParamsSchema,
  influencerResponseSchema,
  previewInfluencerSchema,
  previewResponseSchema,
} from "./influencer.schemas";
import { INFLUENCER_SYSTEM_PROMPT } from '../../../data/prompts/image'

async function ensureTable() {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS influencer (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, company_id TEXT NOT NULL, name TEXT NOT NULL, image_url TEXT NOT NULL, prompt TEXT, attributes TEXT, source TEXT NOT NULL DEFAULT 'generated', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` as any);
    // ensure index
    try { await db.run(`CREATE INDEX IF NOT EXISTS idx_influencer_company ON influencer(company_id)` as any); } catch { }
  } catch { }
}

export function buildPrompt(attrs: any, custom?: string) {
  if (custom?.trim()) return custom.trim().slice(0, 5000);
  const parts = [
    "photorealistic portrait",
    attrs.gender ? `${attrs.gender}` : "",
    attrs.ageRange ? `age ${attrs.ageRange}` : "",
    attrs.ethnicity ? `${attrs.ethnicity}` : "",
    attrs.hairStyle ? `${attrs.hairStyle} hair` : "",
    attrs.eyeColor ? `${attrs.eyeColor} eyes` : "",
    attrs.clothing ? `wearing ${attrs.clothing}` : "",
    attrs.background ? `${attrs.background} background` : "",
    attrs.vibe ? `${attrs.vibe} vibe` : "",
    attrs.pose ? `${attrs.pose} pose` : "",
  ].filter(Boolean).join(", ");
  // ponytail: style prompt forbids studio lighting — tail dropped, style + attrs only
  return `${INFLUENCER_SYSTEM_PROMPT}\n${parts}`.slice(0, 5000);
}

async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

function mediaDir() { return path.join(process.cwd(), "data", "media"); }

async function saveDataUri(dataUri: string, name: string): Promise<string> {
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("invalid imageData (expected data URI)");
  const ext = m[1].includes("png") ? "png" : m[1].includes("webp") ? "webp" : "jpg";
  const dir = mediaDir();
  await mkdir(dir, { recursive: true });
  const filename = `influencer_${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.${ext}`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, Buffer.from(m[2], "base64"));
  return `/media/files/${filename}`;
}



export async function influencerRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  await ensureTable();

  r.get("/companies/:companyId/influencers", {
    preHandler: requireSession,
    schema: { params: companyIdParamsSchema, response: { 200: z.array(influencerResponseSchema), 404: errorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    await ensureTable();
    const company = await assertCompany(request, request.params.companyId);
    if (!company) return reply.status(404).send({ error: "Company not found" } as any);
    let rows: any[];
    try {
      rows = await db.select().from(influencers).where(and(eq(influencers.companyId, request.params.companyId), eq(influencers.userId, request.session.user.id))).orderBy(desc(influencers.createdAt));
    } catch (e: any) {
      if (String(e?.message).includes("no such table") || String(e?.message).includes("no such column")) {
        await ensureTable();
        rows = await db.select().from(influencers).where(and(eq(influencers.companyId, request.params.companyId), eq(influencers.userId, request.session.user.id))).orderBy(desc(influencers.createdAt));
      } else throw e;
    }
    return rows.map((row: any) => ({ ...row, attributes: row.attributes ? JSON.parse(row.attributes) : null })) as any;
  });

  r.post("/companies/:companyId/influencers/preview", {
    preHandler: requireSession,
    schema: { params: companyIdParamsSchema, body: previewInfluencerSchema, response: { 200: previewResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 502: errorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    const body = request.body as any;
    // ponytail: verbose preview logs, remove after incident
    request.log.info({ companyId: (request.params as any).companyId, userId: (request.session as any)?.user?.id, contentType: request.headers["content-type"], bodyKeys: body ? Object.keys(body) : null, attributes: body?.attributes, promptLen: body?.prompt?.length ?? 0, rawBody: JSON.stringify(body).slice(0, 2000) }, "influencer preview: incoming");
    const company = await assertCompany(request, request.params.companyId);
    if (!company) {
      request.log.warn({ companyId: request.params.companyId, userId: (request.session as any)?.user?.id, body }, "influencer preview: company not found");
      return reply.status(404).send({ error: "Company not found" } as any);
    }
    request.log.info({ companyId: request.params.companyId, companyName: (company as any).name, userId: (request.session as any)?.user?.id }, "influencer preview: company ok");
    const prompt = buildPrompt(body.attributes || {}, body.prompt);
    request.log.info({ promptLen: prompt.length, promptPreview: prompt.slice(0, 300) }, "influencer preview: prompt built");
    let job: any = null;
    try {
      request.log.info({ userId: request.session.user.id, companyId: request.params.companyId, promptLen: prompt.length }, "influencer preview: createMediaJob start");
      job = await createMediaJob({
        userId: request.session.user.id,
        companyId: request.params.companyId,
        contentId: null,
        task: "image",
        prompt,
        format: "vertical" as any,
      });
      request.log.info({ jobId: job.id, configId: (job as any).configId, provider: (job as any).provider, model: (job as any).model, status: (job as any).status }, "influencer preview: job created");
      // poll until done — 1s ticks: OpenRouter image models can take 60-90s
      let outputUrl: string | null = null;
      for (let i = 0; i < 150; i++) {
        request.log.info({ iter: i, jobId: job.id }, "influencer preview: poll tick");
        const fresh = await pollMediaJob(job.id);
        request.log.info({ iter: i, jobId: job.id, status: (fresh as any).status, providerTaskId: (fresh as any).providerTaskId, hasOutput: !!(fresh as any).outputUrl, errorPreview: String((fresh as any).error ?? "").slice(0, 500) }, "influencer preview: poll result");
        if (fresh.status === "completed" && fresh.outputUrl) { outputUrl = fresh.outputUrl; break; }
        if (fresh.status === "failed") {
          request.log.error({ jobId: job.id, error: (fresh as any).error }, "influencer preview: provider failed");
          throw new Error(fresh.error || "image generation failed");
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!outputUrl) {
        request.log.error({ jobId: job.id }, "influencer preview: timed out after 150 polls");
        throw new Error("image generation timed out — try again");
      }
      // download to local /media/files for preview (reuse mediaJobs attach logic but not tied to content)
      request.log.info({ outputUrlPrefix: outputUrl.slice(0, 120), jobId: job.id }, "influencer preview: download start");
      let previewUrl = outputUrl;
      try {
        // if outputUrl is remote, download to data/media and serve locally for dialog
        if (!outputUrl.startsWith("data:")) {
          const dir = mediaDir();
          await mkdir(dir, { recursive: true });
          const filename = `influencer_preview_${Date.now()}.png`;
          const fp = path.join(dir, filename);
          if (outputUrl.startsWith("http")) {
            const res = await fetch(outputUrl);
            request.log.info({ filename, status: (res as any).status, ok: (res as any).ok, jobId: job.id }, "influencer preview: http fetch result");
            if (res.ok) {
              await writeFile(fp, Buffer.from(await res.arrayBuffer()));
              previewUrl = `/media/files/${filename}`;
              request.log.info({ filename, previewUrl, jobId: job.id }, "influencer preview: saved http image");
            } else {
              request.log.warn({ status: (res as any).status, statusText: (res as any).statusText, url: outputUrl.slice(0, 200), jobId: job.id }, "influencer preview: fetch failed");
            }
          } else if (outputUrl.startsWith("data:")) {
            const m = outputUrl.match(/^data:[^;]+;base64,(.*)$/);
            if (m) { await writeFile(fp, Buffer.from(m[1], "base64")); previewUrl = `/media/files/${filename}`; request.log.info({ filename, previewUrl, jobId: job.id }, "influencer preview: saved data uri (non-data branch)"); }
          }
        } else {
          const dir = mediaDir();
          await mkdir(dir, { recursive: true });
          const filename = `influencer_preview_${Date.now()}.png`;
          const fp = path.join(dir, filename);
          const m = outputUrl.match(/^data:[^;]+;base64,(.*)$/);
          if (m) { await writeFile(fp, Buffer.from(m[1], "base64")); previewUrl = `/media/files/${filename}`; request.log.info({ filename, previewUrl, jobId: job.id }, "influencer preview: saved data uri"); }
        }
      } catch (dlErr: any) {
        request.log.warn({ err: dlErr, jobId: job.id, outputUrlPrefix: outputUrl.slice(0, 120) }, "influencer preview: download failed, returning raw outputUrl");
      }
      request.log.info({ previewUrl, promptLen: prompt.length, jobId: job.id }, "influencer preview: success");
      return { previewUrl, prompt } as any;
    } catch (e: any) {
      const msg = String(e?.message ?? "preview failed");
      request.log.warn({ err: e, stack: e?.stack?.slice(0, 2000), body: JSON.stringify(body).slice(0, 2000), companyId: request.params.companyId, userId: (request.session as any)?.user?.id, jobId: job?.id, promptPreview: prompt.slice(0, 300) }, "influencer preview failed");
      if (msg.includes("Configure")) {
        request.log.warn({ msg, body, jobId: job?.id }, "influencer preview: missing AI config");
        return reply.status(400).send({ error: msg } as any);
      }
      return reply.status(502).send({ error: msg.slice(0, 2000) } as any);
    }
  });

  r.post("/companies/:companyId/influencers", {
    preHandler: requireSession,
    schema: { params: companyIdParamsSchema, body: createInfluencerSchema, response: { 201: influencerResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    await ensureTable();
    const company = await assertCompany(request, request.params.companyId);
    if (!company) return reply.status(404).send({ error: "Company not found" } as any);
    const body = request.body as any;
    let imageUrl: string;
    if (body.imageData) {
      try { imageUrl = await saveDataUri(body.imageData, body.name); } catch (e: any) { return reply.status(400).send({ error: e.message } as any); }
    } else if (body.imageUrl) {
      // if remote url, download and re-host locally for consistent serving
      if (body.imageUrl.startsWith("/media/files/")) {
        imageUrl = body.imageUrl;
      } else if (body.imageUrl.startsWith("http") || body.imageUrl.startsWith("data:")) {
        try {
          if (body.imageUrl.startsWith("data:")) {
            imageUrl = await saveDataUri(body.imageUrl, body.name);
          } else {
            const dir = mediaDir(); await mkdir(dir, { recursive: true });
            const filename = `influencer_${Date.now()}.png`;
            const fp = path.join(dir, filename);
            const res = await fetch(body.imageUrl);
            if (!res.ok) throw new Error("failed to fetch imageUrl");
            await writeFile(fp, Buffer.from(await res.arrayBuffer()));
            imageUrl = `/media/files/${filename}`;
          }
        } catch { imageUrl = body.imageUrl; }
      } else {
        imageUrl = body.imageUrl;
      }
    } else {
      return reply.status(400).send({ error: "image required" } as any);
    }
    const prompt = body.prompt ?? null;
    const attributes = body.attributes ? JSON.stringify(body.attributes) : null;
    const source = body.source ?? (body.imageData && !prompt ? "upload" : "generated");
    const now = new Date().toISOString();
    const [row] = await db.insert(influencers).values({
      userId: request.session.user.id,
      companyId: request.params.companyId,
      name: body.name,
      imageUrl,
      prompt,
      attributes,
      source,
      createdAt: now,
      updatedAt: now,
    } as any).returning();
    return { ...row, attributes: row.attributes ? JSON.parse(row.attributes) : null } as any;
  });

  r.delete("/influencers/:id", {
    preHandler: requireSession,
    schema: { params: influencerIdParamsSchema, response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    await ensureTable();
    const rows = await db.delete(influencers).where(and(eq(influencers.id, request.params.id), eq(influencers.userId, request.session.user.id))).returning({ id: influencers.id });
    if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
    return { success: true };
  });
}
