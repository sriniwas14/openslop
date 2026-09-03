import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "../lib/db";
import { auth } from "../lib/auth";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
