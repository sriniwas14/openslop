import { beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { ContentAngle } from "../brand/brand.schemas";
import type { ContentSlot } from "./ugc.prompts";
import type { UgcBatchGenerator, ValidationContext } from "./ugc.service";

// isolated DB before any module that imports lib/db loads. `bun test` runs every file in one
// process, so lib/db is opened once with the FIRST file's path: agree on that path (??=) and
// only clean up on process exit, never in afterAll (see instagram.service.test).
const tmpDir = mkdtempSync(join(tmpdir(), "openslop-ugc-test-"));
process.env.OPENSLOP_DB_PATH ??= join(tmpDir, "test.sqlite");
process.on("exit", () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

const [{ db }, schema] = await Promise.all([import("../../lib/db"), import("../../db/schema")]);
const {
  DEFAULT_TARGET_COUNT,
  UgcError,
  countGeneratedContent,
  generateInitialBrandContent,
  getGenerationJobStatus,
  listGeneratedContent,
  planDistribution,
  validateGeneratedItem,
} = await import("./ugc.service");
const { UGC_PLATFORMS, VISUAL_CATEGORIES, VISUAL_ORIENTATIONS, VISUAL_STYLES } = await import("./ugc.schemas");
const { PROMPT_VERSION } = await import("./ugc.prompts");

// `company` is the only table lib/db does not create lazily — create it before any hook runs
try {
  await db.run(`CREATE TABLE IF NOT EXISTS company (id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, website text NOT NULL, persona text, created_at text NOT NULL, updated_at text NOT NULL)`);
} catch {
  /* already exists */
}

// ---------------------------------------------------------------------------
// Fixtures — a fake AI so these tests never touch a provider
// ---------------------------------------------------------------------------

const POOL = [
  "standup", "whiteboard", "notebook", "checklist", "deadline", "inbox", "calendar", "handover", "spreadsheet", "counter",
  "warehouse", "roster", "clipboard", "timesheet", "waitlist", "renewal", "mailbox", "backorder", "appointment", "signature",
  "printer", "sticker", "shelf", "ladder", "toolbox", "apron", "kettle", "headset", "folder", "binder",
  "lanyard", "badge", "stapler", "envelope", "ledger", "receipt", "basket", "trolley", "label", "roll",
  "stamp", "tape", "string", "bucket", "brush", "glove", "stepstool", "chalkboard", "lamp", "blanket",
  "mug", "tray", "crate", "dolly", "rope", "hinge", "latch", "panel", "drawer", "cabinet",
];

function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Letters-only marker: unique per piece, and keeps digits (fake "statistics") out of fixtures. */
function variantTag(n: number) {
  const l = (k: number) => String.fromCharCode(97 + (Math.floor(n / k) % 26));
  return `var${l(1)}${l(26)}${l(676)}`;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** One valid AI item for a server-assigned slot. `n` must be unique per piece. */
function fakeItem(slot: ContentSlot, n: number) {
  const rand = prng(n * 7919 + 11);
  const w: string[] = [];
  while (w.length < 14) {
    const word = POOL[Math.floor(rand() * POOL.length) % POOL.length];
    if (!w.includes(word)) w.push(word);
  }
  const tag = variantTag(n);
  return {
    hook: `${cap(w[0])} before ${w[1]} (${tag})`,
    title: `${cap(w[2])} ${tag} notes`,
    body: `${cap(w[3])} after ${w[4]}, ${w[5]} around ${w[6]}, ${w[7]} near the ${tag} copy.`,
    lines: [`${cap(w[8])} first`, `${w[9]} second`],
    script: `${cap(w[10])} while ${w[11]}, then ${w[12]} before ${w[13]}.`,
    onScreenText: [`${cap(w[0])} ${tag}`],
    cta: null,
    contentType: slot.contentType,
    platform: slot.platform,
    contentFormat: slot.contentFormat,
    contentAngleId: slot.contentAngleId,
    visualTags: [`${w[0]} on a desk`, `hands holding ${w[1]}`, "morning light through a window", tag],
    visualMood: "calm, honest, everyday",
    visualStyle: "ugc",
    visualCategory: "workspace",
    visualOrientation: "portrait",
  };
}

type FakeState = { calls: number; items: number; notes: (string | null)[] };

function fakeGenerator(opts: { startAt?: number; cap?: number; invalidEvery?: number; alwaysThrow?: boolean } = {}) {
  const state: FakeState = { calls: 0, items: opts.startAt ?? 0, notes: [] };
  const gen: UgcBatchGenerator = async ({ slots, attemptNote }) => {
    state.calls++;
    state.notes.push(attemptNote);
    if (opts.alwaysThrow) throw new Error("provider exploded");
    const items = slots.map((slot, i) => {
      if (opts.cap != null && state.items >= opts.cap) return null; // nothing left to give
      // first attempt only — a retry (attemptNote set) must be able to succeed
      if (opts.invalidEvery && !attemptNote && i % opts.invalidEvery === 0) return { hook: "", title: "" }; // unusable → must be regenerated
      return fakeItem(slot, state.items++);
    });
    return { items, model: "fake-model" };
  };
  return { gen, state };
}

const TOPICS = [
  "morning handovers", "client onboarding", "pricing conversations", "support escalations", "weekly reporting",
  "team notes", "vendor calls", "stock checks", "feedback loops", "shift planning",
];

function seedAngles(count: number): ContentAngle[] {
  const platforms = [["instagram", "linkedin"], ["tiktok", "instagram"], ["linkedin", "x"], ["youtube_shorts", "facebook"], ["instagram", "tiktok"]];
  return Array.from({ length: count }, (_, i) => ({
    id: `angle-${i + 1}`,
    name: `${TOPICS[i % TOPICS.length]} angle`,
    description: `A creator-led look at ${TOPICS[i % TOPICS.length]} and what actually gets in the way.`,
    targetAudience: "operations leads at small teams",
    problem: `${TOPICS[i % TOPICS.length]} quietly eat the morning`,
    coreMessage: `Small habits around ${TOPICS[i % TOPICS.length]} beat heroics`,
    emotionalTrigger: "recognition",
    hookIdeas: [`What nobody says about ${TOPICS[i % TOPICS.length]}`],
    contentTypes: ["story", "mistake", "observation"],
    platforms: platforms[i % platforms.length],
    ctaIdeas: [],
    priority: 5,
    isActive: true,
  })) as ContentAngle[];
}

async function resetDb() {
  for (const t of [schema.generatedContents, schema.contentGenerationJobs, schema.brandIntelligence, schema.companies]) {
    try {
      await db.delete(t);
    } catch {
      /* missing table */
    }
  }
}

async function seedCompany(userId: string, name: string) {
  const [row] = await db.insert(schema.companies).values({ userId, name, website: `https://${name}.test` }).returning();
  return row as any;
}

/** Brand Intelligence "ready" row with content angles — the precondition for generation. */
async function seedBrand(userId: string, companyId: string, angleCount = 10) {
  const angles = seedAngles(angleCount);
  const now = new Date().toISOString();
  await db.insert(schema.brandIntelligence).values({
    userId,
    companyId,
    status: "ready",
    error: null,
    brand: JSON.stringify({ name: "Testbrand", website: "https://testbrand.test", description: "Tooling for small operations teams." }),
    identityAndProduct: JSON.stringify({ productOffering: "A shared board for handovers", productFeatures: ["shift notes", "checklists"] }),
    audience: JSON.stringify({
      primaryAudience: "operations leads",
      customerSegments: [{ id: "seg-1", name: "Small ops teams", problems: ["lost handovers"], desires: ["calm mornings"], objections: ["another tool"] }],
    }),
    toneAndVoice: JSON.stringify({ tone: ["plain"], personality: ["practical"], wordsToUse: ["handover"], wordsToAvoid: ["hype"] }),
    contentAngles: JSON.stringify(angles),
    createdAt: now,
    updatedAt: now,
  } as any);
  return angles;
}

async function allRows() {
  return (await db.select().from(schema.generatedContents).all()) as any[];
}

const slotFixture: ContentSlot = { contentAngleId: "angle-1", platform: "instagram", contentFormat: "talking_head", contentType: "story" };

function validationCtx(memory?: Partial<ValidationContext["memory"]>): ValidationContext {
  return {
    slot: slotFixture,
    angleIds: ["angle-1", "angle-2"],
    brandText: "Testbrand makes a shared board for handovers.",
    allowedPhrases: [],
    memory: { hashes: new Set<string>(), tokens: [], hooks: [], ...(memory ?? {}) },
  };
}

/** Accept an item and add it to the dedupe memory, exactly like the run loop does. */
function accept(ctx: ValidationContext, raw: unknown) {
  const res = validateGeneratedItem(raw, ctx);
  expect(res.ok).toBe(true);
  if (res.ok) {
    ctx.memory.hashes.add(res.item.contentHash);
    ctx.memory.tokens.push(res.item.tokens);
    ctx.memory.hooks.push(res.item.hook);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Happy path — spec §21 tests 2, 3, 4, 5, 10, 11, 12
// ---------------------------------------------------------------------------

describe("generateInitialBrandContent", () => {
  let companyId = "";
  let angles: ContentAngle[] = [];
  let result: any = null;
  let rows: any[] = [];

  beforeAll(async () => {
    await resetDb();
    const company = await seedCompany("u1", "testbrand");
    companyId = company.id;
    angles = await seedBrand("u1", companyId, 10);
    const { gen } = fakeGenerator();
    result = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 100, generateFn: gen, concurrency: 3 });
    rows = await allRows();
  });

  it("creates at least 100 valid records and completes the job (test 2)", async () => {
    expect(DEFAULT_TARGET_COUNT).toBe(100);
    expect(result.status).toBe("completed");
    expect(result.generatedCount).toBeGreaterThanOrEqual(100);
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(await countGeneratedContent(companyId)).toBe(rows.length);
    // every saved piece is usable: hook + the fields its format needs + a canonical classification
    for (const row of rows) {
      expect((row.hook ?? "").trim().length).toBeGreaterThan(7);
      expect(UGC_PLATFORMS).toContain(row.platform);
      expect(row.status).toBe("generated"); // spec §15
      expect(row.source).toBe("ai");
      expect(row.promptVersion).toBe(PROMPT_VERSION);
      expect(row.model).toBe("fake-model");
      expect(row.jobId).toBe(result.jobId);
    }
    const status = await getGenerationJobStatus({ companyId, userId: "u1" });
    expect(status.status).toBe("completed");
    expect(status.savedCount).toBeGreaterThanOrEqual(100);
    expect(status.completedAt).toBeTruthy();
  });

  it("stores the correct brandId on every record (test 3)", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.companyId)).size).toBe(1);
    expect(rows.every((r) => r.companyId === companyId)).toBe(true);
    expect(rows.every((r) => r.userId === "u1")).toBe(true);
  });

  it("only uses content angles that belong to this brand (test 4)", () => {
    const own = new Set(angles.map((a) => a.id));
    for (const row of rows) expect(own.has(row.contentAngleId)).toBe(true);

    // an angle id from another brand is rejected, never saved
    const foreign = fakeItem(slotFixture, 9001);
    const res = validateGeneratedItem({ ...foreign, contentAngleId: "angle-of-another-brand" }, validationCtx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/does not belong to this brand/);
  });

  it("distributes content across angles, platforms and formats (test 5)", () => {
    const perAngle = new Map<string, number>();
    for (const row of rows) perAngle.set(row.contentAngleId, (perAngle.get(row.contentAngleId) ?? 0) + 1);
    expect(perAngle.size).toBe(10); // every angle is used
    for (const [, count] of perAngle) {
      expect(count).toBeGreaterThanOrEqual(5); // ~10 angles x ~10 pieces
      expect(count).toBeLessThanOrEqual(20); // no angle swallows the run
    }
    expect(new Set(rows.map((r) => r.platform)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.map((r) => r.contentFormat)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.map((r) => r.contentType)).size).toBeGreaterThanOrEqual(4);
  });

  it("saves visual search metadata and leaves visual ids empty (test 10)", () => {
    for (const row of rows) {
      const tags = JSON.parse(row.visualTags ?? "[]");
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThanOrEqual(2);
      expect(tags.every((t: string) => typeof t === "string" && t.trim().length > 1)).toBe(true);
      expect((row.visualMood ?? "").trim().length).toBeGreaterThan(0);
      expect(VISUAL_STYLES).toContain(row.visualStyle);
      expect(VISUAL_CATEGORIES).toContain(row.visualCategory);
      expect(VISUAL_ORIENTATIONS).toContain(row.visualOrientation);
      // the visual pipeline has not run yet
      expect(row.visualAssetId).toBeNull();
      expect(row.visualIntentId).toBeNull();
      expect(row.usageCount).toBe("0");
      expect(row.isEdited).toBe("0");
    }
  });

  it("can be queried later by brandId and by every filter (test 11)", async () => {
    const all = await listGeneratedContent({ companyId, userId: "u1" });
    expect(all.total).toBe(rows.length);
    expect(all.items.length).toBe(rows.length);

    const oneAngle = await listGeneratedContent({ companyId, userId: "u1", query: { contentAngleId: "angle-3" } });
    expect(oneAngle.total).toBeGreaterThan(0);
    expect(oneAngle.items.every((i) => i.contentAngleId === "angle-3")).toBe(true);

    const platform = rows[0].platform;
    const byPlatform = await listGeneratedContent({ companyId, userId: "u1", query: { platform } });
    expect(byPlatform.total).toBeGreaterThan(0);
    expect(byPlatform.items.every((i) => i.platform === platform)).toBe(true);

    const format = rows[0].contentFormat;
    const byFormat = await listGeneratedContent({ companyId, userId: "u1", query: { contentFormat: format } });
    expect(byFormat.items.every((i) => i.contentFormat === format)).toBe(true);

    const type = rows[0].contentType;
    const byType = await listGeneratedContent({ companyId, userId: "u1", query: { contentType: type } });
    expect(byType.items.every((i) => i.contentType === type)).toBe(true);

    const byStatus = await listGeneratedContent({ companyId, userId: "u1", query: { status: "generated" } });
    expect(byStatus.total).toBe(rows.length);

    // pagination
    const page = await listGeneratedContent({ companyId, userId: "u1", query: { limit: 10, offset: 10 } });
    expect(page.items.length).toBe(10);
    expect(page.total).toBe(rows.length);
  });

  it("retrieves content that has no visualAssetId yet (test 12)", async () => {
    const ready = await listGeneratedContent({ companyId, userId: "u1", query: { visualReady: "true" } });
    expect(ready.total).toBe(rows.length);
    expect(ready.items.every((i) => i.visualAssetId === null)).toBe(true);

    // the future visual studio attaches an asset — those rows drop out of the queue
    for (const row of rows.slice(0, 4)) {
      await db.update(schema.generatedContents).set({ visualAssetId: `asset-${row.id}`, status: "visual_matched" }).where(eq(schema.generatedContents.id, row.id));
    }
    const stillWaiting = await listGeneratedContent({ companyId, userId: "u1", query: { visualReady: "true" } });
    expect(stillWaiting.total).toBe(rows.length - 4);
    const matched = await listGeneratedContent({ companyId, userId: "u1", query: { visualReady: "false" } });
    expect(matched.total).toBe(4);
    expect(matched.items.every((i) => i.visualAssetId !== null)).toBe(true);
  });

  it("is a no-op when the target is already met — no duplicate content on re-run", async () => {
    const before = await allRows();
    const { gen } = fakeGenerator({ startAt: 5000 });
    const again = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 100, generateFn: gen });
    expect(again.status).toBe("completed");
    expect(again.savedThisRun).toBe(0);
    const after = await allRows();
    expect(after.length).toBe(before.length);
    expect(new Set(after.map((r) => r.contentHash)).size).toBe(after.length);
  });
});

// ---------------------------------------------------------------------------
// Duplicates + invalid AI output — spec §21 tests 6, 7 and §12/§19 rules
// ---------------------------------------------------------------------------

describe("validation and duplicate prevention", () => {
  let companyId = "";

  beforeAll(async () => {
    await resetDb();
    const company = await seedCompany("u1", "testbrand");
    companyId = company.id;
    await seedBrand("u1", companyId, 4);
  });

  it("rejects duplicates and near-duplicates instead of saving them (test 6)", async () => {
    // every slot answered with the same piece → only the first one may be saved
    const same: UgcBatchGenerator = async ({ slots }) => ({ items: slots.map((slot) => fakeItem(slot, 0)), model: "fake-model" });
    const res = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 20, generateFn: same });
    expect(res.status).toBe("failed");
    const rows = await allRows();
    expect(rows.length).toBe(1); // never 20 copies of one idea
    expect(new Set(rows.map((r) => r.contentHash)).size).toBe(1);
    expect(res.error).toMatch(/Generated 1 of 20/);

    // "one word changed" is not a different perspective
    const ctx = validationCtx();
    const raw = fakeItem(slotFixture, 42) as any;
    accept(ctx, raw);
    const nearDuplicate = { ...raw, hook: raw.hook.replace("before", "around"), title: `${raw.title} again` };
    const dup = validateGeneratedItem(nearDuplicate, ctx);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toMatch(/too similar/);

    // exact hash match
    const exact = validateGeneratedItem(raw, ctx);
    expect(exact.ok).toBe(false);
    if (!exact.ok) expect(exact.reason).toMatch(/duplicate/);
  });

  it("handles invalid AI responses without crashing or saving junk (test 7)", async () => {
    await resetDb(); // resetDb() also drops the company row, so re-seed ownership first
    companyId = (await seedCompany("u1", "testbrand")).id;
    await seedBrand("u1", companyId, 4);
    const junk: UgcBatchGenerator = async ({ slots }) => ({ items: slots.map(() => "not an object"), model: "fake-model" });
    const res = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 20, generateFn: junk });
    expect(res.status).toBe("failed");
    expect(await allRows()).toHaveLength(0);
    const status = await getGenerationJobStatus({ companyId, userId: "u1" });
    expect(status.status).toBe("failed");
    expect(status.error).toBeTruthy();

    // a throwing provider is caught per batch, not per run
    const { gen } = fakeGenerator({ alwaysThrow: true });
    const threw = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 20, generateFn: gen });
    expect(threw.status).toBe("failed");
    expect(await allRows()).toHaveLength(0);
  });

  it("rejects unusable, fabricated or mislabelled items before persistence (§19)", () => {
    const raw = fakeItem(slotFixture, 7) as any;
    const cases: { name: string; item: unknown; reason: RegExp }[] = [
      { name: "not an object", item: null, reason: /non-empty hook|not a JSON object/ },
      { name: "missing hook", item: { ...raw, hook: "  " }, reason: /non-empty hook/ },
      { name: "hook too short", item: { ...raw, hook: "hi" }, reason: /too short/ },
      { name: "unsupported platform", item: { ...raw, platform: "myspace" }, reason: /platform/ },
      { name: "wrong platform for the slot", item: { ...raw, platform: "tiktok" }, reason: /platform mismatch/ },
      { name: "unsupported format", item: { ...raw, contentFormat: "hologram" }, reason: /contentFormat/ },
      { name: "wrong format for the slot", item: { ...raw, contentFormat: "meme" }, reason: /contentFormat mismatch/ },
      { name: "missing script for talking_head", item: { ...raw, script: null }, reason: /non-empty script/ },
      { name: "invented statistic", item: { ...raw, body: `${raw.body} Teams save 40% of their morning.` }, reason: /invented statistic/ },
      { name: "invented testimonial", item: { ...raw, body: `${raw.body} Our customers say it changed everything.` }, reason: /invented testimonial/ },
      { name: "unsupported promise", item: { ...raw, body: `${raw.body} Guaranteed to fix handovers.` }, reason: /unsupported promise/ },
      { name: "generic marketing phrase", item: { ...raw, body: `${raw.body} A game changer for handovers.` }, reason: /generic marketing phrase/ },
      { name: "meaningless visual tags", item: { ...raw, visualTags: ["photo", "image", "content"] }, reason: /visualTags/ },
      { name: "missing visual metadata", item: { ...raw, visualCategory: null, visualMood: "" }, reason: /visual/ },
    ];
    for (const c of cases) {
      const res = validateGeneratedItem(c.item, validationCtx());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(c.reason);
    }

    // a number that exists in Brand Intelligence is not invented
    const brandCtx = validationCtx();
    brandCtx.brandText = "Testbrand teams save 40% of their morning.";
    const allowed = validateGeneratedItem({ ...raw, body: `${raw.body} Teams save 40% of their morning.` }, brandCtx);
    expect(allowed.ok).toBe(true);

    // brand vocabulary may use a phrase from the blocklist
    const vocabCtx = validationCtx();
    vocabCtx.allowedPhrases = ["game changer"];
    expect(validateGeneratedItem({ ...raw, body: `${raw.body} A game changer for handovers.` }, vocabCtx).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Retry + resume — spec §21 tests 8, 9, 14
// ---------------------------------------------------------------------------

describe("retry and resume", () => {
  let companyId = "";

  beforeAll(async () => {
    await resetDb();
    const company = await seedCompany("u1", "testbrand");
    companyId = company.id;
    await seedBrand("u1", companyId, 10);
  });

  it("regenerates only the failed items of a batch (test 8)", async () => {
    const { gen, state } = fakeGenerator({ invalidEvery: 3 }); // 2 of every 5 items come back unusable
    const res = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 100, generateFn: gen });
    expect(res.status).toBe("completed");
    expect((await allRows()).length).toBeGreaterThanOrEqual(100);
    expect(state.calls).toBeGreaterThan(20); // more calls than the 20 first-round batches → retries happened
    const retried = state.notes.filter((n) => n && n.length > 0);
    expect(retried.length).toBeGreaterThan(0);
    expect(retried.some((n) => /non-empty hook/.test(n ?? ""))).toBe(true); // the reason is fed back to the model
  });

  it("resumes after a failed run without duplicating saved content (tests 9 + 14)", async () => {
    await resetDb();
    companyId = (await seedCompany("u1", "testbrand")).id;
    await seedBrand("u1", companyId, 10);

    // run 1: the provider gives up after 60 pieces → the job fails with partial progress
    const partial = fakeGenerator({ cap: 60 });
    const first = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 100, generateFn: partial.gen });
    expect(first.status).toBe("failed");
    expect(first.generatedCount).toBe(60);
    const savedBefore = await allRows();
    expect(savedBefore.length).toBe(60);
    const failedJob = await getGenerationJobStatus({ companyId, userId: "u1" });
    expect(failedJob.status).toBe("failed");
    expect(failedJob.error).toMatch(/Generated 60 of 100/);

    // run 2: same job row, resumes from what is already saved
    const resume = fakeGenerator({ startAt: 60 });
    const second = await generateInitialBrandContent({ companyId, userId: "u1", targetCount: 100, generateFn: resume.gen });
    expect(second.status).toBe("completed");
    expect(second.jobId).toBe(first.jobId); // one job per brand+type, reused
    expect(second.savedThisRun).toBe(40);

    const savedAfter = await allRows();
    expect(savedAfter.length).toBe(100);
    expect(new Set(savedAfter.map((r) => r.contentHash)).size).toBe(100); // no duplicates from the retry
    const idsBefore = new Set(savedBefore.map((r) => r.id));
    expect(savedAfter.filter((r) => idsBefore.has(r.id)).length).toBe(60); // earlier pieces untouched
    const done = await getGenerationJobStatus({ companyId, userId: "u1" });
    expect(done.status).toBe("completed");
    expect(done.savedCount).toBe(100);
  });

  it("refuses to run when Brand Intelligence is not ready or the brand is unknown", async () => {
    await resetDb();
    const company = await seedCompany("u1", "noready");
    await db.insert(schema.brandIntelligence).values({
      userId: "u1",
      companyId: company.id,
      status: "analyzing",
      contentAngles: JSON.stringify([]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    const { gen } = fakeGenerator();
    await expect(generateInitialBrandContent({ companyId: company.id, userId: "u1", generateFn: gen })).rejects.toThrow(/not ready/);

    // no Brand Intelligence row at all
    const bare = await seedCompany("u1", "bare");
    await expect(generateInitialBrandContent({ companyId: bare.id, userId: "u1", generateFn: gen })).rejects.toThrow(/not ready/);

    // ready, but zero content angles
    const noAngles = await seedCompany("u1", "noangles");
    await seedBrand("u1", noAngles.id, 0);
    await expect(generateInitialBrandContent({ companyId: noAngles.id, userId: "u1", generateFn: gen })).rejects.toThrow(/content angles/);

    // unknown brand
    await expect(generateInitialBrandContent({ companyId: "does-not-exist", userId: "u1", generateFn: gen })).rejects.toThrow(/Company not found/);
    expect(await allRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Isolation — spec §21 test 13
// ---------------------------------------------------------------------------

describe("cross-brand isolation", () => {
  let companyA = "";
  let companyB = "";

  beforeAll(async () => {
    await resetDb();
    const a = await seedCompany("u1", "branda");
    const b = await seedCompany("u2", "brandb");
    companyA = a.id;
    companyB = b.id;
    await seedBrand("u1", companyA, 4);
    await seedBrand("u2", companyB, 4);
    const { gen } = fakeGenerator();
    await generateInitialBrandContent({ companyId: companyA, userId: "u1", targetCount: 20, generateFn: gen });
  });

  it("never leaks content between brands (test 13)", async () => {
    const a = await listGeneratedContent({ companyId: companyA, userId: "u1" });
    expect(a.total).toBe(20);

    // brand B has its own ready Brand Intelligence but has not generated anything
    const b = await listGeneratedContent({ companyId: companyB, userId: "u2" });
    expect(b.total).toBe(0);
    expect((await getGenerationJobStatus({ companyId: companyB, userId: "u2" })).status).toBe("none");

    // another user cannot read or drive brand A's content
    await expect(listGeneratedContent({ companyId: companyA, userId: "u2" })).resolves.toEqual({ items: [], total: 0 });
    await expect(getGenerationJobStatus({ companyId: companyA, userId: "u2" })).rejects.toBeInstanceOf(UgcError);
    await expect(getGenerationJobStatus({ companyId: companyA, userId: "u2" })).rejects.toThrow(/Company not found/);
    const { gen } = fakeGenerator();
    await expect(generateInitialBrandContent({ companyId: companyA, userId: "u2", generateFn: gen })).rejects.toThrow(/Company not found/);

    // and nothing new was written for brand B by those attempts
    expect((await db.select().from(schema.generatedContents).where(eq(schema.generatedContents.companyId, companyB))).length).toBe(0);
    const rows = await allRows();
    expect(rows.every((r) => r.companyId === companyA && r.userId === "u1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Distribution plan — spec §14 (10 angles x ~10 pieces, adapts to any angle count)
// ---------------------------------------------------------------------------

describe("planDistribution", () => {
  it("spreads the target over the brand's own angles", () => {
    const angles = seedAngles(10);
    const plan = planDistribution(angles, 100);
    expect(plan.length).toBe(100);
    const perAngle = new Map<string, number>();
    for (const slot of plan) perAngle.set(slot.contentAngleId, (perAngle.get(slot.contentAngleId) ?? 0) + 1);
    expect(perAngle.size).toBe(10);
    expect([...perAngle.values()].every((n) => n === 10)).toBe(true);
    expect(plan.every((s) => UGC_PLATFORMS.includes(s.platform))).toBe(true);

    // fewer angles than pieces, more angles than pieces, inactive angles
    expect(planDistribution(seedAngles(3), 100).length).toBe(100);
    expect(planDistribution(seedAngles(40), 12).length).toBe(12);
    const withInactive = seedAngles(4).map((a, i) => (i < 2 ? { ...a, isActive: false } : a)) as ContentAngle[];
    const activeOnly = planDistribution(withInactive, 20);
    expect(activeOnly.length).toBe(20);
    expect(activeOnly.every((s) => s.contentAngleId === "angle-3" || s.contentAngleId === "angle-4")).toBe(true);
    expect(planDistribution([], 100)).toHaveLength(0);
  });
});
