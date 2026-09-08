import { describe, expect, it } from "bun:test";
import type { VisualCandidate } from "./pexels.service";
import type { VisualQueryMeta } from "./visual.queries";

// Pure-function tests for the visual pipeline's decision layer: query generation,
// dedupe, filtering, weighted ranking and threshold selection. No DB, no network —
// nothing here imports lib/db, so this file needs no database isolation boilerplate.
const { buildVisualQueries, refineVisualQueries } = await import("./visual.queries");
const {
  SCORING_WEIGHTS,
  MIN_RELEVANCE_THRESHOLD,
  MIN_SHORT_SIDE,
  VisualCandidateScorer,
  DEFAULT_SCORERS,
  canonicalSourceUrl,
  dedupeCandidates,
  filterCandidates,
  rankCandidates,
  selectBestVisual,
  desiredOrientation,
} = await import("./visual.scorer");
const { FEED_BATCH_SIZE, FEED_DAILY_LIMIT, parseVisualAssetRow } = await import("./visual.schemas");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const META: VisualQueryMeta = {
  visualTags: ["founder working laptop", "hands holding notebook", "morning light through window"],
  visualMood: "calm, honest, everyday",
  visualStyle: "ugc",
  visualCategory: "workspace",
  visualOrientation: "portrait",
  platform: "instagram",
  contentFormat: "talking_head",
  contentType: "story",
};

let nextId = 1;

function candidate(over: Partial<VisualCandidate> = {}): VisualCandidate {
  const id = nextId++;
  return {
    source: "pexels",
    sourceAssetId: String(1000 + id),
    sourceUrl: `https://www.pexels.com/photo/${1000 + id}/`,
    previewUrl: `https://images.pexels.com/photos/${1000 + id}/large2x.jpeg`,
    downloadUrl: `https://images.pexels.com/photos/${1000 + id}/original.jpeg`,
    mediaType: "image",
    posterUrl: null,
    duration: null,
    width: 800,
    height: 1200,
    orientation: "portrait",
    altText: "camera person speaking at a desk in natural light",
    photographer: "A. Person",
    avgColor: "#333333",
    tags: ["desk", "laptop", "workspace", "candid"],
    query: "founder working laptop",
    queryIndex: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Query generation — spec: 3-5 concise, concrete, photo-searchable queries
// ---------------------------------------------------------------------------

describe("buildVisualQueries", () => {
  it("returns between 3 and 5 queries", () => {
    const q = buildVisualQueries(META);
    expect(q.length).toBeGreaterThanOrEqual(3);
    expect(q.length).toBeLessThanOrEqual(5);
  });

  it("keeps every query concise (at most 6 words)", () => {
    const long: VisualQueryMeta = {
      ...META,
      visualTags: ["a very long descriptive tag phrase with many extra words that should be clamped"],
    };
    for (const q of buildVisualQueries(long)) {
      expect(q.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(6);
    }
  });

  it("orders queries most-specific first", () => {
    const q = buildVisualQueries(META);
    // the strongest concrete tag leads; a broad category scene comes later
    expect(q[0]).toBe("founder working laptop");
    expect(q.indexOf("person working laptop desk")).toBeGreaterThan(0);
  });

  it("never emits an abstract or generic marketing word as a query", () => {
    const abstractOnly: VisualQueryMeta = {
      ...META,
      visualTags: ["success", "growth mindset", "innovation", "photo", "image", "content"],
      visualCategory: "workspace",
    };
    const q = buildVisualQueries(abstractOnly);
    expect(q.length).toBeGreaterThanOrEqual(3);
    const banned = ["success", "growth", "innovation", "synergy", "solution", "photo", "image", "content"];
    for (const query of q) {
      const words = query.toLowerCase().split(/\s+/);
      // a query made ONLY of banned words is useless for photo search
      expect(words.every((w) => banned.includes(w))).toBe(false);
    }
    // and it falls back to concrete category scenes instead
    expect(q.some((x) => /laptop|desk|office/.test(x))).toBe(true);
  });

  it("survives missing/thin metadata without producing empty queries", () => {
    const cases: VisualQueryMeta[] = [
      { visualTags: [] },
      { visualTags: ["desk"], visualCategory: null, visualStyle: null, visualMood: null },
      { visualTags: ["", "   "], visualCategory: "unknown_category" },
      { visualTags: null as any },
    ];
    for (const meta of cases) {
      const q = buildVisualQueries(meta);
      expect(q.every((x) => typeof x === "string" && x.trim().length > 0)).toBe(true);
      expect(new Set(q.map((x) => x.toLowerCase())).size).toBe(q.length); // deduped
    }
  });

  it("dedupes case-insensitively and respects an explicit max", () => {
    const dupes: VisualQueryMeta = { ...META, visualTags: ["Desk Lamp", "desk lamp", "DESK  LAMP", "hands holding notebook"] };
    const q = buildVisualQueries(dupes);
    expect(new Set(q.map((x) => x.toLowerCase())).size).toBe(q.length);
    expect(buildVisualQueries(META, 3).length).toBeLessThanOrEqual(3);
  });

  it("folds the photographic style and a concrete mood word into later queries", () => {
    const q = buildVisualQueries(META);
    expect(q.some((x) => /candid|smartphone/.test(x))).toBe(true); // ugc style modifier
    expect(q.some((x) => /calm|honest|everyday/.test(x))).toBe(true); // concrete mood word
  });

  it("never leaks the post's own copy into a query", () => {
    // only visual metadata is used — the hook/body/title are not part of VisualQueryMeta
    const q = buildVisualQueries(META).join(" ").toLowerCase();
    expect(q).not.toContain("hook");
    expect(q).not.toContain("cta");
  });
});

describe("refineVisualQueries", () => {
  it("broadens the pool and never repeats a query that already failed", () => {
    const first = buildVisualQueries(META);
    const refined = refineVisualQueries(META, first);
    expect(refined.length).toBeGreaterThan(0);
    const tried = new Set(first.map((q) => q.toLowerCase()));
    for (const q of refined) expect(tried.has(q.toLowerCase())).toBe(false);
  });

  it("prefers broad category scenes over narrow style/mood modifiers", () => {
    const refined = refineVisualQueries(META, []);
    expect(refined[0]).toMatch(/laptop|desk|office|workspace/);
    expect(refined.every((q) => q.split(/\s+/).length <= 6)).toBe(true);
  });

  it("returns nothing to retry when there is no metadata left to broaden", () => {
    expect(refineVisualQueries({ visualTags: [] }, [])).toEqual([]);
  });

  it("caps the number of refined queries", () => {
    expect(refineVisualQueries(META, [], 2).length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Orientation preference — spec: portrait for short-form, portrait/square for LinkedIn
// ---------------------------------------------------------------------------

describe("desiredOrientation", () => {
  it("honours an explicit orientation from the content metadata", () => {
    expect(desiredOrientation({ ...META, visualOrientation: "landscape", platform: "instagram" })).toBe("landscape");
    expect(desiredOrientation({ ...META, visualOrientation: "square" })).toBe("square");
    expect(desiredOrientation({ ...META, visualOrientation: "portrait" })).toBe("portrait");
  });

  it("defaults short-form platforms to portrait when the metadata is missing", () => {
    for (const platform of ["instagram", "tiktok", "youtube_shorts", "facebook"]) {
      expect(desiredOrientation({ visualTags: [], platform, visualOrientation: null })).toBe("portrait");
    }
  });

  it("defaults professional/text platforms to square", () => {
    expect(desiredOrientation({ visualTags: [], platform: "linkedin", visualOrientation: null })).toBe("square");
    expect(desiredOrientation({ visualTags: [], platform: "x", visualOrientation: null })).toBe("square");
    expect(desiredOrientation({ visualTags: [] })).toBe("square");
  });

  it("ignores an invalid orientation value rather than passing it through", () => {
    expect(desiredOrientation({ visualTags: [], visualOrientation: "diagonal", platform: "instagram" })).toBe("portrait");
  });
});

// ---------------------------------------------------------------------------
// Dedupe — spec: by photo ID AND canonical URL
// ---------------------------------------------------------------------------

describe("canonicalSourceUrl", () => {
  it("normalizes protocol, www, query string, case and trailing slashes", () => {
    const a = canonicalSourceUrl("https://www.pexels.com/photo/123/");
    expect(a).toBe("pexels.com/photo/123");
    expect(canonicalSourceUrl("HTTP://PEXELS.com/photo/123/?utm=x")).toBe(a);
    expect(canonicalSourceUrl("https://pexels.com/photo/123///")).toBe(a);
    expect(canonicalSourceUrl("")).toBe("");
    expect(canonicalSourceUrl(null as any)).toBe("");
  });
});

describe("dedupeCandidates", () => {
  it("removes repeats of the same photo id surfaced by different queries", () => {
    const list = [
      candidate({ sourceAssetId: "42", query: "q1", queryIndex: 0 }),
      candidate({ sourceAssetId: "42", query: "q2", queryIndex: 1 }),
      candidate({ sourceAssetId: "43", query: "q2", queryIndex: 1 }),
    ];
    const out = dedupeCandidates(list);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.sourceAssetId)).toEqual(["42", "43"]);
    expect(out[0].queryIndex).toBe(0); // keeps the first (most specific) sighting
  });

  it("removes different ids that resolve to the same canonical URL", () => {
    const list = [
      candidate({ sourceAssetId: "1", sourceUrl: "https://www.pexels.com/photo/same/" }),
      candidate({ sourceAssetId: "2", sourceUrl: "http://pexels.com/photo/same?ref=x" }),
      candidate({ sourceAssetId: "3", sourceUrl: "https://www.pexels.com/photo/other/" }),
    ];
    expect(dedupeCandidates(list).map((c) => c.sourceAssetId)).toEqual(["1", "3"]);
  });

  it("is a no-op on an empty list and preserves order", () => {
    expect(dedupeCandidates([])).toEqual([]);
    const list = [candidate({ sourceAssetId: "a" }), candidate({ sourceAssetId: "b" })];
    expect(dedupeCandidates(list).map((c) => c.sourceAssetId)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Filtering — spec: reject unusable candidates, enforce orientation softly
// ---------------------------------------------------------------------------

describe("filterCandidates", () => {
  it("rejects candidates with no preview URL", () => {
    const { kept, rejected } = filterCandidates([candidate({ previewUrl: "" }), candidate()], META);
    expect(kept).toHaveLength(1);
    expect(rejected).toBe(1);
  });

  it("rejects candidates with zero or missing dimensions", () => {
    const { kept } = filterCandidates([candidate({ width: 0, height: 1200 }), candidate({ width: 800, height: 0 }), candidate()], META);
    expect(kept).toHaveLength(1);
  });

  it(`rejects candidates whose short side is below ${MIN_SHORT_SIDE}px`, () => {
    expect(MIN_SHORT_SIDE).toBe(500);
    const { kept, rejected } = filterCandidates(
      [candidate({ width: 400, height: 1200 }), candidate({ width: 1200, height: 499 }), candidate({ width: 500, height: 900 })],
      META,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].width).toBe(500); // exactly at the limit is acceptable
    expect(rejected).toBe(2);
  });

  it("drops mismatched orientations when a matching one exists", () => {
    const { kept, rejected } = filterCandidates(
      [candidate({ orientation: "landscape", width: 1200, height: 800 }), candidate({ orientation: "portrait" })],
      { ...META, visualOrientation: "portrait" },
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].orientation).toBe("portrait");
    expect(rejected).toBe(1);
  });

  it("keeps mismatched orientations when nothing matches (soft filter, not a hard reject)", () => {
    const { kept, rejected } = filterCandidates(
      [candidate({ orientation: "landscape", width: 1200, height: 800 }), candidate({ orientation: "square", width: 1000, height: 1000 })],
      { ...META, visualOrientation: "portrait" },
    );
    expect(kept).toHaveLength(2); // left to ranking instead of an empty pool
    expect(rejected).toBe(0);
  });

  it("returns an empty pool when every candidate is unusable", () => {
    const { kept } = filterCandidates([candidate({ previewUrl: "" }), candidate({ width: 10, height: 10 })], META);
    expect(kept).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Weighted scoring — spec: total 100, modular layers
// ---------------------------------------------------------------------------

describe("scoring weights", () => {
  it("sums to exactly 100 across the spec's nine layers", () => {
    expect(SCORING_WEIGHTS).toEqual({
      semanticRelevance: 25,
      visualTagMatch: 20,
      categoryMatch: 10,
      moodMatch: 10,
      styleMatch: 10,
      orientationMatch: 10,
      platformMatch: 5,
      formatMatch: 5,
      ugcAuthenticity: 5,
    });
    expect(Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(DEFAULT_SCORERS.map((s) => s.name as string).sort()).toEqual(Object.keys(SCORING_WEIGHTS).sort());
    for (const s of DEFAULT_SCORERS) expect(s.weight).toBe(SCORING_WEIGHTS[s.name]);
  });
});

describe("VisualCandidateScorer", () => {
  const scorer = new VisualCandidateScorer();

  it("returns a 0-100 total plus a per-layer breakdown", () => {
    const res = scorer.score(candidate(), META, ["founder working laptop"]);
    expect(res.score).toBeGreaterThan(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(Object.keys(res.breakdown).sort()).toEqual(Object.keys(SCORING_WEIGHTS).sort());
    const sum = Object.values(res.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - res.score)).toBeLessThan(0.05); // breakdown accounts for the total
    for (const [name, points] of Object.entries(res.breakdown)) {
      expect(points).toBeGreaterThanOrEqual(0);
      expect(points).toBeLessThanOrEqual(SCORING_WEIGHTS[name as keyof typeof SCORING_WEIGHTS]);
    }
  });

  it("clamps a misbehaving layer into 0..1 so the total can never exceed 100", () => {
    const wild = new VisualCandidateScorer([
      ...DEFAULT_SCORERS,
      { name: "semanticRelevance", weight: 25, score: () => 99 }, // out of range on purpose
      { name: "visualTagMatch", weight: 20, score: () => -5 },
    ]);
    const res = wild.score(candidate(), META, ["q"]);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.score).toBeGreaterThanOrEqual(0);
  });

  it("ranks a candidate that matches the tags above an unrelated one", () => {
    const relevant = candidate({ altText: "founder working laptop at a desk in morning light", tags: ["laptop", "desk", "workspace", "candid"] });
    const irrelevant = candidate({ altText: "aerial view of a highway interchange at night", tags: ["highway", "traffic", "aerial"] });
    const a = scorer.score(relevant, META, ["founder working laptop"]);
    const b = scorer.score(irrelevant, META, ["founder working laptop"]);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.breakdown.visualTagMatch).toBeGreaterThan(b.breakdown.visualTagMatch);
  });

  it("rewards a candidate surfaced by a more specific (earlier) query", () => {
    const early = candidate({ queryIndex: 0 });
    const late = candidate({ queryIndex: 4, altText: early.altText, tags: [...early.tags] });
    const q = ["founder working laptop", "broader query"];
    expect(scorer.score(early, META, q).breakdown.semanticRelevance).toBeGreaterThan(
      scorer.score(late, META, q).breakdown.semanticRelevance,
    );
  });

  it("gives orientation, platform and format layers full marks on a natural fit", () => {
    const res = scorer.score(candidate({ orientation: "portrait" }), { ...META, platform: "instagram", contentFormat: "talking_head" }, ["q"]);
    expect(res.breakdown.orientationMatch).toBe(SCORING_WEIGHTS.orientationMatch);
    expect(res.breakdown.platformMatch).toBe(SCORING_WEIGHTS.platformMatch);
    expect(res.breakdown.formatMatch).toBeGreaterThan(0);
  });

  it("penalizes a portrait-only platform when the candidate is landscape", () => {
    const portrait = scorer.score(candidate({ orientation: "portrait" }), META, ["q"]);
    const landscape = scorer.score(
      candidate({ orientation: "landscape", width: 1200, height: 800 }),
      { ...META, visualOrientation: null, platform: "instagram" },
      ["q"],
    );
    expect(landscape.breakdown.platformMatch).toBeLessThan(portrait.breakdown.platformMatch);
  });

  it("zeroes ugcAuthenticity for cheesy corporate stock and rewards candid work", () => {
    const corporate = scorer.score(
      candidate({ altText: "two executives shaking hands in a boardroom, business suit", tags: ["corporate", "handshake"] }),
      META,
      ["q"],
    );
    expect(corporate.breakdown.ugcAuthenticity).toBe(0);

    const candid = scorer.score(candidate({ altText: "candid everyday moment at home on a smartphone", tags: ["candid", "natural"] }), META, ["q"]);
    expect(candid.breakdown.ugcAuthenticity).toBeGreaterThan(0);
    expect(candid.breakdown.ugcAuthenticity).toBeGreaterThan(corporate.breakdown.ugcAuthenticity);
  });

  it("does not penalize missing mood or style metadata (neutral 0.6)", () => {
    const res = scorer.score(candidate(), { ...META, visualMood: null, visualStyle: null }, ["q"]);
    expect(res.breakdown.moodMatch).toBeCloseTo(SCORING_WEIGHTS.moodMatch * 0.6, 1);
    expect(res.breakdown.styleMatch).toBeCloseTo(SCORING_WEIGHTS.styleMatch * 0.6, 1);
  });

  it("accepts an extra scoring layer without changing the pipeline (modular by design)", () => {
    // a future SemanticScorer/VisionScorer plugs in here — no changes to rank/select
    const withExtra = new VisualCandidateScorer([
      ...DEFAULT_SCORERS,
      { name: "categoryMatch", weight: SCORING_WEIGHTS.categoryMatch, score: () => 1 },
    ]);
    const base = scorer.score(candidate(), META, ["q"]).score;
    const boosted = withExtra.score(candidate(), META, ["q"]).score;
    expect(boosted).toBeGreaterThanOrEqual(base);
    expect(boosted).toBeLessThanOrEqual(100);
  });

  it("is deterministic for identical input", () => {
    const c = candidate();
    expect(scorer.score(c, META, ["q"]).score).toBe(scorer.score(c, META, ["q"]).score);
  });
});

// ---------------------------------------------------------------------------
// Rank + select
// ---------------------------------------------------------------------------

describe("rankCandidates", () => {
  it("dedupes, filters and sorts descending by score", () => {
    const good = candidate({ altText: "founder working laptop at a desk in morning light", tags: ["laptop", "desk", "candid"] });
    const dupe = candidate({ ...good, sourceAssetId: good.sourceAssetId, queryIndex: 3 });
    const bad = candidate({ altText: "aerial highway interchange at night", tags: ["highway"], width: 100, height: 100 });
    const { ranked, rejected } = rankCandidates([good, dupe, bad], META, ["founder working laptop"]);

    expect(ranked).toHaveLength(1); // dupe collapsed, bad rejected by size
    expect(rejected).toBe(1);
    expect(ranked[0].candidate.sourceAssetId).toBe(good.sourceAssetId);
  });

  it("sorts a mixed pool best-first", () => {
    const relevant = candidate({ altText: "founder working laptop desk morning light candid", tags: ["laptop", "desk", "workspace"] });
    const meh = candidate({ altText: "an empty room", tags: ["room"] });
    const { ranked } = rankCandidates([meh, relevant], META, ["founder working laptop"]);
    expect(ranked[0].candidate.sourceAssetId).toBe(relevant.sourceAssetId);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("returns an empty ranking for an empty pool", () => {
    expect(rankCandidates([], META, ["q"])).toEqual({ ranked: [], rejected: 0 });
  });
});

describe("selectBestVisual", () => {
  it("selects the top candidate when it clears the relevance threshold", () => {
    const strong = candidate({ altText: "founder working laptop at a desk in calm morning light", tags: ["laptop", "desk", "workspace", "candid"] });
    const weak = candidate({ altText: "an empty room", tags: ["room"] });
    const best = selectBestVisual([weak, strong], META, ["founder working laptop"]);
    expect(best).not.toBeNull();
    expect(best!.candidate.sourceAssetId).toBe(strong.sourceAssetId);
    expect(best!.score).toBeGreaterThanOrEqual(MIN_RELEVANCE_THRESHOLD);
  });

  it("returns null when nothing clears the threshold", () => {
    const junk = [
      candidate({ altText: "zzz qqq", tags: ["zzz"], orientation: "landscape", width: 1200, height: 800 }),
      candidate({ altText: "yyy xxx", tags: ["yyy"], orientation: "landscape", width: 1200, height: 800 }),
    ];
    expect(selectBestVisual(junk, META, ["founder working laptop"])).toBeNull();
  });

  it("returns null for an empty pool rather than throwing", () => {
    expect(selectBestVisual([], META, ["q"])).toBeNull();
  });

  it("honours a custom threshold in both directions", () => {
    const mid = candidate({ altText: "person at a desk with a laptop", tags: ["desk"] });
    expect(selectBestVisual([mid], META, ["q"], 0)).not.toBeNull(); // everything passes
    expect(selectBestVisual([mid], META, ["q"], 100)).toBeNull(); // nothing is perfect
  });

  it("exposes a sane default threshold below 100 so imperfect matches are still usable", () => {
    expect(MIN_RELEVANCE_THRESHOLD).toBeGreaterThan(0);
    expect(MIN_RELEVANCE_THRESHOLD).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Feed constants + row parsing
// ---------------------------------------------------------------------------

describe("feed constants and asset parsing", () => {
  it("fixes the batch size at 5 and the daily limit at 100 (20 batches x 5)", () => {
    expect(FEED_BATCH_SIZE).toBe(5);
    expect(FEED_DAILY_LIMIT).toBe(100);
    expect(FEED_DAILY_LIMIT / FEED_BATCH_SIZE).toBe(20);
  });

  it("parses a sqlite visual_asset row (JSON text + numeric text) into a client-safe doc", () => {
    const doc = parseVisualAssetRow({
      id: "asset-1",
      source: "pexels",
      sourceAssetId: "1001",
      sourceUrl: "https://www.pexels.com/photo/1001/",
      previewUrl: "https://images.pexels.com/p/large2x.jpeg",
      downloadUrl: "https://images.pexels.com/p/original.jpeg",
      localUrl: "/media/files/visual_1001.jpg",
      width: "800",
      height: "1200",
      orientation: "portrait",
      altText: "a desk",
      tags: JSON.stringify(["desk", "laptop"]),
      metadata: JSON.stringify({ photographer: "A. Person", avgColor: "#333", score: 72.5, breakdown: { moodMatch: 6 } }),
      createdAt: "2026-09-02T10:00:00.000Z",
    });
    expect(doc.width).toBe(800); // text → number
    expect(doc.height).toBe(1200);
    expect(doc.tags).toEqual(["desk", "laptop"]); // JSON text → array
    expect(doc.photographer).toBe("A. Person"); // lifted out of metadata
    expect(doc.avgColor).toBe("#333");
    expect(doc.localUrl).toBe("/media/files/visual_1001.jpg");
  });

  it("never exposes scoring internals or credentials, and tolerates corrupt JSON", () => {
    const doc = parseVisualAssetRow({ id: "a", width: "x", height: null, tags: "{not json", metadata: "{not json" });
    expect(doc.tags).toEqual([]);
    expect(doc.photographer).toBeNull();
    expect(doc.width).toBe(0); // unparseable → 0, not NaN
    expect(Number.isNaN(doc.height)).toBe(false);
    expect("score" in doc).toBe(false);
    expect("breakdown" in doc).toBe(false);
    expect("apiKey" in doc).toBe(false);
  });
});
