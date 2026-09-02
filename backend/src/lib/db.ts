import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";

// ponytail: allow an isolated DB for tests via env (app-level config, not a user secret)
const DB_PATH = process.env.OPENSLOP_DB_PATH ?? "db.sqlite";

export const sqlite = new Database(DB_PATH);
sqlite.exec("PRAGMA foreign_keys = ON");
// ponytail: lazy migrate for router configId (alter table, ignore if exists)
try { sqlite.exec("ALTER TABLE ai_config ADD COLUMN config_id TEXT"); } catch {}
try { sqlite.exec("ALTER TABLE media_job ADD COLUMN router_config_id TEXT"); } catch {}
try { sqlite.exec("ALTER TABLE content ADD COLUMN influencer_id TEXT"); } catch {}

export const db = drizzle(sqlite, { schema });
