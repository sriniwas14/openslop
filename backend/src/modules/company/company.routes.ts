import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { companies } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import {
  companyResponseSchema,
  companyIdParamsSchema,
  createCompanySchema,
  errorResponseSchema,
  updateCompanySchema,
} from "./company.schemas";

export async function companyRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/companies",
    {
      preHandler: requireSession,
      schema: {
        body: createCompanySchema,
        response: { 201: companyResponseSchema },
      },
    },
    async (request, reply) => {
      const [row] = await db
        .insert(companies)
        .values({ ...request.body, userId: request.session!.user.id })
        .returning();
      return reply.status(201).send(row);
    },
  );

  r.get(
    "/companies",
    {
      preHandler: requireSession,
      schema: {
        response: { 200: z.array(companyResponseSchema) },
      },
    },
    async (request) =>
      db
        .select()
        .from(companies)
        .where(eq(companies.userId, request.session!.user.id))
        .orderBy(desc(companies.createdAt)),
  );

  r.get(
    "/companies/:id",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        response: { 200: companyResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const [row] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, request.params.id),
            eq(companies.userId, request.session!.user.id),
          ),
        );
      if (!row) {
        return reply.status(404).send({ error: "Not found" });
      }
      return row;
    },
  );

  r.patch(
    "/companies/:id",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        body: updateCompanySchema,
        response: { 200: companyResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const [row] = await db
        .update(companies)
        .set({ ...request.body, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(companies.id, request.params.id),
            eq(companies.userId, request.session!.user.id),
          ),
        )
        .returning();
      if (!row) {
        return reply.status(404).send({ error: "Not found" });
      }
      return row;
    },
  );

  r.delete(
    "/companies/:id",
    {
      preHandler: requireSession,
      schema: {
        params: companyIdParamsSchema,
        response: {
          200: z.object({ success: z.boolean() }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const rows = await db
        .delete(companies)
        .where(
          and(
            eq(companies.id, request.params.id),
            eq(companies.userId, request.session!.user.id),
          ),
        )
        .returning({ id: companies.id });
      if (!rows.length) {
        return reply.status(404).send({ error: "Not found" });
      }
      return { success: true };
    },
  );
}
