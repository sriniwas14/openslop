import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies, contents } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { resolveUserModel } from "../company/company.workflow";
import { queueContentMedia } from "../media/media.service";
import {
  carouselImageSchema,
  companyIdParamsSchema,
  contentIdParamsSchema,
  contentKinds,
  contentListQuerySchema,
  contentResponseSchema,
  createContentSchema,
  errorResponseSchema,
  generateFromIdeaSchema,
  ideaSchema,
  ideasBodySchema,
  ideasResponseSchema,
  parseContentRow,
  scriptSchema,
  serializeContentInput,
  updateContentSchema,
} from "./content.schemas";

// ponytail: models sometimes wrap JSON in markdown fences — extract first { ... }
function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model response");
  return JSON.parse(raw.slice(start, end + 1));
}

async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

// body without companyId – company comes from URL (ponytail: single source of truth)
// note: can't use .omit on refined schema (zod v4 throws) — rebuild from base fields
const createContentBodySchema = z
  .object({
    kind: z.enum(contentKinds),
    title: z.string().min(1).max(255),
    status: z.enum(["draft", "published"]).default("draft").optional(),
    images: z.array(carouselImageSchema).max(20).optional(),
    scripts: z.array(scriptSchema).max(50).optional(),
    format: z.enum(["vertical", "horizontal"]).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((v: any, ctx: any) => {
    if (v.kind === "carousel") {
      if (!v.images || v.images.length === 0) ctx.addIssue({ code: "custom", path: ["images"], message: "images required for carousel" });
      if (v.scripts) ctx.addIssue({ code: "custom", path: ["scripts"], message: "scripts not allowed for carousel" });
      if (v.format) ctx.addIssue({ code: "custom", path: ["format"], message: "format not allowed for carousel" });
    }
    if ((["talkinghead", "greenscreen"] as readonly string[]).includes(v.kind)) {
      if (!v.scripts || v.scripts.length === 0) ctx.addIssue({ code: "custom", path: ["scripts"], message: "scripts required for talkinghead/greenscreen" });
      if (!v.format) ctx.addIssue({ code: "custom", path: ["format"], message: "format required for talkinghead/greenscreen" });
      if (v.images) ctx.addIssue({ code: "custom", path: ["images"], message: "images not allowed for video types" });
    }
  });

export async function contentRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---------- CRUD — scoped to company ----------

  r.get(
    "/companies/:companyId/contents",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: contentListQuerySchema,
        response: { 200: z.array(contentResponseSchema), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const q = request.query as z.infer<typeof contentListQuerySchema>;
      let where = and(eq(contents.userId, request.session!.user.id), eq(contents.companyId, request.params.companyId));
      if (q.kind) where = and(where, eq(contents.kind, q.kind)) as any;
      if (q.status) where = and(where, eq(contents.status, q.status)) as any;
      const rows = await db.select().from(contents).where(where).orderBy(desc(contents.createdAt));
      return rows.map(parseContentRow) as any;
    },
  );

  r.post(
    "/companies/:companyId/contents",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: createContentBodySchema,
        response: { 201: contentResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      // re-inject companyId for validation + serialization
      const full = { ...(request.body as any), companyId: request.params.companyId };
      const parsed = createContentSchema.safeParse(full);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "validation failed" } as any);
      const data = serializeContentInput(parsed.data);
      const [row] = await db
        .insert(contents)
        .values({
          userId: request.session!.user.id,
          companyId: request.params.companyId,
          kind: data.kind,
          title: data.title,
          status: data.status,
          images: data.images as any,
          scripts: data.scripts as any,
          mediaUrl: null,
          format: data.format as any,
          scheduledAt: data.scheduledAt as any,
        })
        .returning();
      const parsedRow = parseContentRow(row as any) as any;
      void queueContentMedia({ userId: request.session!.user.id, companyId: request.params.companyId, contentId: row.id, kind: row.kind, images: parsedRow.images, scripts: parsedRow.scripts, format: row.format as any });
      return reply.status(201).send(parsedRow);
    },
  );

  r.get(
    "/contents/:id",
    {
      preHandler: requireSession,
      schema: {
        params: contentIdParamsSchema,
        response: { 200: contentResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const [row] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, request.params.id), eq(contents.userId, request.session!.user.id)));
      if (!row) return reply.status(404).send({ error: "Not found" } as any);
      return parseContentRow(row as any) as any;
    },
  );

  r.patch(
    "/contents/:id",
    {
      preHandler: requireSession,
      schema: {
        params: contentIdParamsSchema,
        body: updateContentSchema,
        response: { 200: contentResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const [existing] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, request.params.id), eq(contents.userId, request.session!.user.id)));
      if (!existing) return reply.status(404).send({ error: "Not found" } as any);

      const patch = request.body as any;
      // if companyId in patch, verify it belongs to user
      if (patch.companyId) {
        const c = await assertCompany(request, patch.companyId);
        if (!c) return reply.status(404).send({ error: "Company not found" } as any);
      }

      // merge for cross-field validation
      const existingParsed = parseContentRow(existing as any);
      const merged: any = {
        companyId: patch.companyId ?? existing.companyId,
        kind: patch.kind ?? existing.kind,
        title: patch.title ?? existing.title,
        status: patch.status ?? existing.status,
        images: patch.images !== undefined ? patch.images : existingParsed.images,
        scripts: patch.scripts !== undefined ? patch.scripts : existingParsed.scripts,
        format: patch.format !== undefined ? patch.format : existingParsed.format,
        scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : (existing as any).scheduledAt,
      };
      if (merged.scheduledAt === null) merged.scheduledAt = null;
      // normalize nulls to undefined for zod
      if (merged.images === null) delete merged.images;
      if (merged.scripts === null) delete merged.scripts;
      if (merged.format === null) delete merged.format;

      const v = createContentSchema.safeParse(merged);
      if (!v.success) return reply.status(400).send({ error: v.error.issues[0]?.message ?? "validation failed" } as any);

      const serialized: any = {};
      if (patch.title !== undefined) serialized.title = patch.title;
      if (patch.kind !== undefined) serialized.kind = patch.kind;
      if (patch.status !== undefined) serialized.status = patch.status;
      if (patch.companyId !== undefined) serialized.companyId = patch.companyId;
      if (patch.format !== undefined) serialized.format = patch.format;
      if (patch.images !== undefined) serialized.images = patch.images ? JSON.stringify(patch.images) : null;
      if (patch.scripts !== undefined) serialized.scripts = patch.scripts ? JSON.stringify(patch.scripts) : null;
      if (patch.scheduledAt !== undefined) serialized.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : null;
      serialized.updatedAt = new Date().toISOString();

      const [row] = await db
        .update(contents)
        .set(serialized)
        .where(and(eq(contents.id, request.params.id), eq(contents.userId, request.session!.user.id)))
        .returning();
      return parseContentRow(row as any) as any;
    },
  );

  r.delete(
    "/contents/:id",
    {
      preHandler: requireSession,
      schema: {
        params: contentIdParamsSchema,
        response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const rows = await db
        .delete(contents)
        .where(and(eq(contents.id, request.params.id), eq(contents.userId, request.session!.user.id)))
        .returning({ id: contents.id });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      return { success: true };
    },
  );

  // ---------- ideas (transient, no DB) ----------

  r.post(
    "/companies/:companyId/ideas",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: ideasBodySchema,
        response: { 200: ideasResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 502: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      if (!company.persona) return reply.status(400).send({ error: "This brand has no persona yet — complete onboarding first." } as any);

      const { kind, count } = request.body as z.infer<typeof ideasBodySchema>;
      // ponytail: task routing — carousel=image, video kinds=video
      const task = kind === "carousel" ? "image" as const : kind ? "video" as const : "text" as const;
      let model;
      try {
        model = await resolveUserModel(request.session!.user.id, task);
      } catch (e: any) {
        return reply.status(400).send({ error: e?.message || "No AI provider configured" } as any);
      }
      const n = Math.max(3, Math.min(10, count ?? 5));
      const kindHint = kind ? `Content kind: ${kind} (carousel = multi-slide/social, talkinghead = presenter video, greenscreen = green-screen overlay video). Tailor ideas to this format.` : "Mix across carousel, talkinghead, greenscreen.";

      const agent = new (await import("@mastra/core/agent")).Agent({
        id: "ideas-agent",
        name: "ideas-agent",
        instructions:
          "You are GeoAlt's ideas strategist. You generate ideas strictly from the brand's persona — audience, voice, values, pain points, positioning. Always respond with a single valid JSON object and nothing else — no markdown, no commentary.",
        model: model as any,
      });

      let res;
      try {
        res = await agent.generate(
          `Brand: ${company.name}\nBrand persona:\n"""${company.persona!.slice(0, 6000)}"""\n\n${kindHint}\n\nGenerate ${n} fresh content ideas that target distinct pain points from the persona. Respond with ONLY this JSON shape:\n` +
            `{"ideas":[{"title": string, "painPoint": string, "hooks": string[3], "angle": string}]}\n` +
            `- title: catchy working title in brand voice, <=90 chars\n` +
            `- painPoint: one specific pain point this idea addresses from the persona, <=160 chars\n` +
            `- hooks: exactly 3 distinct opening hook options for the video/carousel (first line viewer sees), each 8-18 words, punchy, different angles\n` +
            `- angle: 1 sentence describing the creative angle, <=140 chars`,
        );
      } catch (e: any) {
        request.log.warn({ err: e }, "ideas generation failed");
        return reply.status(502).send({ error: e?.message || "ideas generation failed" } as any);
      }

      try {
        const parsed = extractJson(res.text);
        const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
        const ideas = rawIdeas.slice(0, n).map((it: any) => ({
          id: crypto.randomUUID(),
          title: String(it.title || "Untitled idea").slice(0, 120),
          painPoint: String(it.painPoint || it.pain_point || "General audience pain point").slice(0, 500),
          hooks: (Array.isArray(it.hooks) ? it.hooks : []).slice(0, 5).map((h: any) => String(h).slice(0, 280)).filter(Boolean),
          angle: it.angle ? String(it.angle).slice(0, 500) : undefined,
        }));
        // ensure 3 hooks each
        for (const idea of ideas) {
          while (idea.hooks.length < 3) idea.hooks.push(`${idea.title} — hook ${idea.hooks.length + 1}`);
          idea.hooks = idea.hooks.slice(0, 3);
        }
        const validated = z.array(ideaSchema).safeParse(ideas);
        if (!validated.success) throw new Error(validated.error.issues[0]?.message);
        return { ideas: validated.data } as any;
      } catch (e: any) {
        request.log.warn({ err: e }, "could not parse ideas JSON");
        return reply.status(502).send({ error: "AI returned an unusable response — try again" } as any);
      }
    },
  );

  // ---------- generate content from selected idea ----------
  r.post(
    "/companies/:companyId/contents/generate",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: generateFromIdeaSchema,
        response: { 201: contentResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 502: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      if (!company.persona) return reply.status(400).send({ error: "This brand has no persona yet" } as any);

      const body = request.body as z.infer<typeof generateFromIdeaSchema>;
      const idea = body.idea;
      if (!idea) return reply.status(400).send({ error: "idea payload required (transient ideas — send the picked idea back)" } as any);

      const kind = (body.kind ?? (idea as any).kind ?? "talkinghead") as z.infer<typeof ideaSchema> extends any ? string : never;
      // validate kind fallback
      const finalKind = (["carousel", "talkinghead", "greenscreen"] as const).includes(kind as any) ? kind : "talkinghead";
      const title = (body.title ?? idea.title).slice(0, 255);
      const selectedHook = body.selectedHook;

      const task = finalKind === "carousel" ? "image" as const : "video" as const;
      let model;
      try {
        model = await resolveUserModel(request.session!.user.id, task);
      } catch (e: any) {
        return reply.status(400).send({ error: e?.message || "No AI provider configured" } as any);
      }

      const agent = new (await import("@mastra/core/agent")).Agent({
        id: "script-agent",
        name: "script-agent",
        instructions:
          "You are GeoAlt's scriptwriter. You write full scripts from a selected idea and hook, staying true to the brand persona. Always respond with a single valid JSON object and nothing else.",
        model: model as any,
      });

      // kind-specific output shape
      const shapeHint =
        finalKind === "carousel"
          ? `{"title": string, "images": [{"url": string (use https://picsum.photos/seed/<slug>/1080/1080 as placeholder if no real asset), "text": string}] (4-7 slides)}`
          : `{"title": string, "scripts": [{"type": "aroll"|"broll", "prompt": string}] (3-5 beats, at least one aroll), "format": "vertical"|"horizontal"}`;

      let res;
      try {
        res = await agent.generate(
          `Brand: ${company.name}\nPersona:\n"""${company.persona!.slice(0, 6000)}"""\n\nSelected idea:\nTitle: ${idea.title}\nPain point: ${idea.painPoint}\nAngle: ${idea.angle ?? ""}\nHooks: ${idea.hooks.join(" | ")}\nSelected hook: "${selectedHook}"\nKind: ${finalKind}\n\nWrite the FULL script/content for this kind using the selected hook as the opening line. Respond with ONLY this JSON shape:\n${shapeHint}\n` +
            `- title: reuse or refine "${title}", <=90 chars, brand voice\n` +
            (finalKind === "carousel"
              ? `- images: 4-7 slides; each text 10-220 chars, url must be a valid https URL (picsum placeholder ok)\n`
              : `- scripts: each prompt 20-600 chars, type aroll = talking head, broll = overlay/visual\n- format: pick vertical (reels/tiktok) or horizontal (youtube) based on kind\n`) +
            `- stay on the pain point: ${idea.painPoint}`,
        );
      } catch (e: any) {
        request.log.warn({ err: e }, "script generation failed");
        return reply.status(502).send({ error: e?.message || "script generation failed" } as any);
      }

      try {
        const parsed = extractJson(res.text);
        const outTitle = String(parsed.title || title).slice(0, 255);
        let full: any;
        if (finalKind === "carousel") {
          const images = (Array.isArray(parsed.images) ? parsed.images : [])
            .slice(0, 20)
            .map((im: any) => ({
              url: String(im.url || `https://picsum.photos/seed/${encodeURIComponent(outTitle.slice(0, 20))}/1080/1080`),
              text: String(im.text || im.caption || "").slice(0, 2000),
              font: im.font ? String(im.font).slice(0, 100) : undefined,
              background: im.background ? String(im.background).slice(0, 100) : undefined,
              color: im.color ? String(im.color).slice(0, 100) : undefined,
            }))
            .filter((im: any) => im.text);
          // validate via zod
          const validatedImages = z.array(carouselImageSchema).safeParse(images);
          if (!validatedImages.success || validatedImages.data.length === 0) throw new Error(validatedImages.error?.issues[0]?.message || "no valid images");
          full = { companyId: request.params.companyId, kind: finalKind, title: outTitle, images: validatedImages.data };
        } else {
          const scripts = (Array.isArray(parsed.scripts) ? parsed.scripts : [])
            .slice(0, 50)
            .map((s: any) => ({
              type: s.type === "broll" ? ("broll" as const) : ("aroll" as const),
              prompt: String(s.prompt || s.text || "").slice(0, 5000),
            }))
            .filter((s: any) => s.prompt);
          const format = parsed.format === "horizontal" ? "horizontal" : "vertical";
          const validatedScripts = z.array(scriptSchema).safeParse(scripts);
          if (!validatedScripts.success || validatedScripts.data.length === 0) throw new Error(validatedScripts.error?.issues[0]?.message || "no valid scripts");
          full = { companyId: request.params.companyId, kind: finalKind, title: outTitle, scripts: validatedScripts.data, format };
        }

        const v = createContentSchema.safeParse(full);
        if (!v.success) throw new Error(v.error.issues[0]?.message);
        const data = serializeContentInput(v.data);
        const [row] = await db
          .insert(contents)
          .values({
            userId: request.session!.user.id,
            companyId: request.params.companyId,
            kind: data.kind,
            title: data.title,
            status: data.status,
            images: data.images as any,
            scripts: data.scripts as any,
            mediaUrl: null,
            format: data.format as any,
          })
          .returning();
        const parsedRow = parseContentRow(row as any) as any;
        void queueContentMedia({ userId: request.session!.user.id, companyId: request.params.companyId, contentId: row.id, kind: row.kind, images: parsedRow.images, scripts: parsedRow.scripts, format: row.format as any });
        return reply.status(201).send(parsedRow);
      } catch (e: any) {
        request.log.warn({ err: e }, "could not parse script JSON");
        return reply.status(502).send({ error: e?.message || "AI returned unusable script — try again" } as any);
      }
    },
  );
}
