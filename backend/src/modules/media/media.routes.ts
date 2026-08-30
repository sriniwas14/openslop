import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies, contents, mediaJobs } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { createMediaJob, pollMediaJob } from "./media.service";
import {
  createMediaJobSchema,
  mediaContentParamsSchema,
  mediaErrorResponseSchema,
  mediaJobIdParamsSchema,
  mediaJobResponseSchema,
} from "./media.schemas";

export async function mediaRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post("/media/jobs", {
    preHandler: requireSession,
    schema: { body: createMediaJobSchema, response: { 201: mediaJobResponseSchema, 400: mediaErrorResponseSchema, 404: mediaErrorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    const body = request.body as any;
    const [company] = await db.select().from(companies).where(and(eq(companies.id, body.companyId), eq(companies.userId, request.session.user.id)));
    if (!company) return reply.status(404).send({ error: "Company not found" } as any);
    if (body.contentId) {
      const [content] = await db.select().from(contents).where(and(eq(contents.id, body.contentId), eq(contents.companyId, body.companyId), eq(contents.userId, request.session.user.id)));
      if (!content) return reply.status(404).send({ error: "Content not found" } as any);
    }
    try {
      const job = await createMediaJob({ userId: request.session.user.id, ...body });
      return reply.status(201).send(job as any);
    } catch (error: any) {
      return reply.status(400).send({ error: error?.message ?? "Could not create media job" } as any);
    }
  });

  r.get("/media/jobs/:id", {
    preHandler: requireSession,
    schema: { params: mediaJobIdParamsSchema, response: { 200: mediaJobResponseSchema, 404: mediaErrorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    const [job] = await db.select().from(mediaJobs).where(and(eq(mediaJobs.id, request.params.id), eq(mediaJobs.userId, request.session.user.id)));
    if (!job) return reply.status(404).send({ error: "Media job not found" } as any);
    await pollMediaJob(job.id);
    const [freshJob] = await db.select().from(mediaJobs).where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.userId, request.session.user.id)));
    return freshJob as any;
  });

  r.get("/contents/:contentId/media-jobs", {
    preHandler: requireSession,
    schema: { params: mediaContentParamsSchema, response: { 200: mediaJobResponseSchema.array(), 404: mediaErrorResponseSchema } },
  }, async (request, reply) => {
    if (!request.session) return;
    const [content] = await db.select().from(contents).where(and(eq(contents.id, request.params.contentId), eq(contents.userId, request.session.user.id)));
    if (!content) return reply.status(404).send({ error: "Content not found" } as any);
    return await db.select().from(mediaJobs).where(and(eq(mediaJobs.contentId, request.params.contentId), eq(mediaJobs.userId, request.session.user.id))) as any;
  });
}
