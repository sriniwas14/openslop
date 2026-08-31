import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolated DB before any module that imports lib/db loads
const tmpDir = mkdtempSync(join(tmpdir(), "openslop-test-"));
process.env.OPENSLOP_DB_PATH = join(tmpDir, "test.sqlite");

const [{ db }, schema] = await Promise.all([
  import("../../lib/db"),
  import("../../db/schema"),
]);
const {
  scrapeAndStorePosts,
  ScrapeError,
} = await import("./instagram.service");
const { normalizeInstagramRow } = await import("./apify.service");

async function resetDb() {
  for (const t of [schema.instagramPosts, schema.instagramSources, schema.instagramScrapeJobs, schema.socialCredentials, schema.companies]) {
    try {
      await db.delete(t);
    } catch {
      /* missing table */
    }
  }
}

function fakeScrape(posts: any[]) {
  return async () => posts.map((p) => normalizeInstagramRow(p));
}

describe("scrapeAndStorePosts", () => {
  beforeAll(async () => {
    // create tables via raw DDL (same shape as schema)
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS company (id text PRIMARY KEY, user_id text NOT NULL, name text, website text, persona text, created_at text, updated_at text)`,
      `CREATE TABLE IF NOT EXISTS social_credential (id text PRIMARY KEY, user_id text NOT NULL, provider text DEFAULT 'apify' NOT NULL, api_key text NOT NULL, created_at text, updated_at text)`,
      `CREATE TABLE IF NOT EXISTS instagram_source (id text PRIMARY KEY, user_id text NOT NULL, company_id text NOT NULL, username text NOT NULL, profile_url text NOT NULL, display_name text, status text, last_scraped_at text, created_at text, updated_at text)`,
      `CREATE TABLE IF NOT EXISTS instagram_post (id text PRIMARY KEY, user_id text NOT NULL, company_id text NOT NULL, source_id text NOT NULL, external_post_id text NOT NULL, shortcode text, post_url text, username text, owner_full_name text, caption text, media_type text, media_url text, thumbnail_url text, published_at text, likes text, comments text, shares text, views text, hashtags text, mentions text, source text, raw_data text, scraped_at text, created_at text, updated_at text)`,
      `CREATE TABLE IF NOT EXISTS instagram_scrape_job (id text PRIMARY KEY, user_id text NOT NULL, company_id text NOT NULL, source_id text NOT NULL, actor_id text NOT NULL, apify_run_id text, dataset_id text, status text, posts_found text, error text, started_at text, completed_at text, created_at text)`,
    ]) {
      try {
        await db.run(sql);
      } catch {}
    }
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("requires a stored Apify key", async () => {
    await resetDb();
    const [comp] = await db.insert(schema.companies).values({ userId: "u1", name: "C", website: "https://c.com" }).returning();
    await expect(
      scrapeAndStorePosts({ userId: "u1", companyId: (comp as any).id, creator: "nike", resultsLimit: 20, scrapeFn: fakeScrape([]) }),
    ).rejects.toThrow(/Apify account/);
  });

  it("requires a valid company (authz: company A owner cannot use company B)", async () => {
    await resetDb();
    const [c1] = await db.insert(schema.companies).values({ userId: "u1", name: "A", website: "https://a.com" }).returning();
    const [c2] = await db.insert(schema.companies).values({ userId: "u2", name: "B", website: "https://b.com" }).returning();
    await db.insert(schema.socialCredentials).values({ userId: "u1", provider: "apify", apiKey: "KEY1" });

    await expect(
      scrapeAndStorePosts({ userId: "u1", companyId: (c2 as any).id, creator: "nike", resultsLimit: 20, scrapeFn: fakeScrape([]) }),
    ).rejects.toThrow(/Company not found/);
    expect((c1 as any).id).toBeTruthy();
  });

  it("creates a creator, stores posts, and deduplicates on the second scrape", async () => {
    await resetDb();
    const [comp] = await db.insert(schema.companies).values({ userId: "u1", name: "C", website: "https://c.com" }).returning();
    const companyId = (comp as any).id;
    await db.insert(schema.socialCredentials).values({ userId: "u1", provider: "apify", apiKey: "KEY1" });

    const postsTwice = [
      { shortcode: "p1", username: "nike", type: "Image", caption: "one", likesCount: 1 },
      { shortcode: "p2", username: "nike", type: "Video", caption: "two", likesCount: 2 },
    ];

    // first scrape
    const r1 = await scrapeAndStorePosts({ userId: "u1", companyId, creator: "@nike", resultsLimit: 20, scrapeFn: fakeScrape(postsTwice) });
    expect(r1.newCount).toBe(2);
    expect(r1.postsFound).toBe(2);
    expect(r1.message).toContain("2 posts scraped");

    // same creator re-scraped → creator reused (same sourceId), no new posts
    const r2 = await scrapeAndStorePosts({ userId: "u1", companyId, creator: "nike", resultsLimit: 20, scrapeFn: fakeScrape(postsTwice) });
    expect(r2.sourceId).toBe(r1.sourceId);
    expect(r2.newCount).toBe(0);

    // count distinct rows — should be 2 after dedup, not 4
    const all = (await db.select().from(schema.instagramPosts).all()) as any[];
    expect(all.length).toBe(2);
  });

  it("creates separate creators/posts per workspace (authz isolation)", async () => {
    await resetDb();
    const [cA] = await db.insert(schema.companies).values({ userId: "u1", name: "A", website: "https://a.com" }).returning();
    const [cB] = await db.insert(schema.companies).values({ userId: "u2", name: "B", website: "https://b.com" }).returning();
    await db.insert(schema.socialCredentials).values({ userId: "u1", provider: "apify", apiKey: "K1" });
    await db.insert(schema.socialCredentials).values({ userId: "u2", provider: "apify", apiKey: "K2" });

    const posts = [{ shortcode: "s1", username: "nike", type: "Image", likesCount: 1 }];

    const ra = await scrapeAndStorePosts({ userId: "u1", companyId: (cA as any).id, creator: "nike", resultsLimit: 10, scrapeFn: fakeScrape(posts) });
    const rb = await scrapeAndStorePosts({ userId: "u2", companyId: (cB as any).id, creator: "nike", resultsLimit: 10, scrapeFn: fakeScrape(posts) });

    // distinct creators (one per workspace) and distinct posts
    const sources = (await db.select().from(schema.instagramSources).all()) as any[];
    expect(sources.length).toBe(2);
    expect(ra.sourceId).not.toBe(rb.sourceId);

    const allPosts = (await db.select().from(schema.instagramPosts).all()) as any[];
    expect(allPosts.length).toBe(2);
    expect(new Set(allPosts.map((p: any) => p.companyId)).size).toBe(2);
  });

  it("returns 'No posts' message and stores none for an empty scrape", async () => {
    await resetDb();
    const [comp] = await db.insert(schema.companies).values({ userId: "u1", name: "C", website: "https://c.com" }).returning();
    await db.insert(schema.socialCredentials).values({ userId: "u1", provider: "apify", apiKey: "KEY1" });
    const r = await scrapeAndStorePosts({
      userId: "u1", companyId: (comp as any).id, creator: "nike", resultsLimit: 20,
      scrapeFn: fakeScrape([]),
    });
    expect(r.postsFound).toBe(0);
    expect(r.message).toBe("No posts were found for this creator.");
    expect(r.storedPosts.length).toBe(0);
  });

  it("guards concurrent duplicate scrapes", async () => {
    await resetDb();
    const [comp] = await db.insert(schema.companies).values({ userId: "u1", name: "C", website: "https://c.com" }).returning();
    await db.insert(schema.socialCredentials).values({ userId: "u1", provider: "apify", apiKey: "KEY1" });
    const companyId = (comp as any).id;

    let release: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    let callCount = 0;
    const slowScrape = async () => {
      callCount++;
      await gate;
      return [normalizeInstagramRow({ shortcode: "p1", username: "nike", type: "Image" })];
    };

    const held = new Set<string>();
    const guard = {
      acquire: (k: string) => { if (held.has(k)) return false; held.add(k); return true; },
      release: (k: string) => held.delete(k),
    };

    const p1 = scrapeAndStorePosts({ userId: "u1", companyId, creator: "nike", resultsLimit: 10, scrapeFn: slowScrape as any, dedupeGuard: guard });
    const p2 = scrapeAndStorePosts({ userId: "u1", companyId, creator: "nike", resultsLimit: 10, scrapeFn: slowScrape as any, dedupeGuard: guard }).catch((e) => e);

    release!();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
    expect(r2).toBeInstanceOf(Error);
    expect(String((r2 as Error).message)).toContain("already running");
    void r1;
  });
});
