// ---------------------------------------------------------------------------
// Visual search query generation.
//
// The generated post text is NEVER sent to Pexels. Only the visual SEARCH metadata
// (visualTags / visualMood / visualStyle / visualCategory / visualOrientation, plus
// platform / contentFormat) is turned into 3-5 concise, concrete, photo-searchable
// queries. Pure functions — exported for tests, no I/O.
// ---------------------------------------------------------------------------

import type { VisualCategory, VisualOrientation, VisualStyle } from "../ugc/ugc.schemas";

export type VisualQueryMeta = {
  visualTags: string[];
  visualMood?: string | null;
  visualStyle?: string | null;
  visualCategory?: string | null;
  visualOrientation?: VisualOrientation | string | null;
  platform?: string | null;
  contentFormat?: string | null;
  contentType?: string | null;
};

// Abstract/marketing words make terrible image queries — drop tags that are only these,
// and never emit them as a standalone query (spec: avoid "success", "growth", ...).
const ABSTRACT_WORDS = new Set(
  ("success growth innovation strategy business synergy solution value mission vision leadership productivity mindset hustle grind empowerment transformation engagement optimization quality excellence future opportunity journey community impact").split(
    " ",
  ),
);

const GENERIC_TAGS = new Set(
  ("image images photo photos picture pictures visual visuals content background stock media graphic graphics thumbnail poster banner illustration video clip thing stuff nice good cool random").split(
    " ",
  ),
);

// visualCategory → concrete, believable photo scenes (the fallback when tags are thin).
const CATEGORY_SEEDS: Record<VisualCategory, string[]> = {
  creator_lifestyle: ["content creator filming phone", "young person at home phone", "creator recording selfie video"],
  workspace: ["person working laptop desk", "modern home office desk", "founder working laptop natural light"],
  product_closeup: ["hands holding product closeup", "product on table closeup", "unboxing product hands"],
  screen_ui: ["person using smartphone app", "hands holding smartphone screen", "phone app screen closeup"],
  people_talking: ["two people talking cafe", "friends having conversation", "person speaking to camera"],
  hands_and_objects: ["hands working with object", "hands holding coffee cup", "hands typing keyboard"],
  outdoor: ["person walking outside city", "outdoor street natural light", "person standing park"],
  street: ["city street people walking", "urban sidewalk storefront", "downtown street daytime"],
  home: ["cozy home living room", "person relaxing at home couch", "home interior natural light"],
  food_and_drink: ["coffee cup on table", "person drinking coffee cafe", "fresh food on table"],
  fitness: ["person exercising gym", "home workout yoga mat", "runner jogging outside"],
  abstract_texture: ["minimal neutral texture background", "soft gradient surface", "clean plain background"],
};

// visualStyle → a light photographic modifier (keeps results feeling UGC-authentic).
const STYLE_MODIFIERS: Record<VisualStyle, string> = {
  ugc: "candid smartphone photo",
  candid: "candid natural moment",
  lifestyle: "lifestyle natural light",
  product_photography: "clean product photo",
  screen_capture: "screen view closeup",
  documentary: "documentary style candid",
  cinematic: "cinematic natural light",
  illustration: "simple flat scene",
};

const MAX_WORDS = 6;

function cleanTag(tag: string): string {
  return String(tag ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUselessTag(tag: string): boolean {
  const t = cleanTag(tag);
  if (!t || t.length < 3) return true;
  if (GENERIC_TAGS.has(t)) return true;
  const words = t.split(" ");
  // every word abstract/generic → not a searchable visual concept
  return words.every((w) => ABSTRACT_WORDS.has(w) || GENERIC_TAGS.has(w));
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function clampWords(query: string): string {
  return query.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).join(" ");
}

function concreteMoodWords(mood?: string | null): string[] {
  if (!mood) return [];
  return String(mood)
    .toLowerCase()
    .split(/[,;|/]+/)
    .map((w) => w.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((w) => w && w.length > 2 && !ABSTRACT_WORDS.has(w) && !GENERIC_TAGS.has(w))
    .slice(0, 3);
}

/**
 * Build 3-5 concrete visual search queries, ordered most-specific → broadest.
 * queryIndex 0 is the tightest query; the scorer rewards candidates from earlier queries.
 */
export function buildVisualQueries(meta: VisualQueryMeta, max = 5): string[] {
  const tags = dedupe((meta.visualTags ?? []).map(cleanTag).filter((t) => !isUselessTag(t)));
  const seeds = CATEGORY_SEEDS[(meta.visualCategory as VisualCategory) ?? ""] ?? [];
  const styleMod = STYLE_MODIFIERS[(meta.visualStyle as VisualStyle) ?? ""] ?? "";
  const mood = concreteMoodWords(meta.visualMood);

  const queries: string[] = [];

  // 1-2. the strongest concrete tags as-is (already visual phrases)
  if (tags[0]) queries.push(tags[0]);
  if (tags[1]) queries.push(tags[1]);

  // 3. a category scene (concrete + believable even when tags are thin)
  if (seeds[0]) queries.push(seeds[0]);

  // 4. tag + photographic style modifier ("startup founder working laptop candid")
  if (tags[0] && styleMod) queries.push(clampWords(`${tags[0]} ${styleMod}`));

  // 5. tag/seed + a concrete mood word ("... natural light")
  const base = tags[2] ?? seeds[1] ?? tags[0];
  if (base && mood[0]) queries.push(clampWords(`${base} ${mood[0]}`));

  // pad to a minimum of 3 from category seeds / remaining tags
  for (const seed of seeds) {
    if (dedupe(queries.map(clampWords)).length >= 3) break;
    queries.push(seed);
  }
  for (const tag of tags) {
    if (dedupe(queries.map(clampWords)).length >= 3) break;
    queries.push(tag);
  }

  return dedupe(queries.map(clampWords)).slice(0, Math.max(3, max));
}

/**
 * Refined (broader) queries for the retry pass when nothing cleared the threshold.
 * Leans on category scenes and 2-word tag combos, dropping the narrow style/mood
 * modifiers so the pool widens instead of repeating the same failed search.
 */
export function refineVisualQueries(meta: VisualQueryMeta, alreadyTried: string[] = [], max = 4): string[] {
  const tried = new Set(alreadyTried.map((q) => q.trim().toLowerCase()));
  const tags = dedupe((meta.visualTags ?? []).map(cleanTag).filter((t) => !isUselessTag(t)));
  const seeds = CATEGORY_SEEDS[(meta.visualCategory as VisualCategory) ?? ""] ?? [];

  const queries: string[] = [];
  // broader category scenes first
  for (const seed of seeds) queries.push(seed);
  // 2-word tag heads ("startup founder", "person laptop")
  for (const tag of tags) {
    const head = tag.split(/\s+/).slice(0, 2).join(" ");
    if (head) queries.push(head);
  }
  // single concrete nouns from tags as a last resort
  for (const tag of tags) {
    const words = tag.split(/\s+/).filter((w) => !ABSTRACT_WORDS.has(w) && !GENERIC_TAGS.has(w));
    if (words[0]) queries.push(words[0]);
  }

  return dedupe(queries.map(clampWords))
    .filter((q) => !tried.has(q.toLowerCase()))
    .slice(0, max);
}
