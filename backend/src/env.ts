import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  // ponytail: stringbool — coerce would treat "false" as true
  DRYRUN: z.stringbool().default(false),
});

export const env = envSchema.parse(process.env);
