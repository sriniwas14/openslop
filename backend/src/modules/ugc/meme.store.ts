import { asc } from "drizzle-orm";
import { db } from "../../lib/db";
import { memes } from "../../db/schema";

// ponytail: memes live in Postgres (Neon) only — no in-code fallback library.
// The table has exactly 3 fields (id, description, url); name/tags the pipeline
// needs are derived here so prompts/validation keep working unchanged.
export type MemeEntry = {
  id: string;
  meme: string;
  meme_url: string;
  meme_description: string;
  meme_metadata: string[];
};

export const MEME_VARIATIONS_PER_MEME = 5;

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

/** DB-only: empty table returns [] (caller throws 409); DB errors propagate. */
export async function listMemes(): Promise<MemeEntry[]> {
  const rows = await db.select().from(memes).orderBy(asc(memes.id));
  return rows.map(memeRowToEntry);
}
