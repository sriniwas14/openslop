import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "../env";

// ponytail: Neon Postgres via a pg Pool (better-auth builds its kysely
// adapter from the pool; its getMigrations/runMigrations only supports this
// shape — a raw Kysely instance is not detected). The pooler URL already
// carries ?sslmode=require.
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL, "http://localhost:5173", "http://127.0.0.1:5173"], // ponytail: dev origins — prod is same-origin so BETTER_AUTH_URL suffices
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
});
