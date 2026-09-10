import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "../lib/db";
import { auth } from "../lib/auth";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

await migrate(db, { migrationsFolder: "./drizzle-pg" });
console.log("migrations applied");
process.exit(0);
