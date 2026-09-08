// ---------------------------------------------------------------------------
// Visual candidate scoring — dedupe → filter → rank → select.
//
// Modular by design: `VisualCandidateScorer` sums independent, weighted scoring
// layers (each returns 0..1). New layers (a future SemanticScorer over embeddings or
// a VisionScorer over an image model) can be appended without touching the pipeline.
// No vision model is used here — scoring is text/metadata based, cheap and testable.
// ---------------------------------------------------------------------------

import type { VisualCategory, VisualOrientation } from "../ugc/ugc.schemas";
import type { VisualQueryMeta } from "./visual.queries";
import type { VisualCandidate } from "./pexels.service";

export const SCORING_WEIGHTS = {
  semanticRelevance: 25,
  visualTagMatch: 20,
  categoryMatch: 10,
  moodMatch: 10,
  styleMatch: 10,
  orientationMatch: 10,
  platformMatch: 5,
  formatMatch: 5,
  ugcAuthenticity: 5,
} as const;

/** Minimum total (0-100) a candidate must reach to be auto-selected. */
export const MIN_RELEVANCE_THRESHOLD = 45;

/** Reject candidates whose short side is below this (too small for a portrait feed). */
export const MIN_SHORT_SIDE = 500;

const STOPWORDS = new Set(
  ("the a an and or of in on for with at by from to is are was be person people man woman people's free stock photo image").split(" "),
);

function tokens(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit;
}

/** Jaccard-ish overlap normalized by the smaller set — 0..1. */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  const hits = overlap(a, b);
  const denom = Math.min(a.size, b.size);
  return denom === 0 ? 0 : hits / denom;
}

const ABSTRACT_WORDS = new Set(
  ("success growth innovation strategy business synergy solution value mission vision leadership").split(" "),
);

function concreteTagTokens(tags: string[]): Set<string> {
  const out = new Set<string>();
  for (const tag of tags ?? []) {
    for (const t of tokens(tag)) if (!ABSTRACT_WORDS.has(t)) out.add(t);
  }
  return out;
}

// visualCategory → words that indicate the photo really is that kind of scene.
const CATEGORY_KEYWORDS: Record<VisualCategory, string[]> = {
  creator_lifestyle: ["creator", "selfie", "phone", "filming", "recording", "vlog", "influencer", "home"],
  workspace: ["desk", "laptop", "office", "workspace", "computer", "keyboard", "working", "founder"],
  product_closeup: ["product", "closeup", "package", "bottle", "box", "hands", "unboxing", "cosmetic"],
  screen_ui: ["screen", "phone", "smartphone", "app", "display", "interface", "mobile", "tablet"],
  people_talking: ["talking", "conversation", "speaking", "meeting", "friends", "interview", "camera"],
  hands_and_objects: ["hands", "holding", "hand", "fingers", "craft", "object", "cup"],
  outdoor: ["outdoor", "outside", "park", "nature", "street", "walking", "sky", "trees"],
  street: ["street", "sidewalk", "city", "urban", "road", "storefront", "downtown", "building"],
  home: ["home", "couch", "living", "room", "interior", "cozy", "sofa", "kitchen"],
  food_and_drink: ["coffee", "food", "drink", "cup", "cafe", "tea", "plate", "restaurant"],
  fitness: ["gym", "workout", "exercise", "running", "yoga", "fitness", "training", "athlete"],
  abstract_texture: ["texture", "abstract", "background", "gradient", "pattern", "surface", "minimal"],
};

// contentFormat → words that make a photo a natural fit for that deliverable.
const FORMAT_KEYWORDS: Record<string, string[]> = {
  wall_of_text_slide: ["background", "texture", "minimal", "desk", "workspace", "surface"],
  video_hook: ["person", "people", "camera", "speaking", "creator", "phone"],
  talking_head: ["person", "speaking", "camera", "face", "portrait", "interview"],
  screen_recording: ["screen", "phone", "app", "computer", "display", "laptop"],
  product_demo: ["product", "hands", "closeup", "package", "using", "unboxing"],
  spokesperson: ["person", "holding", "camera", "speaking", "portrait"],
  green_screen: ["person", "camera", "speaking", "portrait", "background"],
  mobile_app: ["phone", "smartphone", "app", "screen", "mobile", "hands"],
  clay_motion: ["craft", "clay", "playful", "colorful", "object", "hands"],
  website_demo: ["laptop", "screen", "computer", "desk", "website", "working"],
  meme: ["funny", "person", "people", "reaction", "expression", "pet"],
  ugc_video: ["creator", "phone", "selfie", "candid", "home", "everyday"],
};

// Platforms that are short-form / vertical-first — portrait is strongly preferred.
const VERTICAL_PLATFORMS = new Set(["instagram", "tiktok", "youtube_shorts", "facebook"]);

const UGC_POSITIVE = ["candid", "natural", "casual", "everyday", "home", "smartphone", "selfie", "authentic", "lifestyle", "cozy", "real"];
const UGC_NEGATIVE = [
  "handshake",
  "boardroom",
  "business suit",
  "corporate",
  "conference room",
  "smiling at camera",
  "stock",
  "luxury",
  "yacht",
  "mansion",
  "money",
  "cash",
  "posed",
];

// ---------------------------------------------------------------------------
// Scoring context + modular scorer interface
// ---------------------------------------------------------------------------

export type ScoringContext = {
  candidate: VisualCandidate;
  meta: VisualQueryMeta;
  queries: string[]; // queries used, in order (index 0 = most specific)
  tagTokens: Set<string>;
  candidateTokens: Set<string>;
  moodTokens: Set<string>;
};

/** A single weighted scoring layer. `score` returns 0..1; the total multiplies by weight. */
export type CandidateScorer = {
  name: keyof typeof SCORING_WEIGHTS;
  weight: number;
  score(ctx: ScoringContext): number;
};

export function desiredOrientation(meta: VisualQueryMeta): VisualOrientation {
  const o = String(meta.visualOrientation ?? "").toLowerCase();
  if (o === "portrait" || o === "landscape" || o === "square") return o;
  // short-form platforms default to portrait when metadata is missing
  return VERTICAL_PLATFORMS.has(String(meta.platform ?? "").toLowerCase()) ? "portrait" : "square";
}

function orientationCloseness(actual: VisualOrientation, desired: VisualOrientation): number {
  if (actual === desired) return 1;
  // square is a reasonable compromise for either; portrait↔landscape is a hard mismatch
  if (actual === "square" || desired === "square") return 0.5;
  return 0;
}

const SEMANTIC_MAX_QUERY_INDEX = 4;

export const DEFAULT_SCORERS: CandidateScorer[] = [
  {
    name: "semanticRelevance",
    weight: SCORING_WEIGHTS.semanticRelevance,
    score(ctx) {
      // overlap between the photo's own text (alt) and the content's concrete tags,
      // blended with a bonus for coming from a more specific (earlier) query.
      const textOverlap = overlapRatio(ctx.candidateTokens, ctx.tagTokens);
      const queryBonus = Math.max(0, 1 - ctx.candidate.queryIndex / SEMANTIC_MAX_QUERY_INDEX);
      return Math.min(1, 0.7 * textOverlap + 0.3 * queryBonus);
    },
  },
  {
    name: "visualTagMatch",
    weight: SCORING_WEIGHTS.visualTagMatch,
    score(ctx) {
      // how many of the content's concrete visual tags literally appear in the photo text
      return overlapRatio(ctx.tagTokens, ctx.candidateTokens);
    },
  },
  {
    name: "categoryMatch",
    weight: SCORING_WEIGHTS.categoryMatch,
    score(ctx) {
      const cat = ctx.meta.visualCategory as VisualCategory;
      const keywords = CATEGORY_KEYWORDS[cat] ?? [];
      if (!keywords.length) return 0.5;
      const kw = new Set(keywords);
      const ratio = overlap(kw, ctx.candidateTokens) / Math.min(3, kw.size);
      return Math.min(1, ratio);
    },
  },
  {
    name: "moodMatch",
    weight: SCORING_WEIGHTS.moodMatch,
    score(ctx) {
      if (!ctx.moodTokens.size) return 0.6; // no mood to match — neutral, don't penalize
      return Math.min(1, overlap(ctx.moodTokens, ctx.candidateTokens) / Math.min(2, ctx.moodTokens.size));
    },
  },
  {
    name: "styleMatch",
    weight: SCORING_WEIGHTS.styleMatch,
    score(ctx) {
      const style = String(ctx.meta.visualStyle ?? "").toLowerCase();
      if (!style) return 0.6;
      // UGC/candid styles are rewarded by authenticity words; product styles by "product/closeup"
      const styleWords =
        style === "product_photography"
          ? ["product", "closeup", "clean", "studio"]
          : style === "screen_capture"
            ? ["screen", "app", "phone", "display"]
            : UGC_POSITIVE;
      const hits = overlap(new Set(styleWords), ctx.candidateTokens);
      return Math.min(1, hits / 2);
    },
  },
  {
    name: "orientationMatch",
    weight: SCORING_WEIGHTS.orientationMatch,
    score(ctx) {
      return orientationCloseness(ctx.candidate.orientation, desiredOrientation(ctx.meta));
    },
  },
  {
    name: "platformMatch",
    weight: SCORING_WEIGHTS.platformMatch,
    score(ctx) {
      const platform = String(ctx.meta.platform ?? "").toLowerCase();
      if (!platform) return 0.6;
      const wantsPortrait = VERTICAL_PLATFORMS.has(platform);
      if (wantsPortrait) return ctx.candidate.orientation === "portrait" ? 1 : ctx.candidate.orientation === "square" ? 0.6 : 0.2;
      // linkedin / x accept square or landscape
      return ctx.candidate.orientation === "landscape" || ctx.candidate.orientation === "square" ? 1 : 0.6;
    },
  },
  {
    name: "formatMatch",
    weight: SCORING_WEIGHTS.formatMatch,
    score(ctx) {
      const keywords = FORMAT_KEYWORDS[String(ctx.meta.contentFormat ?? "")] ?? [];
      if (!keywords.length) return 0.6;
      return Math.min(1, overlap(new Set(keywords), ctx.candidateTokens) / 2);
    },
  },
  {
    name: "ugcAuthenticity",
    weight: SCORING_WEIGHTS.ugcAuthenticity,
    score(ctx) {
      const text = `${ctx.candidate.altText} ${ctx.candidate.tags.join(" ")}`.toLowerCase();
      if (UGC_NEGATIVE.some((w) => text.includes(w))) return 0; // cheesy corporate / luxury stock
      const pos = overlap(new Set(UGC_POSITIVE), ctx.candidateTokens);
      return Math.min(1, 0.4 + pos / 3);
    },
  },
];

export type ScoreBreakdown = Record<string, number>;

export type ScoredCandidate = {
  candidate: VisualCandidate;
  score: number; // 0..100
  breakdown: ScoreBreakdown;
};

export class VisualCandidateScorer {
  constructor(private readonly scorers: CandidateScorer[] = DEFAULT_SCORERS) {}

  buildContext(candidate: VisualCandidate, meta: VisualQueryMeta, queries: string[]): ScoringContext {
    const candidateTokens = tokens(`${candidate.altText} ${candidate.tags.join(" ")} ${candidate.query}`);
    return {
      candidate,
      meta,
      queries,
      tagTokens: concreteTagTokens(meta.visualTags ?? []),
      candidateTokens,
      moodTokens: tokens(String(meta.visualMood ?? "")),
    };
  }

  score(candidate: VisualCandidate, meta: VisualQueryMeta, queries: string[]): ScoredCandidate {
    const ctx = this.buildContext(candidate, meta, queries);
    let total = 0;
    const breakdown: ScoreBreakdown = {};
    for (const scorer of this.scorers) {
      const normalized = Math.max(0, Math.min(1, scorer.score(ctx)));
      const points = normalized * scorer.weight;
      breakdown[scorer.name] = Math.round(points * 100) / 100;
      total += points;
    }
    return { candidate, score: Math.round(total * 100) / 100, breakdown };
  }
}

// ---------------------------------------------------------------------------
// Dedupe / filter / rank / select
// ---------------------------------------------------------------------------

/** Canonical source URL for dedup (strip query string + trailing slash + protocol noise). */
export function canonicalSourceUrl(url: string): string {
  return String(url ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .replace(/\/+$/, "");
}

/** Deduplicate by Pexels photo id AND canonical source URL. */
export function dedupeCandidates(candidates: VisualCandidate[]): VisualCandidate[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const out: VisualCandidate[] = [];
  for (const c of candidates) {
    const url = canonicalSourceUrl(c.sourceUrl);
    if (seenIds.has(c.sourceAssetId) || (url && seenUrls.has(url))) continue;
    seenIds.add(c.sourceAssetId);
    if (url) seenUrls.add(url);
    out.push(c);
  }
  return out;
}

export type FilterResult = { kept: VisualCandidate[]; rejected: number };

/**
 * Remove clearly unsuitable candidates: missing URL, too small, unusable dimensions.
 * Orientation is enforced softly — if any candidate matches the desired orientation,
 * the mismatched ones are dropped (never select the wrong orientation when a suitable
 * alternative exists); if none match, they are kept and left to ranking.
 */
export function filterCandidates(candidates: VisualCandidate[], meta: VisualQueryMeta): FilterResult {
  const desired = desiredOrientation(meta);
  let usable = candidates.filter((c) => {
    if (!c.previewUrl) return false;
    if (!c.width || !c.height) return false;
    if (Math.min(c.width, c.height) < MIN_SHORT_SIDE) return false;
    return true;
  });
  const rejectedBySize = candidates.length - usable.length;

  const matchingOrientation = usable.filter((c) => c.orientation === desired);
  if (matchingOrientation.length > 0) {
    return { kept: matchingOrientation, rejected: rejectedBySize + (usable.length - matchingOrientation.length) };
  }
  return { kept: usable, rejected: rejectedBySize };
}

/** Dedupe → filter → rank (descending score). */
export function rankCandidates(
  candidates: VisualCandidate[],
  meta: VisualQueryMeta,
  queries: string[],
  scorer: VisualCandidateScorer = new VisualCandidateScorer(),
): { ranked: ScoredCandidate[]; rejected: number } {
  const unique = dedupeCandidates(candidates);
  const { kept, rejected } = filterCandidates(unique, meta);
  const ranked = kept.map((c) => scorer.score(c, meta, queries)).sort((a, b) => b.score - a.score);
  return { ranked, rejected };
}

/**
 * Select the best candidate at or above the threshold, or null when nothing is suitable.
 * The caller decides whether to run a refined retry pass (needs_review) on a null result.
 */
export function selectBestVisual(
  candidates: VisualCandidate[],
  meta: VisualQueryMeta,
  queries: string[],
  threshold = MIN_RELEVANCE_THRESHOLD,
  scorer: VisualCandidateScorer = new VisualCandidateScorer(),
): ScoredCandidate | null {
  const { ranked } = rankCandidates(candidates, meta, queries, scorer);
  return ranked.find((r) => r.score >= threshold) ?? null;
}
