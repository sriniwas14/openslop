import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { env } from "../env";

// ponytail: Neon Postgres is the only database (sqlite removed). The pooler
// endpoint disallows prepared statements, so `prepare: false` is required.
const client = postgres(env.DATABASE_URL, { prepare: false, ssl: "require" });

export const db = drizzle(client, { schema });
export { schema };
