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
// ponytail: lazy create — app doesn't auto-run drizzle migrations on boot; idempotent with 0008 migration
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS brand_intelligence (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    brand TEXT,
    identity_and_product TEXT,
    purpose_and_positioning TEXT,
    audience TEXT,
    tone_and_voice TEXT,
    content_angles TEXT,
    market_and_competition TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_brand_intel_user ON brand_intelligence (user_id)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_intel_company ON brand_intelligence (company_id)");
} catch {}
// ponytail: lazy create — idempotent with the 0009 migration (generated UGC content + its job)
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS generated_content (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    job_id TEXT,
    content_angle_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    content_format TEXT NOT NULL,
    content_type TEXT NOT NULL,
    generation_mode TEXT NOT NULL DEFAULT 'initial',
    language TEXT NOT NULL DEFAULT 'en',
    hook TEXT,
    title TEXT,
    body TEXT,
    lines TEXT,
    script TEXT,
    on_screen_text TEXT,
    cta TEXT,
    visual_tags TEXT,
    visual_mood TEXT,
    visual_style TEXT,
    visual_category TEXT,
    visual_orientation TEXT NOT NULL DEFAULT 'portrait',
    status TEXT NOT NULL DEFAULT 'generated',
    source TEXT NOT NULL DEFAULT 'ai',
    model TEXT,
    prompt_version TEXT,
    content_hash TEXT,
    visual_intent_id TEXT,
    visual_asset_id TEXT,
    usage_count TEXT NOT NULL DEFAULT '0',
    is_edited TEXT NOT NULL DEFAULT '0',
    edited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_user ON generated_content (user_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_company ON generated_content (company_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_angle ON generated_content (company_id, content_angle_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content (company_id, status)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_visual_ready ON generated_content (company_id, visual_asset_id)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_content_hash ON generated_content (company_id, content_hash)");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS content_generation_job (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'initial_content_generation',
    target_count TEXT NOT NULL DEFAULT '100',
    generated_count TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    model TEXT,
    prompt_version TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_content_gen_job_user ON content_generation_job (user_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_content_gen_job_status ON content_generation_job (status)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_content_gen_job_company_type ON content_generation_job (company_id, type)");
} catch {}
// ponytail: lazy create — idempotent with the 0010 migration (visual discovery feed).
// Adds VisualAsset + batch + daily-limit tables and the visual_search_status columns on
// generated_content. ALTER TABLE ... ADD COLUMN is wrapped so an existing column is a no-op.
try { sqlite.exec("ALTER TABLE generated_content ADD COLUMN visual_search_status TEXT NOT NULL DEFAULT 'pending'"); } catch {}
try { sqlite.exec("ALTER TABLE generated_content ADD COLUMN visual_search_error TEXT"); } catch {}
try {
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_generated_content_visual_search ON generated_content (company_id, visual_search_status)");
} catch {}
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS visual_asset (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'pexels',
    source_asset_id TEXT NOT NULL,
    source_url TEXT,
    preview_url TEXT,
    download_url TEXT,
    local_url TEXT,
    width TEXT,
    height TEXT,
    orientation TEXT,
    alt_text TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_visual_asset_company ON visual_asset (company_id)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_visual_asset_source_id ON visual_asset (source, source_asset_id)");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS visual_search_batch (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    date TEXT NOT NULL,
    batch_number TEXT NOT NULL DEFAULT '1',
    cursor_key TEXT NOT NULL DEFAULT 'start',
    status TEXT NOT NULL DEFAULT 'pending',
    size TEXT NOT NULL DEFAULT '0',
    matched_count TEXT NOT NULL DEFAULT '0',
    needs_review_count TEXT NOT NULL DEFAULT '0',
    failed_count TEXT NOT NULL DEFAULT '0',
    content_ids TEXT,
    next_cursor TEXT,
    has_more TEXT NOT NULL DEFAULT '0',
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_visual_batch_company_status ON visual_search_batch (company_id, status)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_visual_batch_company_date_cursor ON visual_search_batch (company_id, date, cursor_key)");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS visual_feed_daily (
    company_id TEXT NOT NULL,
    date TEXT NOT NULL,
    user_id TEXT NOT NULL,
    prepared_count TEXT NOT NULL DEFAULT '0',
    daily_limit TEXT NOT NULL DEFAULT '100',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (company_id, date)
  )`);
} catch {}

export const db = drizzle(sqlite, { schema });
