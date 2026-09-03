import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "../lib/db";
import { auth } from "../lib/auth";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");

// ponytail: idempotent seed — refresh existing rows with new columns, insert when empty
try {
  const { CONTENT_TEMPLATES } = await import("../../data/templates");
  const { contentTemplates } = await import("../db/schema");
  const existing = await db.select().from(contentTemplates);
  if (!existing.length && CONTENT_TEMPLATES.length) {
    const now = new Date().toISOString();
    await db.insert(contentTemplates).values(
      (CONTENT_TEMPLATES as readonly any[]).map((t) => ({
        title: t.title,
        prompt: t.prompt,
        previewImage: t.previewImage,
        duration: (t as any).duration ?? "15",
        structure: (t as any).structure ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    );
    console.log(`seeded ${CONTENT_TEMPLATES.length} content templates`);
  } else if (existing.length) {
    // backfill / refresh previewImage + new columns from seed (templates are global, safe to sync)
    const now = new Date().toISOString();
    for (const t of CONTENT_TEMPLATES as readonly any[]) {
      const match = existing.find((r: any) => r.title === t.title);
      if (match) {
        await db.update(contentTemplates)
          .set({ previewImage: t.previewImage, duration: t.duration ?? "15", structure: t.structure ?? null, updatedAt: now } as any)
          .where((await import("drizzle-orm")).eq(contentTemplates.id, match.id));
      } else {
        await db.insert(contentTemplates).values({
          title: t.title, prompt: t.prompt, previewImage: t.previewImage,
          duration: t.duration ?? "15", structure: t.structure ?? null,
          createdAt: now, updatedAt: now,
        } as any);
      }
    }
    console.log(`content templates: synced ${CONTENT_TEMPLATES.length} (existing ${existing.length})`);
  } else {
    console.log(`content templates: no templates to seed`);
  }
} catch (e: any) {
  console.warn("template seed skipped:", e?.message ?? e);
}
