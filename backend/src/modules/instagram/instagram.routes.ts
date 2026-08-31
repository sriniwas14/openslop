import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import {
  instagramPosts,
  instagramSources,
  socialCredentials,
} from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import {
  errorResponseSchema,
  saveApifyKeySchema,
  apifyKeyResponseSchema,
  testApifyKeyBodySchema,
  scrapeRequestBodySchema,
  creatorResponseSchema,
  postResponseSchema,
  scrapeResponseSchema,
} from "./instagram.schemas";

// ponytail: lazy schema backfill — instagram_post predates these columns
// in the physical DB; mirror the content.routes.ts additive-migration pattern.
async function ensureInstagramColumns() {
  try {
    await db.run(`SELECT source, mentions FROM instagram_post LIMIT 0` as any);
  } catch {
    try {
      await db.run(`ALTER TABLE instagram_post ADD COLUMN source text DEFAULT 'apify' NOT NULL` as any);
      await db.run(`ALTER TABLE instagram_post ADD COLUMN mentions text` as any);
    } catch {}
  }
}

// in-process duplicate-scrape guard keyed by company+username
const activeScrapes = new Set<string>();

function maskKey(k: string | null | undefined): string | null {
  if (!k) return null;
  if (k.length <= 8) return "****";
  return `${k.slice(0, 3)}****${k.slice(-4)}`;
}

function apifyKeyResponse(key: string | null, status: "connected" | "invalid" | "not_connected", meta?: { createdAt?: string | null; updatedAt?: string | null }) {
  return {
    provider: "apify",
    apiKeyMasked: maskKey(key),
    hasKey: !!key,
    status,
    createdAt: meta?.createdAt ?? null,
    updatedAt: meta?.updatedAt ?? null,
  };
}

function parseCount(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStringArray(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toCreatorResponse(row: typeof instagramSources.$inferSelect, postCount: number) {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    username: row.username,
    profileUrl: row.profileUrl,
    displayName: row.displayName,
    status: row.status,
    lastScrapedAt: row.lastScrapedAt,
    postCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPostResponse(row: typeof instagramPosts.$inferSelect) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    externalPostId: row.externalPostId,
    shortcode: row.shortcode,
    postUrl: row.postUrl,
    username: row.username,
    ownerFullName: row.ownerFullName,
    caption: row.caption,
    mediaType: row.mediaType,
    mediaUrl: row.mediaUrl,
    thumbnailUrl: row.thumbnailUrl,
    publishedAt: row.publishedAt,
    likes: parseCount(row.likes),
    comments: parseCount(row.comments),
    shares: parseCount(row.shares),
    views: parseCount(row.views),
    hashtags: parseStringArray(row.hashtags),
    mentions: parseStringArray(row.mentions),
    source: row.source,
    scrapedAt: row.scrapedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadApifyKey(userId: string): Promise<string | null> {
  const [cred] = await db
    .select()
    .from(socialCredentials)
    .where(and(eq(socialCredentials.userId, userId), eq(socialCredentials.provider, "apify")));
  return cred?.apiKey ?? null;
}

export async function instagramRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  await ensureInstagramColumns();

  // ---------- Apify credential (per-user, masked on read) ----------
  r.get(
    "/api/integrations/apify/key",
    {
      preHandler: requireSession,
      schema: { response: { 200: apifyKeyResponseSchema } },
    },
    async (request) => {
      const [cred] = await db
        .select()
        .from(socialCredentials)
        .where(and(eq(socialCredentials.userId, request.session!.user.id), eq(socialCredentials.provider, "apify")));
      if (!cred) {
        return apifyKeyResponse(null, "not_connected");
      }
      return apifyKeyResponse(cred.apiKey, "connected", { createdAt: cred.createdAt, updatedAt: cred.updatedAt });
    },
  );

  r.post(
    "/api/integrations/apify/key",
    {
      preHandler: requireSession,
      schema: { body: saveApifyKeySchema, response: { 200: apifyKeyResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const apiKey = request.body.apiKey.trim();
      const [existing] = await db
        .select()
        .from(socialCredentials)
        .where(and(eq(socialCredentials.userId, request.session!.user.id), eq(socialCredentials.provider, "apify")));
      if (existing) {
        const [updated] = await db
          .update(socialCredentials)
          .set({ apiKey, updatedAt: new Date().toISOString() })
          .where(eq(socialCredentials.id, existing.id))
          .returning();
        return apifyKeyResponse(updated.apiKey, "connected", { createdAt: updated.createdAt, updatedAt: updated.updatedAt });
      }
      const [row] = await db
        .insert(socialCredentials)
        .values({ userId: request.session!.user.id, provider: "apify", apiKey })
        .returning();
      return apifyKeyResponse(row.apiKey, "connected", { createdAt: row.createdAt, updatedAt: row.updatedAt });
    },
  );

  r.delete(
    "/api/integrations/apify/key",
    {
      preHandler: requireSession,
      schema: { response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const rows = await db
        .delete(socialCredentials)
        .where(and(eq(socialCredentials.userId, request.session!.user.id), eq(socialCredentials.provider, "apify")))
        .returning({ id: socialCredentials.id });
      if (!rows.length) return reply.status(404).send({ error: "No Apify key configured" } as any);
      return { success: true };
    },
  );

  // ---------- Test connection (no key persisted) ----------
  r.post(
    "/api/integrations/apify/test",
    {
      preHandler: requireSession,
      schema: { body: testApifyKeyBodySchema, response: { 200: apifyKeyResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      let token: string | null = request.body.apiKey?.trim() ?? null;
      if (!token) token = await loadApifyKey(request.session!.user.id);
      if (!token) {
        return reply.status(400).send({ error: "Please connect your Apify account before testing." } as any);
      }
      try {
        // light-weight connectivity probe against a tiny limit
        const url = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultsType: "posts", directUrls: ["https://www.instagram.com/nike/"], resultsLimit: 1 }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(t));
        if (res.status === 401 || res.status === 403) {
          return reply.status(400).send({ error: "Invalid key" } as any);
        }
        if (!res.ok) {
          return reply.status(400).send({ error: "Connection failed" } as any);
        }
        return apifyKeyResponse(token, "connected");
      } catch {
        return reply.status(400).send({ error: "Connection failed" } as any);
      }
    },
  );

  // ---------- Creators (Instagram sources) ----------
  r.get(
    "/api/integrations/instagram/creators",
    {
      preHandler: requireSession,
      schema: { querystring: z.object({ companyId: z.string().optional() }), response: { 200: z.array(creatorResponseSchema) } },
    },
    async (request) => {
      const { companyId } = request.query as any;
      const conds = [eq(instagramSources.userId, request.session!.user.id)];
      if (companyId) conds.push(eq(instagramSources.companyId, companyId));
      const rows = await db
        .select()
        .from(instagramSources)
        .where(and(...conds))
        .orderBy(desc(instagramSources.createdAt));
      return Promise.all(
        rows.map(async (c) => {
          let count = 0;
          try {
            count = (await db.select({ id: instagramPosts.id }).from(instagramPosts).where(eq(instagramPosts.sourceId, c.id))).length;
          } catch {}
          return toCreatorResponse(c, count);
        }),
      ) as any;
    },
  );

  // ---------- Posts for a creator ----------
  r.get(
    "/api/integrations/instagram/creators/:id/posts",
    {
      preHandler: requireSession,
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ limit: z.coerce.number().int().positive().max(200).optional() }),
        response: { 200: z.array(postResponseSchema) },
      },
    },
    async (request) => {
      const limit = (request.query as any)?.limit ?? 100;
      const rows = await db
        .select()
        .from(instagramPosts)
        .where(and(eq(instagramPosts.sourceId, request.params.id), eq(instagramPosts.userId, request.session!.user.id)))
        .orderBy(desc(instagramPosts.publishedAt))
        .limit(limit);
      return (rows.map(toPostResponse)) as any;
    },
  );

  // ---------- Scrape posts for a creator ----------
  r.post(
    "/api/integrations/apify/instagram/scrape",
    {
      preHandler: requireSession,
      schema: { body: scrapeRequestBodySchema, response: { 200: scrapeResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 502: errorResponseSchema } },
    },
    async (request, reply) => {
      const { creator, resultsLimit } = request.body;
      const userId = request.session!.user.id;
      const companyId = (request.query as any)?.companyId ?? null;

      const { scrapeAndStorePosts, ScrapeError } = await import("./instagram.service");
      try {
        const result = await scrapeAndStorePosts({
          userId,
          companyId,
          creator,
          resultsLimit,
          dedupeGuard: {
            acquire: (key: string) => { if (activeScrapes.has(key)) return false; activeScrapes.add(key); return true; },
            release: (key: string) => activeScrapes.delete(key),
          },
        });
        return {
          creator: { id: result.sourceId, userId, companyId, username: result.creatorUsername, profileUrl: result.profileUrl, displayName: result.displayName, status: "active", lastScrapedAt: new Date().toISOString(), postCount: result.storedPosts.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          job: { id: crypto.randomUUID(), status: "completed", postsFound: result.postsFound, error: null },
          posts: result.storedPosts.map(toPostResponse),
          newCount: result.newCount,
          message: result.message,
        };
      } catch (e: any) {
        request.log.warn({ err: e }, "instagram scrape failed");
        const status = e instanceof ScrapeError ? e.status : 502;
        return reply.status(status as any).send({ error: e?.message ?? "Instagram scraping failed." } as any);
      }
    },
  );
}
