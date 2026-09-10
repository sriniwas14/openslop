import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

// Tests run against Neon (DATABASE_URL, migrated) — no local sqlite file.
const [{ db }, schema] = await Promise.all([import("../../lib/db"), import("../../db/schema")]);
const { interleaveRoundRobin, shuffleInPlace } = await import("../../lib/shuffle");
const { buildShuffledFeedOrder, decodeOffsetCursor, encodeOffsetCursor, getContentFeed } = await import("./visual.service");

function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Max run of equal adjacent keys — the "5 same memes in a row" measure. */
function maxRun<T>(items: T[], key: (x: T) => string): number {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const item of items) {
    const k = key(item);
    cur = k === prev ? cur + 1 : 1;
    prev = k;
    best = Math.max(best, cur);
  }
  return best;
}

describe("shuffle helpers", () => {
  it("shuffleInPlace preserves every element", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffleInPlace([...input], prng(1));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it("interleaveRoundRobin never clusters balanced groups", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const items = [
        ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, meme: "a" })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, meme: "b" })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, meme: "c" })),
      ];
      const out = interleaveRoundRobin(items, (x) => x.meme, prng(seed));
      expect(out).toHaveLength(15);
      expect(new Set(out.map((x) => x.id)).size).toBe(15);
      expect(maxRun(out, (x) => x.meme)).toBe(1);
    }
  });

  it("interleaveRoundRobin passes through single-group and empty input", () => {
    expect(interleaveRoundRobin([], (x: string) => x)).toEqual([]);
    const solo = [{ id: "1" }, { id: "2" }];
    expect(interleaveRoundRobin(solo, () => "same").map((x) => x.id).sort()).toEqual(["1", "2"]);
  });

  it("offset cursors round-trip and reject legacy/garbage tokens", () => {
    const token = encodeOffsetCursor(5, randomUUID());
    const decoded = decodeOffsetCursor(token);
    expect(decoded?.offset).toBe(5);
    expect(typeof decoded?.shuffleId).toBe("string");
    expect(decodeOffsetCursor(null)).toBeNull();
    expect(decodeOffsetCursor("%%%not-base64%%%")).toBeNull();
    // legacy {c,i} keyset cursor is not an offset cursor
    const legacy = Buffer.from(JSON.stringify({ c: new Date().toISOString(), i: randomUUID() }), "utf8").toString("base64url");
    expect(decodeOffsetCursor(legacy)).toBeNull();
  });
});

describe("content feed shuffle", () => {
  async function seedClusteredBrand(memeCount = 3, perMeme = 5) {
    const userId = `feed-user-${randomUUID()}`;
    const [company] = await db.insert(schema.companies).values({ userId, name: `Feedbrand ${userId.slice(0, 8)}`, website: "https://feedbrand.test" }).returning();
    const companyId = (company as any).id as string;
    // generation order: 5 rows of meme A, then 5 of meme B… (the clustering source)
    let tick = Date.now() - 1000 * 60 * memeCount * perMeme;
    for (let m = 0; m < memeCount; m++) {
      for (let v = 0; v < perMeme; v++) {
        tick += 1000;
        const stamp = new Date(tick).toISOString();
        await db.insert(schema.generatedContents).values({
          userId,
          companyId,
          contentAngleId: `meme:meme-${m}`,
          platform: "instagram",
          contentFormat: "meme",
          contentType: "relatable_situation",
          hook: `hook ${m}-${v} ${randomUUID().slice(0, 8)}`,
          title: `title ${m}-${v}`,
          contentHash: randomUUID(),
          memeId: `meme-${m}`,
          memeName: `Meme ${m}`,
          visualTags: JSON.stringify(["desk", "notebook"]),
          visualMood: "Funny",
          visualStyle: "lifestyle",
          visualCategory: "workspace",
          visualOrientation: "portrait",
          createdAt: stamp,
          updatedAt: stamp,
        } as any);
      }
    }
    return { userId, companyId };
  }

  async function cleanupBrand(userId: string, companyId: string) {
    try {
      await db.delete(schema.visualSearchBatches).where(eq(schema.visualSearchBatches.companyId, companyId));
    } catch {}
    try {
      await db.delete(schema.generatedContents).where(eq(schema.generatedContents.companyId, companyId));
    } catch {}
    try {
      await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    } catch {}
    // other suites share this DB — never touch rows that are not ours
    void userId;
  }

  async function walkFeed(userId: string, companyId: string, rand: () => number) {
    const seen: string[] = [];
    const memes: (string | null)[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const res = await getContentFeed({ companyId, userId, cursor, deps: { autoProcess: false, rand } });
      pages++;
      for (const item of res.items) {
        seen.push(item.content.id);
        memes.push((item.content as any).memeId ?? null);
      }
      if (!res.hasMore) {
        expect(res.nextCursor).toBeNull();
        break;
      }
      expect(res.nextCursor).not.toBeNull();
      cursor = res.nextCursor;
      if (pages > 10) throw new Error("feed walk did not terminate");
    }
    return { seen, memes, pages };
  }

  it("buildShuffledFeedOrder spreads meme groups", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, memeId: "a", contentFormat: "meme" })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, memeId: "b", contentFormat: "meme" })),
    ];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const order = buildShuffledFeedOrder(rows, prng(7));
    expect(order).toHaveLength(10);
    expect(maxRun(order, (id) => byId.get(id)!.memeId)).toBe(1);
  });

  it("first page mixes memes and a full walk covers every post exactly once", async () => {
    const { userId, companyId } = await seedClusteredBrand(3, 5);
    try {
      const first = await getContentFeed({ companyId, userId, deps: { autoProcess: false, rand: prng(42) } });
      expect(first.items).toHaveLength(5);
      const firstMemes = new Set(first.items.map((i) => (i.content as any).memeId));
      expect(firstMemes.size).toBeGreaterThan(1);

      const walk = await walkFeed(userId, companyId, prng(42));
      expect(walk.pages).toBe(3);
      expect(walk.seen).toHaveLength(15);
      expect(new Set(walk.seen).size).toBe(15);
      // 15 posts across 3 memes — interleaved, never 5-in-a-row
      expect(maxRun(walk.memes, (m) => String(m))).toBeLessThan(5);
    } finally {
      await cleanupBrand(userId, companyId);
    }
  });

  it("every fresh reload shuffles and still covers everything", async () => {
    const { userId, companyId } = await seedClusteredBrand(4, 5);
    try {
      for (const seed of [11, 22, 33]) {
        const walk = await walkFeed(userId, companyId, prng(seed));
        expect(new Set(walk.seen).size).toBe(20);
        expect(maxRun(walk.memes, (m) => String(m))).toBeLessThan(5);
      }
    } finally {
      await cleanupBrand(userId, companyId);
    }
  });

  it("re-polling the same cursor returns the same page (idempotent)", async () => {
    const { userId, companyId } = await seedClusteredBrand(2, 5);
    try {
      const rand = prng(99);
      const first = await getContentFeed({ companyId, userId, deps: { autoProcess: false, rand } });
      expect(first.hasMore).toBe(true);
      const second = await getContentFeed({ companyId, userId, cursor: first.nextCursor, deps: { autoProcess: false, rand } });
      expect(second.items.map((i) => i.content.id)).not.toEqual(first.items.map((i) => i.content.id));
      const repoll = await getContentFeed({ companyId, userId, cursor: first.nextCursor, deps: { autoProcess: false, rand } });
      expect(repoll.items.map((i) => i.content.id)).toEqual(second.items.map((i) => i.content.id));
    } finally {
      await cleanupBrand(userId, companyId);
    }
  });
});
