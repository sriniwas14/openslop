import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";

export const sqlite = new Database("db.sqlite");
sqlite.exec("PRAGMA foreign_keys = ON");
// ponytail: lazy migrate for router configId (alter table, ignore if exists)
try { sqlite.exec("ALTER TABLE ai_config ADD COLUMN config_id TEXT"); } catch {}
try { sqlite.exec("ALTER TABLE media_job ADD COLUMN router_config_id TEXT"); } catch {}

export const db = drizzle(sqlite, { schema });
