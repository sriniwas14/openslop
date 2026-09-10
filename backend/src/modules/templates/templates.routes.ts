import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { contentTemplates } from "../../db/schema";
import { contentTemplateResponseSchema, mapTemplateRow } from "./templates.schemas";

export async function templateRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ponytail: public GET — templates are global, no auth needed; add requireSession if gating later
  r.get(
    "/content-templates",
    {
      schema: {
        response: { 200: z.array(contentTemplateResponseSchema) },
        description: "List content templates (seeded from data/templates.ts)",
        tags: ["templates"],
      },
    },
    async () => {
      let rows: any[];
      try {
        rows = await db.select().from(contentTemplates).orderBy(desc(contentTemplates.createdAt));
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("no such table")) {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS content_template (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, preview_image TEXT NOT NULL, duration TEXT NOT NULL DEFAULT '15', structure TEXT, style TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
          rows = await db.select().from(contentTemplates).orderBy(desc(contentTemplates.createdAt));
        } else if (msg.includes("no such column")) {
          try { await db.execute(sql`ALTER TABLE content_template ADD COLUMN duration TEXT NOT NULL DEFAULT '15'`); } catch {}
          try { await db.execute(sql`ALTER TABLE content_template ADD COLUMN structure TEXT`); } catch {}
          try { await db.execute(sql`ALTER TABLE content_template ADD COLUMN style TEXT NOT NULL DEFAULT ''`); } catch {}
          rows = await db.select().from(contentTemplates).orderBy(desc(contentTemplates.createdAt));
        } else throw e;
      }
      return rows.map(mapTemplateRow) as any;
    },
  );
}
