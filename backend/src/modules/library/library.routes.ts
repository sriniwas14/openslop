import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies, libraryMedia, libraryPosts } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import {
  companyIdParamsSchema,
  createLibraryMediaSchema,
  createLibraryPostSchema,
  errorResponseSchema,
  libraryMediaListQuerySchema,
  libraryMediaResponseSchema,
  libraryPostCheckQuerySchema,
  libraryPostCheckResponseSchema,
  libraryPostIdParamsSchema,
  libraryPostListQuerySchema,
  libraryPostResponseSchema,
  parseLibraryMediaRow,
  parseLibraryPostRow,
  updateLibraryMediaSchema,
  updateLibraryPostSchema,
} from "./library.schemas";

// ponytail: Library is DB-backed (user + brand scoped) — no localStorage. Uploads and
// Edit-replacements arrive as data: URLs (no multipart dep), written to data/media and
// served via GET /media/files/:filename like every other local asset.

async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

function extForMime(mime: string): string | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  if (m === "video/quicktime") return "mov";
  return null;
}

// data:image/png;base64,.... -> /media/files/library_<uuid>.png (15MB body cap in app.ts)
async function saveDataUrlToMedia(dataUrl: string, prefix: string): Promise<{ fileUrl: string; size: number }> {
  const m = /^data:([\w/+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("file must be a data: URL");
  const ext = extForMime(m[1]);
  if (!ext) throw new Error(`unsupported media type ${m[1]}`);
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) throw new Error("empty file");
  const filename = `${prefix}_${crypto.randomUUID()}.${ext}`;
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const dir = path.join(process.cwd(), "data", "media");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buf);
  return { fileUrl: `/media/files/${filename}`, size: buf.length };
}

async function deleteMediaFile(fileUrl: string | null | undefined) {
  if (!fileUrl?.startsWith("/media/files/")) return;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    await fs.unlink(path.join(process.cwd(), "data", "media", fileUrl.replace("/media/files/", "")));
  } catch {
    // best-effort — a missing file must not fail the row delete
  }
}

export async function libraryRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---------- saved posts ----------

  r.get(
    "/companies/:companyId/library/posts",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: libraryPostListQuerySchema,
        response: { 200: libraryPostResponseSchema.array(), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const q = request.query;
      let where: any = and(
        eq(libraryPosts.userId, request.session.user.id),
        eq(libraryPosts.companyId, request.params.companyId),
      );
      if (q.status) where = and(where, eq(libraryPosts.status, q.status)) as any;
      if (q.attention === "true") where = and(where, eq(libraryPosts.needsAttention, "1")) as any;
      if (q.contentId) where = and(where, eq(libraryPosts.contentId, q.contentId)) as any;
      const rows = await db.select().from(libraryPosts).where(where).orderBy(desc(libraryPosts.createdAt));
      return rows.map(parseLibraryPostRow) as any;
    },
  );

  r.get(
    "/companies/:companyId/library/posts/check",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: libraryPostCheckQuerySchema,
        response: { 200: libraryPostCheckResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const rows = await db
        .select({ id: libraryPosts.id })
        .from(libraryPosts)
        .where(
          and(
            eq(libraryPosts.userId, request.session.user.id),
            eq(libraryPosts.companyId, request.params.companyId),
            eq(libraryPosts.contentId, request.query.contentId),
          ),
        );
      return { saved: rows.length > 0 } as any;
    },
  );

  r.post(
    "/companies/:companyId/library/posts",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: createLibraryPostSchema,
        response: { 200: libraryPostResponseSchema, 201: libraryPostResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const userId = request.session.user.id;
      const body = request.body;
      const now = new Date().toISOString();

      const [existing] = await db
        .select()
        .from(libraryPosts)
        .where(and(eq(libraryPosts.userId, userId), eq(libraryPosts.companyId, request.params.companyId), eq(libraryPosts.contentId, body.contentId)));

      // Re-save refreshes the snapshot but keeps the workflow state (status/schedule).
      if (existing) {
        let editedFile = (existing as any).edited_file ?? null;
        let editedMediaType = (existing as any).edited_media_type ?? null;
        if (body.editedFileDataUrl) {
          try {
            const saved = await saveDataUrlToMedia(body.editedFileDataUrl, "library");
            await deleteMediaFile(editedFile);
            editedFile = saved.fileUrl;
            editedMediaType = body.editedMediaType ?? body.mediaType;
          } catch (e: any) {
            return reply.status(400).send({ error: e?.message ?? "invalid edited file" } as any);
          }
        }
        const [row] = await db
          .update(libraryPosts)
          .set({
            title: body.title ?? null,
            hook: body.hook ?? null,
            body: body.body ?? null,
            platform: body.platform,
            contentFormat: body.contentFormat,
            contentType: body.contentType,
            visualUrl: body.visualUrl ?? null,
            mediaType: body.mediaType,
            posterUrl: body.posterUrl ?? null,
            blocks: JSON.stringify(body.blocks ?? []),
            gifLayer: body.gifLayer ? JSON.stringify(body.gifLayer) : null,
            memeUrl: body.memeUrl ?? null,
            aspect: body.aspect != null ? String(body.aspect) : null,
            editedFile,
            editedMediaType,
            needsAttention: body.needsAttention ? "1" : "0",
            updatedAt: now,
          } as any)
          .where(and(eq(libraryPosts.id, existing.id), eq(libraryPosts.userId, userId)))
          .returning();
        return parseLibraryPostRow(row as any) as any;
      }

      let editedFile: string | null = null;
      let editedMediaType: string | null = null;
      if (body.editedFileDataUrl) {
        try {
          const saved = await saveDataUrlToMedia(body.editedFileDataUrl, "library");
          editedFile = saved.fileUrl;
          editedMediaType = body.editedMediaType ?? body.mediaType;
        } catch (e: any) {
          return reply.status(400).send({ error: e?.message ?? "invalid edited file" } as any);
        }
      }
      const [row] = await db
        .insert(libraryPosts)
        .values({
          userId,
          companyId: request.params.companyId,
          contentId: body.contentId,
          title: body.title ?? null,
          hook: body.hook ?? null,
          body: body.body ?? null,
          platform: body.platform,
          contentFormat: body.contentFormat,
          contentType: body.contentType,
          visualUrl: body.visualUrl ?? null,
          mediaType: body.mediaType,
          posterUrl: body.posterUrl ?? null,
          blocks: JSON.stringify(body.blocks ?? []),
          gifLayer: body.gifLayer ? JSON.stringify(body.gifLayer) : null,
          memeUrl: body.memeUrl ?? null,
          aspect: body.aspect != null ? String(body.aspect) : null,
          editedFile,
          editedMediaType,
          needsAttention: body.needsAttention ? "1" : "0",
          status: "draft",
          scheduledAt: null,
        } as any)
        .returning();
      return reply.status(201).send(parseLibraryPostRow(row as any) as any);
    },
  );

  r.patch(
    "/companies/:companyId/library/posts/:id",
    {
      preHandler: requireSession,
      schema: {
        params: libraryPostIdParamsSchema,
        body: updateLibraryPostSchema,
        response: { 200: libraryPostResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const userId = request.session.user.id;
      const [existing] = await db
        .select()
        .from(libraryPosts)
        .where(and(eq(libraryPosts.id, request.params.id), eq(libraryPosts.userId, userId), eq(libraryPosts.companyId, request.params.companyId)));
      if (!existing) return reply.status(404).send({ error: "Not found" } as any);
      const patch = request.body;
      const set: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.hook !== undefined) set.hook = patch.hook;
      if (patch.body !== undefined) set.body = patch.body;
      if (patch.platform !== undefined) set.platform = patch.platform;
      if (patch.contentFormat !== undefined) set.contentFormat = patch.contentFormat;
      if (patch.contentType !== undefined) set.contentType = patch.contentType;
      if (patch.visualUrl !== undefined) set.visualUrl = patch.visualUrl;
      if (patch.mediaType !== undefined) set.mediaType = patch.mediaType;
      if (patch.posterUrl !== undefined) set.posterUrl = patch.posterUrl;
      if (patch.blocks !== undefined) set.blocks = JSON.stringify(patch.blocks);
      if (patch.gifLayer !== undefined) set.gifLayer = patch.gifLayer ? JSON.stringify(patch.gifLayer) : null;
      if (patch.memeUrl !== undefined) set.memeUrl = patch.memeUrl;
      if (patch.aspect !== undefined) set.aspect = patch.aspect != null ? String(patch.aspect) : null;
      if (patch.needsAttention !== undefined) set.needsAttention = patch.needsAttention ? "1" : "0";
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : null;
      if (patch.editedFileDataUrl !== undefined) {
        if (patch.editedFileDataUrl === null) {
          await deleteMediaFile((existing as any).edited_file);
          set.editedFile = null;
          set.editedMediaType = patch.editedMediaType ?? null;
        } else {
          try {
            const saved = await saveDataUrlToMedia(patch.editedFileDataUrl, "library");
            await deleteMediaFile((existing as any).edited_file);
            set.editedFile = saved.fileUrl;
            set.editedMediaType = patch.editedMediaType ?? (existing as any).edited_media_type ?? (existing as any).media_type;
          } catch (e: any) {
            return reply.status(400).send({ error: e?.message ?? "invalid edited file" } as any);
          }
        }
      } else if (patch.editedMediaType !== undefined) {
        set.editedMediaType = patch.editedMediaType;
      }
      const [row] = await db
        .update(libraryPosts)
        .set(set as any)
        .where(and(eq(libraryPosts.id, request.params.id), eq(libraryPosts.userId, userId)))
        .returning();
      return parseLibraryPostRow(row as any) as any;
    },
  );

  r.delete(
    "/companies/:companyId/library/posts/:id",
    {
      preHandler: requireSession,
      schema: { params: libraryPostIdParamsSchema, response: { 200: libraryPostCheckResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const rows = await db
        .delete(libraryPosts)
        .where(
          and(
            eq(libraryPosts.id, request.params.id),
            eq(libraryPosts.userId, request.session.user.id),
            eq(libraryPosts.companyId, request.params.companyId),
          ),
        )
        .returning({ id: libraryPosts.id, editedFile: libraryPosts.editedFile });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      await deleteMediaFile((rows[0] as any).editedFile);
      return { saved: false } as any;
    },
  );

  // ---------- media bank ----------

  r.get(
    "/companies/:companyId/library/media",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: libraryMediaListQuerySchema,
        response: { 200: libraryMediaResponseSchema.array(), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      let where: any = and(eq(libraryMedia.userId, request.session.user.id), eq(libraryMedia.companyId, request.params.companyId));
      if (request.query.status) where = and(where, eq(libraryMedia.status, request.query.status)) as any;
      const rows = await db.select().from(libraryMedia).where(where).orderBy(desc(libraryMedia.createdAt));
      return rows.map(parseLibraryMediaRow) as any;
    },
  );

  r.post(
    "/companies/:companyId/library/media",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: createLibraryMediaSchema,
        response: { 201: libraryMediaResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      let saved: { fileUrl: string; size: number };
      try {
        saved = await saveDataUrlToMedia(request.body.fileDataUrl, "bank");
      } catch (e: any) {
        return reply.status(400).send({ error: e?.message ?? "invalid file" } as any);
      }
      const [row] = await db
        .insert(libraryMedia)
        .values({
          userId: request.session.user.id,
          companyId: request.params.companyId,
          name: request.body.name,
          mediaType: request.body.mediaType,
          fileUrl: saved.fileUrl,
          size: String(saved.size),
          blocks: JSON.stringify(request.body.blocks ?? []),
          gifLayer: request.body.gifLayer ? JSON.stringify(request.body.gifLayer) : null,
          memeUrl: request.body.memeUrl ?? null,
          aspect: request.body.aspect != null ? String(request.body.aspect) : null,
          status: "draft",
          scheduledAt: null,
        } as any)
        .returning();
      return reply.status(201).send(parseLibraryMediaRow(row as any) as any);
    },
  );

  r.patch(
    "/companies/:companyId/library/media/:id",
    {
      preHandler: requireSession,
      schema: {
        params: libraryPostIdParamsSchema,
        body: updateLibraryMediaSchema,
        response: { 200: libraryMediaResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const userId = request.session.user.id;
      const [existing] = await db
        .select()
        .from(libraryMedia)
        .where(and(eq(libraryMedia.id, request.params.id), eq(libraryMedia.userId, userId), eq(libraryMedia.companyId, request.params.companyId)));
      if (!existing) return reply.status(404).send({ error: "Not found" } as any);
      const patch = request.body;
      const set: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.blocks !== undefined) set.blocks = JSON.stringify(patch.blocks);
      if (patch.gifLayer !== undefined) set.gifLayer = patch.gifLayer ? JSON.stringify(patch.gifLayer) : null;
      if (patch.memeUrl !== undefined) set.memeUrl = patch.memeUrl;
      if (patch.aspect !== undefined) set.aspect = patch.aspect != null ? String(patch.aspect) : null;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : null;
      if (patch.mediaType !== undefined) set.mediaType = patch.mediaType;
      if (patch.fileDataUrl !== undefined && patch.fileDataUrl !== null) {
        try {
          const saved = await saveDataUrlToMedia(patch.fileDataUrl, "bank");
          await deleteMediaFile((existing as any).file_url);
          set.fileUrl = saved.fileUrl;
          set.size = String(saved.size);
        } catch (e: any) {
          return reply.status(400).send({ error: e?.message ?? "invalid file" } as any);
        }
      }
      const [row] = await db
        .update(libraryMedia)
        .set(set as any)
        .where(and(eq(libraryMedia.id, request.params.id), eq(libraryMedia.userId, userId)))
        .returning();
      return parseLibraryMediaRow(row as any) as any;
    },
  );

  r.delete(
    "/companies/:companyId/library/media/:id",
    {
      preHandler: requireSession,
      schema: { params: libraryPostIdParamsSchema, response: { 200: libraryPostCheckResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      if (!request.session) return;
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" } as any);
      const rows = await db
        .delete(libraryMedia)
        .where(
          and(
            eq(libraryMedia.id, request.params.id),
            eq(libraryMedia.userId, request.session.user.id),
            eq(libraryMedia.companyId, request.params.companyId),
          ),
        )
        .returning({ id: libraryMedia.id, fileUrl: libraryMedia.fileUrl });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      await deleteMediaFile((rows[0] as any).fileUrl);
      return { saved: false } as any;
    },
  );
}
