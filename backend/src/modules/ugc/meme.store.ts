import { asc } from "drizzle-orm";
import { db } from "../../lib/db";
import { memes } from "../../db/schema";
import { MEME_LIBRARY, type MemeEntry } from "./meme.library";

// ponytail: memes live in Postgres (Neon), not code. The table has exactly
// 3 fields (id, description, url); name/tags the pipeline needs are derived
// here so prompts/validation keep working unchanged. Empty table or DB error
// falls back to the in-code constant so generation never hard-fails.
export function memeRowToEntry(row: { id: string; description: string; url: string }): MemeEntry {
  const name = row.id
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
  const tags = Array.from(
    new Set(
      row.description
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3),
    ),
  ).slice(0, 8);
  return {
    id: row.id,
    meme: name || row.id,
    meme_url: row.url,
    meme_description: row.description,
    meme_metadata: tags.length ? tags : ["reaction", "funny"],
  };
}

export async function listMemes(): Promise<MemeEntry[]> {
  try {
    const rows = await db.select().from(memes).orderBy(asc(memes.id));
    if (!rows.length) return MEME_LIBRARY;
    return rows.map(memeRowToEntry);
  } catch {
    return MEME_LIBRARY;
  }
}
