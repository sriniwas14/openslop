import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { getBrandContext } from "../brand/brand.service";
import {
  companyIdParamsSchema,
  errorResponseSchema,
  generateAcceptedSchema,
  generateContentBodySchema,
  generatedContentListQuerySchema,
  generatedContentListResponseSchema,
  generationJobStatusSchema,
} from "./ugc.schemas";
import {
  DEFAULT_TARGET_COUNT,
  UgcError,
  countGeneratedContent,
  generateInitialBrandContent,
  getGenerationJobStatus,
  isStaleJob,
  listGeneratedContent,
} from "./ugc.service";

const base = "/companies/:companyId/generated-content";

// ponytail: read-only API over automatically generated UGC content — the data source for
// the future "Content / Visual" tab. brandId === companyId, ownership via the parent company.
async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

export async function ugcRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // -------------------------------------------------------------------------
  // GET generation job status — for polling (returns "none" instead of 404 when
  // this brand has never run the generator, so a client poller stays simple)
  // -------------------------------------------------------------------------
  r.get(
    `${base}/status`,
    {
      preHandler: requireSession,
      schema: { params: companyIdParamsSchema, response: { 200: generationJobStatusSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      try {
        return await getGenerationJobStatus({ companyId: company.id, userId: request.session!.user.id });
      } catch (e: any) {
        const status = e instanceof UgcError ? e.status : 500;
        return reply.status(status as any).send({ error: e?.message ?? "Could not read content generation status." } as any);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET saved content — every filter of spec §16, incl. visualReady=true
  // ("brandId = X AND visualAssetId IS NULL"), the base query of the visual tab
  // -------------------------------------------------------------------------
  r.get(
    base,
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        querystring: generatedContentListQuerySchema,
        response: { 200: generatedContentListResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      try {
        return await listGeneratedContent({ companyId: company.id, userId: request.session!.user.id, query: request.query });
      } catch (e: any) {
        const status = e instanceof UgcError ? e.status : 500;
        return reply.status(status as any).send({ error: e?.message ?? "Could not read generated content." } as any);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST generate — manual (re)run of the same background job Brand Intelligence
  // triggers automatically. Returns 202 immediately; the run is decoupled from this
  // request and resumes from what is already saved, so it can never duplicate content.
  // -------------------------------------------------------------------------
  r.post(
    `${base}/generate`,
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: generateContentBodySchema.optional(),
        response: { 202: generateAcceptedSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const userId = request.session!.user.id;
      const companyId = company.id;
      const targetCount = Math.max(1, Math.min(500, Math.round(request.body?.targetCount ?? DEFAULT_TARGET_COUNT)));

      // content generation needs a finished Brand Intelligence document + angles
      const ctx = await getBrandContext(companyId, userId);
      if (!ctx) return reply.status(409).send({ error: "Brand Intelligence is not ready for this brand yet." });
      if (!ctx.contentAngles.length) return reply.status(409).send({ error: "This brand has no content angles yet." });

      const savedCount = await countGeneratedContent(companyId);
      const current = await getGenerationJobStatus({ companyId, userId });
      if (current.status === "processing" && !isStaleJob(current.status, current.updatedAt)) {
        return reply.status(202).send({ status: "processing", companyId, targetCount, savedCount });
      }

      void generateInitialBrandContent({ companyId, userId, targetCount }).catch((e: any) => {
        request.log.warn({ err: e }, "content generation failed");
      });

      return reply.status(202).send({ status: "pending", companyId, targetCount, savedCount });
    },
  );
}
