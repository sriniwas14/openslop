import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";

// ponytail: allow an isolated DB for tests via env (app-level config, not a user secret)
const DB_PATH = process.env.OPENSLOP_DB_PATH ?? "db.sqlite";

export const sqlite = new Database(DB_PATH);
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
