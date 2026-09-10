import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  // ponytail: Neon Postgres is the only database (sqlite removed) — pooler URL needs ?sslmode=require
  DATABASE_URL: z.url(),
  // ponytail: public R2 bucket base for meme videos — public URL, safe to
  // default. The library/seed store "<base>/<file>.mp4", never secrets.
  R2_PUBLIC_URL: z.url().default("https://pub-0a33eb19f0ef4401971cc16eecd2d8ec.r2.dev"),
  // ponytail: server-side only — the visual discovery feed's Pexels key. Never sent to the
  // client. Read lazily via process.env in pexels.service so read-only paths/tests don't need it.
  PEXELS_API_KEY: z.string().optional(),
  // ponytail: stringbool — coerce would treat "false" as true
  DRYRUN: z.stringbool().default(false),
});

export const env = envSchema.parse(process.env);
