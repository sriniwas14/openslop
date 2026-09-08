import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import {
  analyzeAcceptedSchema,
  angleIdParamsSchema,
  brandIntelligenceResponseSchema,
  brandStatusSchema,
  companyIdParamsSchema,
  contentAngleInputSchema,
  contentAngleSchema,
  customerSegmentInputSchema,
  errorResponseSchema,
  patchAudienceSchema,
  patchBrandSchema,
  patchIdentitySchema,
  patchMarketSchema,
  patchPositioningSchema,
  patchToneSchema,
  segmentIdParamsSchema,
  updateBrandIntelligenceSchema,
  updateContentAngleSchema,
  updateCustomerSegmentSchema,
} from "./brand.schemas";
import {
  addContentAngle,
  addSegment,
  deleteContentAngle,
  deleteSegment,
  ensureAnalyzingRow,
  getDoc,
  getStatus,
  isStaleAnalyzing,
  runBrandAnalysis,
  updateContentAngle,
  updateSection,
  updateSections,
  updateSegment,
  type SectionKey,
} from "./brand.service";

const base = "/companies/:companyId/brand-intelligence";

// ponytail: ownership is enforced via the parent company (brandId === companyId) — never trust ids from the client.
async function assertCompany(request: any, companyId: string) {
  const userId = request.session?.user?.id;
  if (!userId) return null;
  const [row] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return row ?? null;
}

export async function brandRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const docResponse = { 200: brandIntelligenceResponseSchema, 404: errorResponseSchema };

  // -------------------------------------------------------------------------
  // GET full Brand Intelligence document
  // -------------------------------------------------------------------------
  r.get(
    base,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await getDoc(company.id, request.session!.user.id);
      if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
      return doc;
    },
  );

  // -------------------------------------------------------------------------
  // POST analyze / re-analyze — starts a BACKGROUND job and returns 202 at once.
  // The workflow runs server-side, decoupled from this request, and persists its own
  // status; the client polls GET .../status and pops up a notification when it's ready.
  // (The old SSE version tied the run to the request, so navigating away cancelled it.)
  // -------------------------------------------------------------------------
  r.post(
    `${base}/analyze`,
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: z.object({ extra: z.string().max(8000).nullish() }).optional(),
        response: { 202: analyzeAcceptedSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const userId = request.session!.user.id;
      const companyId = company.id;
      const website = (company.website ?? "").trim();
      if (!website) {
        return reply.status(400).send({ error: "This company has no website — add one in Settings first, then analyze." });
      }

      // Idempotency: don't launch a second run while one is genuinely in flight.
      const current = await getStatus(companyId, userId);
      if (current.status === "analyzing" && !isStaleAnalyzing(current.status, current.updatedAt)) {
        return reply.status(202).send({ status: "analyzing", companyId });
      }

      // Persist "analyzing" first so GET/status never 404s and the state survives navigation.
      await ensureAnalyzingRow(companyId, userId);

      // Fire-and-forget — runs to completion in the background, independent of this request.
      void runBrandAnalysis({ companyId, userId, name: company.name, website, extra: request.body?.extra ?? null });

      return reply.status(202).send({ status: "analyzing", companyId });
    },
  );

  // -------------------------------------------------------------------------
  // GET lightweight status — for background polling (returns status "none" instead of
  // 404 when no Brand Brain exists yet, so the client poller stays simple)
  // -------------------------------------------------------------------------
  r.get(
    `${base}/status`,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, response: { 200: brandStatusSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      return getStatus(company.id, request.session!.user.id);
    },
  );

  // -------------------------------------------------------------------------
  // PATCH whole document (any subset of sections)
  // -------------------------------------------------------------------------
  r.patch(
    base,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, body: updateBrandIntelligenceSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await updateSections(company.id, request.session!.user.id, request.body as Partial<Record<SectionKey, unknown>>);
      if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
      return doc;
    },
  );

  // -------------------------------------------------------------------------
  // PATCH individual sections
  // -------------------------------------------------------------------------
  const sectionRoute = (path: string, section: SectionKey, body: z.ZodTypeAny) => {
    r.patch(
      `${base}/${path}`,
      { preHandler: requireSession, schema: { params: companyIdParamsSchema, body, response: docResponse } },
      async (request, reply) => {
        const company = await assertCompany(request, request.params.companyId);
        if (!company) return reply.status(404).send({ error: "Company not found" });
        const doc = await updateSection(company.id, request.session!.user.id, section, request.body);
        if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
        return doc;
      },
    );
  };
  sectionRoute("brand", "brand", patchBrandSchema);
  sectionRoute("identity", "identityAndProduct", patchIdentitySchema);
  sectionRoute("positioning", "purposeAndPositioning", patchPositioningSchema);
  sectionRoute("audience", "audience", patchAudienceSchema);
  sectionRoute("tone", "toneAndVoice", patchToneSchema);
  sectionRoute("market", "marketAndCompetition", patchMarketSchema);

  // -------------------------------------------------------------------------
  // Content angles CRUD
  // -------------------------------------------------------------------------
  r.get(
    `${base}/content-angles`,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, response: { 200: z.array(contentAngleSchema), 404: errorResponseSchema } } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await getDoc(company.id, request.session!.user.id);
      if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
      return doc.contentAngles;
    },
  );

  r.post(
    `${base}/content-angles`,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, body: contentAngleInputSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await addContentAngle(company.id, request.session!.user.id, request.body);
      if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
      return doc;
    },
  );

  r.patch(
    `${base}/content-angles/:angleId`,
    { preHandler: requireSession, schema: { params: angleIdParamsSchema, body: updateContentAngleSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await updateContentAngle(company.id, request.session!.user.id, request.params.angleId, request.body);
      if (!doc) return reply.status(404).send({ error: "Content angle not found" });
      return doc;
    },
  );

  r.delete(
    `${base}/content-angles/:angleId`,
    { preHandler: requireSession, schema: { params: angleIdParamsSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await deleteContentAngle(company.id, request.session!.user.id, request.params.angleId);
      if (!doc) return reply.status(404).send({ error: "Content angle not found" });
      return doc;
    },
  );

  // -------------------------------------------------------------------------
  // Audience segments CRUD
  // -------------------------------------------------------------------------
  r.post(
    `${base}/audience/segments`,
    { preHandler: requireSession, schema: { params: companyIdParamsSchema, body: customerSegmentInputSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await addSegment(company.id, request.session!.user.id, request.body);
      if (!doc) return reply.status(404).send({ error: "Brand intelligence not generated yet" });
      return doc;
    },
  );

  r.patch(
    `${base}/audience/segments/:segmentId`,
    { preHandler: requireSession, schema: { params: segmentIdParamsSchema, body: updateCustomerSegmentSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await updateSegment(company.id, request.session!.user.id, request.params.segmentId, request.body);
      if (!doc) return reply.status(404).send({ error: "Customer segment not found" });
      return doc;
    },
  );

  r.delete(
    `${base}/audience/segments/:segmentId`,
    { preHandler: requireSession, schema: { params: segmentIdParamsSchema, response: docResponse } },
    async (request, reply) => {
      const company = await assertCompany(request, request.params.companyId);
      if (!company) return reply.status(404).send({ error: "Company not found" });
      const doc = await deleteSegment(company.id, request.session!.user.id, request.params.segmentId);
      if (!doc) return reply.status(404).send({ error: "Customer segment not found" });
      return doc;
    },
  );
}
