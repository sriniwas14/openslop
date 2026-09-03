import { afterAll, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

// isolated DB before any module that imports lib/db loads. `bun test` runs every file in one
// process, so lib/db is opened once with the FIRST file's path: agree on that path (??=) and
// only clean up on process exit — deleting it in afterAll pulls the file out from under the
// still-open connection and every later DB test fails with SQLITE_IOERR.
const tmpDir = mkdtempSync(join(tmpdir(), "openslop-ugc-trigger-"));
process.env.OPENSLOP_DB_PATH ??= join(tmpDir, "test.sqlite");
process.on("exit", () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

const [{ db }, schema] = await Promise.all([import("../../lib/db"), import("../../db/schema")]);

// `company` is the only table lib/db does not create lazily
try {
  await db.run(`CREATE TABLE IF NOT EXISTS company (id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, website text NOT NULL, persona text, created_at text NOT NULL, updated_at text NOT NULL)`);
} catch {
  /* already exists */
}

// Only the two seams around the trigger are mocked:
// - the Brand Intelligence workflow (we seed the finished document instead of running it)
// - model resolution (there is no AI provider in tests; generation must fail fast AFTER
//   the job row is created, which is exactly the evidence that the trigger fired)
mock.module("../brand/brand.workflow", () => ({
  brandIntelligenceWorkflow: {
    createRun: async () => ({
      stream: () => ({
        fullStream: (async function* () {
          /* the real workflow persists the doc; the fixtures below already did */
        })(),
        result: Promise.resolve({ ok: true }),
      }),
    }),
  },
}));
mock.module("../company/company.workflow", () => ({
  resolveUserModel: async () => {
    throw new Error("no AI provider configured in this test");
  },
}));

const { runBrandAnalysis } = await import("../brand/brand.service");

const angles = [
  { id: "angle-1", name: "Handover angle", description: "What breaks between shifts", priority: 5, isActive: true },
  { id: "angle-2", name: "Checklist angle", description: "Why lists get skipped", priority: 5, isActive: true },
];

async function seedBrand(input: { companyId: string; userId: string; status: string; angles: unknown[] }) {
  const now = new Date().toISOString();
  await db.insert(schema.companies).values({ id: input.companyId, userId: input.userId, name: "Testbrand", website: "https://testbrand.test", createdAt: now, updatedAt: now } as any);
  await db.insert(schema.brandIntelligence).values({
    userId: input.userId,
    companyId: input.companyId,
    status: input.status,
    error: null,
    brand: JSON.stringify({ name: "Testbrand" }),
    contentAngles: JSON.stringify(input.angles),
    createdAt: now,
    updatedAt: now,
  } as any);
}

async function jobRow(companyId: string) {
  const [row] = (await db.select().from(schema.contentGenerationJobs).where(eq(schema.contentGenerationJobs.companyId, companyId))) as any[];
  return row ?? null;
}

/** The trigger is fire-and-forget, so wait for its job row instead of awaiting the run. */
async function waitForJob(companyId: string, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await jobRow(companyId);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

async function settle(ms = 300) {
  await new Promise((r) => setTimeout(r, ms));
}

describe("runBrandAnalysis triggers automatic content generation (spec test 1)", () => {
  afterAll(() => {
    mock.restore();
  });

  it("starts a generation job once Brand Intelligence is ready with content angles", async () => {
    await seedBrand({ companyId: "brand-ready", userId: "u1", status: "ready", angles });

    await runBrandAnalysis({ companyId: "brand-ready", userId: "u1", name: "Testbrand", website: "https://testbrand.test", extra: null });

    const job = await waitForJob("brand-ready");
    expect(job).not.toBeNull();
    expect(job.type).toBe("initial_content_generation");
    expect(job.userId).toBe("u1");
    expect(Number(job.targetCount)).toBeGreaterThanOrEqual(100);
    // the Brand Intelligence run itself is untouched: still "ready", no error surfaced
    const [doc] = (await db.select().from(schema.brandIntelligence).where(eq(schema.brandIntelligence.companyId, "brand-ready"))) as any[];
    expect(doc.status).toBe("ready");
  });

  it("does not trigger when the analysis did not reach ready", async () => {
    await seedBrand({ companyId: "brand-analyzing", userId: "u1", status: "analyzing", angles });

    await runBrandAnalysis({ companyId: "brand-analyzing", userId: "u1", name: "Testbrand", website: "https://testbrand.test", extra: null });

    expect(await jobRow("brand-analyzing")).toBeNull();
    // the failure is persisted on the Brand Intelligence row, not thrown at the caller
    const [doc] = (await db.select().from(schema.brandIntelligence).where(eq(schema.brandIntelligence.companyId, "brand-analyzing"))) as any[];
    expect(doc.status).toBe("failed");
  });

  it("does not trigger when the brand has no content angles yet", async () => {
    await seedBrand({ companyId: "brand-no-angles", userId: "u1", status: "ready", angles: [] });

    await runBrandAnalysis({ companyId: "brand-no-angles", userId: "u1", name: "Testbrand", website: "https://testbrand.test", extra: null });

    await settle();
    expect(await jobRow("brand-no-angles")).toBeNull();
    const [doc] = (await db.select().from(schema.brandIntelligence).where(eq(schema.brandIntelligence.companyId, "brand-no-angles"))) as any[];
    expect(doc.status).toBe("ready");
  });

  it("never lets a failing generation run break the Brand Intelligence run", async () => {
    await seedBrand({ companyId: "brand-broken-ai", userId: "u1", status: "ready", angles });

    // no AI provider is configured here, so generation fails — the analysis must not notice
    await expect(
      runBrandAnalysis({ companyId: "brand-broken-ai", userId: "u1", name: "Testbrand", website: "https://testbrand.test", extra: null }),
    ).resolves.toBeUndefined();

    const job = await waitForJob("brand-broken-ai");
    expect(job).not.toBeNull();
    const [doc] = (await db.select().from(schema.brandIntelligence).where(eq(schema.brandIntelligence.companyId, "brand-broken-ai"))) as any[];
    expect(doc.status).toBe("ready");
    expect(doc.error).toBeNull();
    await settle(200);
    const settled = await jobRow("brand-broken-ai");
    expect(["processing", "failed"]).toContain(settled.status);
    expect((await db.select().from(schema.generatedContents).where(eq(schema.generatedContents.companyId, "brand-broken-ai"))).length).toBe(0);
  });
});
