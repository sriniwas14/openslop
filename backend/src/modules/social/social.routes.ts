import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, like, or } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import {
  companies,
  contentAnalyses,
  scrapeJobs,
  scrapedPosts,
  socialCredentials,
  socialSources,
  type ScrapedPost,
} from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { computePerformanceScore, inferContentType } from "./performance";
import { analyzePost, detectTrends, generateSimilar } from "./ai-analysis";
import { startScrape, startTrendingInstagramScrape } from "./scrape.service";
import {
  analyzePostSchema,
  contentAnalysisResponseSchema,
  createSimilarResultSchema,
  createSimilarSchema,
  createSocialSourceSchema,
  errorResponseSchema,
  extractSourceName,
  maskKey,
  normalizeSourceUrl,
  postIdParamsSchema,
  postQuerySchema,
  scrapeJobResponseSchema,
  scrapedPostResponseSchema,
  socialCredentialResponseSchema,
  socialCredentialSchema,
  socialSourceResponseSchema,
  sourceIdParamsSchema,
  trendingInstagramSchema,
  trendResponseSchema,
} from "./social.schemas";

function parseHashtags(v: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function parseCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toPostResponse(post: ScrapedPost) {
  return {
    id: post.id,
    sourceId: post.sourceId,
    platform: post.platform,
    externalPostId: post.externalPostId,
    postUrl: post.postUrl,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    text: post.text,
    mediaType: post.mediaType,
    mediaUrl: post.mediaUrl,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
    likes: parseCount(post.likes),
    comments: parseCount(post.comments),
    shares: parseCount(post.shares),
    views: parseCount(post.views),
    hashtags: parseHashtags(post.hashtags),
    scrapedAt: post.scrapedAt,
    performanceScore: computePerformanceScore(post),
    contentType: inferContentType(post),
  };
}

async function withPostCount(sourceRows: (typeof socialSources.$inferSelect)[]) {
  return Promise.all(
    sourceRows.map(async (s) => {
      let count = 0;
      try {
        count = (
          await db
            .select({ id: scrapedPosts.id })
            .from(scrapedPosts)
            .where(eq(scrapedPosts.sourceId, s.id))
        ).length;
      } catch {
        count = 0;
      }
      return { ...s, postCount: count };
    }),
  );
}

export async function socialRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---- sources ----
  r.get(
    "/social/sources",
    {
      preHandler: requireSession,
      schema: { response: { 200: z.array(socialSourceResponseSchema) } },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(socialSources)
        .where(eq(socialSources.userId, request.session!.user.id))
        .orderBy(desc(socialSources.createdAt));
      return withPostCount(rows);
    },
  );

  r.post(
    "/social/sources",
    {
      preHandler: requireSession,
      schema: { body: createSocialSourceSchema, response: { 201: socialSourceResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const { platform, sourceUrl } = request.body;
      let url: string;
      try {
        url = normalizeSourceUrl(platform, sourceUrl);
      } catch (e: any) {
        return reply.status(400).send({ error: String(e?.message ?? "Invalid source URL") } as any);
      }
      const name = extractSourceName(platform, url);
      const [row] = await db
        .insert(socialSources)
        .values({ userId: request.session!.user.id, platform, sourceUrl: url, sourceName: name })
        .returning();
      return reply.status(201).send({ ...row, postCount: 0 } as any);
    },
  );

  r.delete(
    "/social/sources/:id",
    {
      preHandler: requireSession,
      schema: { params: sourceIdParamsSchema, response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const rows = await db
        .delete(socialSources)
        .where(and(eq(socialSources.id, request.params.id), eq(socialSources.userId, request.session!.user.id)))
        .returning({ id: socialSources.id });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      // remove associated posts
      await db
        .delete(scrapedPosts)
        .where(and(eq(scrapedPosts.sourceId, request.params.id), eq(scrapedPosts.userId, request.session!.user.id)));
      return { success: true };
    },
  );

  // ---- credentials (per-user Apify token for open-source) ----
  function toCredentialResponse(row: typeof socialCredentials.$inferSelect) {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      apiKeyMasked: maskKey(row.apiKey),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hasKey: !!row.apiKey,
    };
  }

  r.get(
    "/social/credentials",
    {
      preHandler: requireSession,
      schema: { response: { 200: z.array(socialCredentialResponseSchema) } },
    },
    async (request) => {
      const rows = await db.select().from(socialCredentials).where(eq(socialCredentials.userId, request.session!.user.id));
      return rows.map(toCredentialResponse) as any;
    },
  );

  r.post(
    "/social/credentials",
    {
      preHandler: requireSession,
      schema: { body: socialCredentialSchema, response: { 200: socialCredentialResponseSchema, 201: socialCredentialResponseSchema } },
    },
    async (request, reply) => {
      const { apiKey, provider } = request.body as any;
      const existing = await db
        .select()
        .from(socialCredentials)
        .where(and(eq(socialCredentials.userId, request.session!.user.id), eq(socialCredentials.provider, provider ?? "apify")));
      if (existing[0]) {
        const [updated] = await db
          .update(socialCredentials)
          .set({ apiKey, updatedAt: new Date().toISOString() })
          .where(eq(socialCredentials.id, existing[0].id))
          .returning();
        return toCredentialResponse(updated) as any;
      }
      const [row] = await db
        .insert(socialCredentials)
        .values({ userId: request.session!.user.id, provider: provider ?? "apify", apiKey })
        .returning();
      return reply.status(201).send(toCredentialResponse(row) as any);
    },
  );

  r.delete(
    "/social/credentials/:id",
    {
      preHandler: requireSession,
      schema: { params: sourceIdParamsSchema, response: { 200: z.object({ success: z.boolean() }), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const rows = await db
        .delete(socialCredentials)
        .where(and(eq(socialCredentials.id, request.params.id), eq(socialCredentials.userId, request.session!.user.id)))
        .returning({ id: socialCredentials.id });
      if (!rows.length) return reply.status(404).send({ error: "Not found" } as any);
      return { success: true };
    },
  );

  // ---- scrape ----
  r.post(
    "/social/sources/:id/scrape",
    {
      preHandler: requireSession,
      schema: { params: sourceIdParamsSchema, response: { 200: scrapeJobResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const [source] = await db
        .select()
        .from(socialSources)
        .where(and(eq(socialSources.id, request.params.id), eq(socialSources.userId, request.session!.user.id)));
      if (!source) return reply.status(404).send({ error: "Source not found" } as any);

      let jobId: string;
      try {
        jobId = await startScrape(source.id, request.session!.user.id);
      } catch (e: any) {
        request.log.warn({ err: e }, "scrape start failed");
        return reply.status(400).send({ error: String(e?.message ?? "Failed to start scrape") } as any);
      }
      const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
      return job as any;
    },
  );

  r.get(
    "/social/jobs/:id",
    {
      preHandler: requireSession,
      schema: { params: sourceIdParamsSchema, response: { 200: scrapeJobResponseSchema } },
    },
    async (request) => {
      const [job] = await db
        .select()
        .from(scrapeJobs)
        .where(and(eq(scrapeJobs.id, request.params.id), eq(scrapeJobs.userId, request.session!.user.id)));
      return (job ?? { error: "not found" }) as any;
    },
  );

  // Trending Instagram: scrape viral/trending posts without needing a specific creator source
  r.post(
    "/social/instagram/trending",
    {
      preHandler: requireSession,
      schema: { body: trendingInstagramSchema, response: { 200: scrapeJobResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const limit = (request.body as any)?.limit ?? 30;
      let jobId: string;
      try {
        jobId = await startTrendingInstagramScrape(request.session!.user.id, limit);
      } catch (e: any) {
        request.log.warn({ err: e }, "trending scrape failed");
        const msg = String(e?.message ?? "Failed to start trending scrape");
        // Helpful hint when token missing
        if (msg.includes("No Apify")) return reply.status(400).send({ error: msg } as any);
        return reply.status(400).send({ error: msg } as any);
      }
      const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
      return job as any;
    },
  );

  // ---- posts (content library) ----
  r.get(
    "/social/posts",
    {
      preHandler: requireSession,
      schema: { querystring: postQuerySchema, response: { 200: z.array(scrapedPostResponseSchema) } },
    },
    async (request) => {
      const { platform, sourceId, contentType, topic, minScore, q } = request.query;
      const limit = request.query.limit ?? 100;
      const conds = [eq(scrapedPosts.userId, request.session!.user.id)];
      if (platform) conds.push(eq(scrapedPosts.platform, platform));
      if (sourceId) conds.push(eq(scrapedPosts.sourceId, sourceId));
      if (q && q.trim()) {
        const needle = `%${q.trim()}%`;
        conds.push(or(like(scrapedPosts.text, needle), like(scrapedPosts.authorName, needle), like(scrapedPosts.authorUsername, needle))!);
      }
      let rows = await db
        .select()
        .from(scrapedPosts)
        .where(and(...conds))
        .orderBy(desc(scrapedPosts.publishedAt))
        .limit(limit);

      // local filters that need derived values
      if (contentType || minScore != null) {
        rows = rows.filter((p) => {
          if (contentType && inferContentType(p) !== contentType) return false;
          if (minScore != null && computePerformanceScore(p) < minScore) return false;
          return true;
        });
      }
      if (topic && topic.trim()) {
        const needle = topic.trim().toLowerCase();
        rows = rows.filter(
          (p) =>
            (p.text ?? "").toLowerCase().includes(needle) ||
            parseHashtags(p.hashtags).some((h) => h.toLowerCase().includes(needle)),
        );
      }

      // account-size-aware scoring
      return rows.map((p) => toPostResponse(p));
    },
  );

  // ---- analysis ----
  r.post(
    "/social/posts/:id/analyze",
    {
      preHandler: requireSession,
      schema: { params: postIdParamsSchema, body: analyzePostSchema, response: { 200: contentAnalysisResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const postId = request.params.id;
      const [post] = await db
        .select()
        .from(scrapedPosts)
        .where(and(eq(scrapedPosts.id, postId), eq(scrapedPosts.userId, request.session!.user.id)));
      if (!post) return reply.status(404).send({ error: "Post not found" } as any);

      // reuse existing analysis if present
      const [existing] = await db
        .select()
        .from(contentAnalyses)
        .where(and(eq(contentAnalyses.postId, postId), eq(contentAnalyses.userId, request.session!.user.id)));
      if (existing) return existing as any;

      let analysis;
      try {
        analysis = await analyzePost(request.session!.user.id, post);
      } catch (e: any) {
        request.log.warn({ err: e }, "post analysis failed");
        return reply.status(400).send({ error: String(e?.message ?? "Analysis failed") } as any);
      }
      const [row] = await db
        .insert(contentAnalyses)
        .values({
          userId: request.session!.user.id,
          postId,
          topic: analysis.topic,
          hook: analysis.hook,
          format: analysis.format,
          structure: analysis.structure,
          tone: analysis.tone,
          CTA: analysis.CTA,
          audience: analysis.audience,
          keyIdea: analysis.keyIdea,
          reasoning: analysis.reasoning,
        })
        .returning();
      return row as any;
    },
  );

  r.get(
    "/social/posts/:id/analysis",
    {
      preHandler: requireSession,
      schema: { params: postIdParamsSchema, response: { 200: contentAnalysisResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const [analysis] = await db
        .select()
        .from(contentAnalyses)
        .where(and(eq(contentAnalyses.postId, request.params.id), eq(contentAnalyses.userId, request.session!.user.id)));
      if (!analysis) return reply.status(404).send({ error: "No analysis yet" } as any);
      return analysis as any;
    },
  );

  // ---- create similar ----
  r.post(
    "/social/posts/:id/create-similar",
    {
      preHandler: requireSession,
      schema: {
        params: postIdParamsSchema,
        body: createSimilarSchema,
        response: { 200: createSimilarResultSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const postId = request.params.id;
      const userId = request.session!.user.id;
      const [post] = await db
        .select()
        .from(scrapedPosts)
        .where(and(eq(scrapedPosts.id, postId), eq(scrapedPosts.userId, userId)));
      if (!post) return reply.status(404).send({ error: "Post not found" } as any);

      let analysis = await analyzePost(userId, post).catch(() => null);
      if (!analysis) {
        // fall back to stored analysis
        const [stored] = await db
          .select()
          .from(contentAnalyses)
          .where(and(eq(contentAnalyses.postId, postId), eq(contentAnalyses.userId, userId)));
        if (!stored) return reply.status(400).send({ error: "Could not analyze post — try again" } as any);
        analysis = {
          topic: stored.topic ?? "",
          hook: stored.hook ?? "",
          format: stored.format ?? "",
          structure: stored.structure ?? "",
          tone: stored.tone ?? "",
          CTA: stored.CTA ?? "",
          audience: stored.audience ?? "",
          keyIdea: stored.keyIdea ?? "",
          reasoning: stored.reasoning ?? "",
          pattern: "",
        };
      }

      // gather a bit of trend context from this user's other high-performing posts
      const siblings = await db
        .select()
        .from(scrapedPosts)
        .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.sourceId, post.sourceId)))
        .orderBy(desc(scrapedPosts.publishedAt))
        .limit(20);
      let trend = null;
      try {
        trend = await detectTrends(userId, siblings);
      } catch {
        trend = null;
      }

      let business: string | null = null;
      if (request.body.companyId) {
        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, request.body.companyId), eq(companies.userId, userId)));
        if (company) {
          business = `${company.name}\nPersona: ${company.persona ?? "none"}\nWebsite: ${company.website ?? ""}`;
        }
      }

      const contentType = request.body.contentType ?? (inferContentType(post) === "short-video" ? "short-video" : "carousel");
      let result;
      try {
        result = await generateSimilar(userId, {
          post,
          analysis,
          trend,
          business,
          contentType,
          tone: request.body.tone,
        });
      } catch (e: any) {
        request.log.warn({ err: e }, "create similar failed");
        return reply.status(400).send({ error: String(e?.message ?? "Generation failed — try again") } as any);
      }
      return result as any;
    },
  );

  // ---- trends ----
  r.get(
    "/social/trends",
    {
      preHandler: requireSession,
      schema: { response: { 200: trendResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const posts = await db
        .select()
        .from(scrapedPosts)
        .where(eq(scrapedPosts.userId, request.session!.user.id))
        .orderBy(desc(scrapedPosts.publishedAt))
        .limit(50);
      if (posts.length === 0) return { topics: [], patterns: [] };
      try {
        return await detectTrends(request.session!.user.id, posts);
      } catch (e: any) {
        request.log.warn({ err: e }, "trend detection failed");
        return reply.status(400).send({ error: String(e?.message ?? "Trend detection failed") } as any);
      }
    },
  );
}
