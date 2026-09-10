// ponytail: one-shot seed — upsert the launch meme library into Neon.
//   bun src/scripts/seed-memes.ts
// Video files live under R2_PUBLIC_URL (backend/.env, public base URL).
import { db } from "../lib/db";
import { memes } from "../db/schema";

const R2_BASE = (process.env.R2_PUBLIC_URL ?? "https://pub-0a33eb19f0ef4401971cc16eecd2d8ec.r2.dev").replace(/\/+$/, "");

const SEED: { id: string; description: string; url: string }[] = [
  {
    id: "dancing",
    description:
      "A person dancing energetically in a fun and expressive way. Fits celebration, excitement, winning, and humorous reactions.",
    url: `${R2_BASE}/01a525faa9984251b9e088af94cfc890.mp4`,
  },
  {
    id: "angry-annoyed-dog",
    description:
      "An angry and annoyed dog looking directly at the camera. Fits frustration, annoyance, disbelief, and funny reactions.",
    url: `${R2_BASE}/063cb61798bb45759e7638595426f78e.mp4`,
  },
  {
    id: "man-laughing-maniacally",
    description:
      "A man laughing maniacally in an exaggerated way. Fits chaotic situations, unexpected wins, trolling, and exaggerated amusement.",
    url: `${R2_BASE}/1bb039d8c8ff4ef9a5d59280b5e53034.mp4`,
  },
  {
    id: "i-dont-think-so",
    description:
      "A reaction expressing strong doubt or disagreement. Fits rejection, disbelief, skepticism, disagreement, and calling out unrealistic ideas.",
    url: `${R2_BASE}/3c2473bd993943a2bbbae3043f614f13.mp4`,
  },
];

for (const m of SEED) {
  const now = new Date().toISOString();
  await db
    .insert(memes)
    .values({ ...m, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: memes.id,
      set: { description: m.description, url: m.url, updatedAt: now },
    });
}

console.log(`memes seeded: ${SEED.length} rows`);
process.exit(0);
