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
      },
    },
    async (request, reply) => {
      const [row] = await db
        .insert(companies)
        .values({ ...request.body, userId: request.session!.user.id })
        .returning();

      // ponytail: POST is SSE — hijack to stream workflow progress
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const write = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      let closed = false;
      request.raw.on("close", () => {
        closed = true;
      });

      write("start", { companyId: row.id, name: row.name, website: row.website });

      try {
        const { companyPersonaWorkflow } = await import("./company.workflow");
        const run = await companyPersonaWorkflow.createRun();
        const stream = run.stream({
          inputData: { companyId: row.id, website: row.website!, name: row.name, userId: request.session!.user.id },
        });

        for await (const evt of (stream as any).fullStream ?? stream) {
          if (closed) break;
          write("progress", evt);
        }

        try {
          await (stream as any).result;
        } catch {
          // ponytail: workflow failed — error event handled below, "just try again"
        }

        if (closed) return;

        const [fresh] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, row.id), eq(companies.userId, request.session!.user.id)));
        if (fresh?.persona) {
          write("done", fresh);
        } else {
          const [cur] = await db.select().from(companies).where(eq(companies.id, row.id));
          if (cur?.persona) write("done", cur);
          else write("error", { message: "persona generation failed" });
        }
      } catch (e: any) {
        if (!closed) write("error", { message: e?.message ?? String(e) });
      } finally {
        if (!reply.raw.writableEnded) reply.raw.end();
      }
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
