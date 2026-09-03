import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  // ponytail: server-side only — the visual discovery feed's Pexels key. Never sent to the
  // client. Read lazily via process.env in pexels.service so read-only paths/tests don't need it.
  PEXELS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
