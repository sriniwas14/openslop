import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { memes } from "../../db/schema";
import { requireSession } from "../../plugins/auth";
import { errorResponseSchema } from "../ai/ai.schemas";
import {
  createMemeBodySchema,
  mapMemeRow,
  memeIdParamsSchema,
  memeResponseSchema,
  updateMemeBodySchema,
} from "./memes.schemas";

// ponytail: meme library CRUD — memes live in Postgres (Neon), so URL changes
// never need a code edit. Generation reads via meme.store (with in-code fallback).
export async function memesRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/memes",
    {
      preHandler: requireSession,
      schema: { response: { 200: z.array(memeResponseSchema) }, description: "List meme library entries" },
    },
    async () => {
      const rows = await db.select().from(memes).orderBy(asc(memes.id));
      return rows.map(mapMemeRow) as any;
    },
  );

  r.post(
    "/memes",
    {
      preHandler: requireSession,
      schema: {
        body: createMemeBodySchema,
        response: { 201: memeResponseSchema, 409: errorResponseSchema },
        description: "Add a meme library entry",
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof createMemeBodySchema>;
      const now = new Date().toISOString();
      try {
        const [row] = await db
          .insert(memes)
          .values({ id: body.id, description: body.description, url: body.url, createdAt: now, updatedAt: now })
          .returning();
        return reply.status(201).send(mapMemeRow(row as any) as any);
      } catch {
        return reply.status(409).send({ error: "meme id already exists" } as any);
      }
    },
  );

  r.patch(
    "/memes/:id",
    {
      preHandler: requireSession,
      schema: {
        params: memeIdParamsSchema,
        body: updateMemeBodySchema,
        response: { 200: memeResponseSchema, 404: errorResponseSchema },
        description: "Update a meme's description and/or URL",
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateMemeBodySchema>;
      const set: Record<string, string> = { updatedAt: new Date().toISOString() };
      if (body.description !== undefined) set.description = body.description;
      if (body.url !== undefined) set.url = body.url;
      const [row] = await db.update(memes).set(set as any).where(eq(memes.id, id)).returning();
      if (!row) return reply.status(404).send({ error: "meme not found" } as any);
      return mapMemeRow(row as any) as any;
    },
  );

  r.delete(
    "/memes/:id",
    {
      preHandler: requireSession,
      schema: {
        params: memeIdParamsSchema,
        response: { 200: z.object({ ok: z.boolean() }), 404: errorResponseSchema },
        description: "Delete a meme library entry",
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const rows = await db.delete(memes).where(eq(memes.id, id)).returning({ id: memes.id });
      if (!rows.length) return reply.status(404).send({ error: "meme not found" } as any);
      return { ok: true } as any;
    },
  );
}
