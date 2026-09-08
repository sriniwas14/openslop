import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import {
  companyIdParamsSchema,
  contentFeedQuerySchema,
  contentFeedResponseSchema,
  errorResponseSchema,
} from "./visual.schemas";
import { VisualFeedError, getContentFeed } from "./visual.service";

// ---------------------------------------------------------------------------
// Visual discovery feed — an Instagram/Reels-style vertical stream over a brand's
// already-generated content, each post paired with the best Pexels visual.
//
// brandId === companyId. Ownership is enforced through the parent company row exactly
// like ugc.routes: a user can only ever read (and therefore trigger visual search for)
// their own brand's feed. The Pexels key stays server-side and never leaves this process.
// ---------------------------------------------------------------------------

const base = "/companies/:companyId/content-feed";

async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

export async function visualRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // -------------------------------------------------------------------------
  // GET one batch (≤5 posts) of the feed. Returns immediately with each post's
  // current visual state; creating a NEW batch kicks off background visual search,
  // and re-requesting the SAME cursor is an idempotent no-op trigger that simply
  // reflects the latest state — that is how the client polls a batch until ready
  // and prefetches the next one (around item 3) without blocking the scroll.
  // -------------------------------------------------------------------------
  r.get(
    base,
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: contentFeedQuerySchema,
        response: { 200: contentFeedResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      try {
        return await getContentFeed({
          companyId: company.id,
          userId: request.session!.user.id,
          cursor: request.query.cursor ?? null,
          limit: request.query.limit,
        });
      } catch (e: any) {
        const status = e instanceof VisualFeedError ? e.status : 500;
        return reply.status(status as any).send({ error: e?.message ?? "Could not read the content feed." } as any);
      }
    },
  );
}
