import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { companies, contentGenerationJobs, generatedContents } from "../../db/schema";
import type { ContentAngle } from "../brand/brand.schemas";
import { buildBrandContextPrompt, extractJson, getBrandContext, type BrandContext } from "../brand/brand.service";
import { PROMPT_VERSION, UGC_CREATOR_SYSTEM_PROMPT, buildUgcBatchPrompt, type ContentSlot } from "./ugc.prompts";
import {
  FORMAT_REQUIRED_FIELDS,
  UGC_CONTENT_FORMATS,
  UGC_CONTENT_TYPES,
  UGC_PLATFORMS,
  aiUgcItemSchema,
  canonicalUgcItemSchema,
  coerceCanonicalItem,
  normalizeContentFormat,
  normalizeContentType,
  normalizePlatform,
  normalizeVisualCategory,
  normalizeVisualOrientation,
  normalizeVisualStyle,
  parseGeneratedContentRow,
  type CanonicalUgcItem,
  type GeneratedContentDoc,
  type GeneratedContentListQuery,
  type UgcContentFormat,
  type UgcContentType,
  type UgcPlatform,
} from "./ugc.schemas";

// ---------------------------------------------------------------------------
// Automatic UGC content generation.
//
// Brand Intelligence (ready) + content angles (saved) → a background job writes at
// least DEFAULT_TARGET_COUNT distinct content pieces into `generated_content`,
// distributed across the brand's own angles/platforms/formats. Text + visual SEARCH
// metadata only — visuals are matched later by the Visual Content Studio, which reads
// rows with visualAssetId IS NULL. brandId === companyId in this codebase.
// ---------------------------------------------------------------------------

export const DEFAULT_TARGET_COUNT = 100;
export const JOB_TYPE_INITIAL = "initial_content_generation";

const BATCH_SIZE = 5; // pieces per AI call
const CONCURRENCY = 3; // batches in flight
const MAX_ROUNDS = 4; // initial pass + regeneration passes for failed/duplicate items
const RECENT_LIMIT = 40; // rows loaded per angle for dedupe + prompt context
const RECENT_IN_PROMPT = 20; // how many of those are shown to the model
const DUPLICATE_SIMILARITY = 0.75; // Jaccard threshold — "one word changed" is a duplicate
const STALE_JOB_MS = 15 * 60 * 1000; // a "processing" job older than this can be taken over

export class UgcError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "UgcError";
  }
}

// ---------------------------------------------------------------------------
// Text helpers — dedupe + fabrication scanning (pure, exported for tests)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  ("the a an and or but if then than that this these those you your yours we our us i my me is are was were be been being to of in on for with at by from as into about it its not no so do does did have has had just really very more most some any all out up down over under again once here there when where why how what which who").split(
    " ",
  ),
);

export function normalizeTextForDedupe(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeTextForDedupe(text)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Jaccard similarity of two token sets — 1 means identical wording/idea surface. */
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Stable per-brand duplicate key (also the unique index guard for safe retries). */
export function contentHash(hook: string, body: string): string {
  return createHash("sha256").update(`${normalizeTextForDedupe(hook)}|${normalizeTextForDedupe(body)}`).digest("hex").slice(0, 40);
}

// Spec §6 phrase blocklist — allowed only when the brand actually uses the phrase.
const BANNED_PHRASES = [
  "game changer",
  "gamechanger",
  "revolutionary",
  "unlock your potential",
  "take your business to the next level",
  "in today's fast-paced world",
  "in today s fast paced world",
  "here's the secret",
  "here s the secret",
  "you won't believe",
  "you won t believe",
  "transform your business",
  "ultimate solution",
  "cutting-edge",
  "cutting edge",
  "powerful solution",
  "seamless solution",
  "elevate your",
  "supercharge",
  "level up your",
  "no brainer",
  "the future is here",
];

// Spec §19 — reject invented numbers/results/testimonials instead of trusting the model.
const FABRICATION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b\d{1,3}(?:[.,]\d+)?\s?%/, label: "invented statistic (percentage)" },
  { re: /\b\d+\s?(?:out of|of)\s?10\b/i, label: "invented statistic (x out of 10)" },
  { re: /\b(?:studies|research|data|statistics|surveys?)\s+(?:show|shows|say|says|suggest|suggests|prove|proves|found)\b/i, label: "invented research claim" },
  { re: /\b\d+\s?(?:x|times)\s+(?:more|faster|better|cheaper|easier)\b/i, label: "invented multiplier claim" },
  { re: /\b(?:increase[ds]?|grew|grow|boost(?:ed)?|improve[ds]?|reduc(?:e|ed)|sav(?:e|ed|ings)|earn(?:e|ed)|made|generated)\s+(?:by\s+)?\$\s?\d/i, label: "invented money result" },
  { re: /\b\d[\d.,]*\s?(?:k|m|million|thousand|bn|billion)?\s*(?:in\s+)?(?:revenue|sales|users|customers|downloads|signups|sign-ups|leads|subscribers)\b/i, label: "invented scale claim" },
  { re: /\b\d(?:\.\d)?\s?-?\s?stars?\b|\b5\s?stars?\b/i, label: "invented rating" },
  { re: /\b(?:our|my|their)\s+(?:customers?|clients?|users?|students?|members?)\s+(?:say|says|said|told|tell|love|loved)\b/i, label: "invented testimonial" },
  { re: /\bas\s+(?:one|a)\s+(?:customer|client|user|founder|friend)\s+(?:once\s+)?(?:told|said)\b/i, label: "invented testimonial" },
  { re: /\bguarantee[ds]?\b|\bproven to\b|\brisk[- ]free\b/i, label: "unsupported promise" },
  { re: /\bin just \d+\s+(?:days?|weeks?|hours?|minutes?)\b/i, label: "unrealistic timeframe promise" },
  { re: /\b\d[\d.,]*\s?(?:customers|clients|users|brands|teams|businesses)\s+(?:trust|use|love|rely on)\b/i, label: "invented customer count" },
];

const GENERIC_VISUAL_TAGS = new Set(
  "image images photo photos picture pictures visual visuals content background stock media graphic graphics thumbnail poster banner illustration video clip person people thing stuff nice good cool random".split(
    " ",
  ),
);

/** Returns a rejection reason, or null when the text is clean. */
export function scanForFabrication(text: string, brandText: string, allowedPhrases: string[] = []): string | null {
  const haystack = normalizeTextForDedupe(text);
  if (!haystack) return null;
  for (const phrase of BANNED_PHRASES) {
    if (allowedPhrases.some((p) => p && normalizeTextForDedupe(p) === phrase)) continue; // brand vocabulary wins
    if (haystack.includes(phrase)) return `generic marketing phrase "${phrase}"`;
  }
  for (const { re, label } of FABRICATION_PATTERNS) {
    const match = text.match(re);
    if (!match) continue;
    const digits = match[0].match(/\d+(?:[.,]\d+)?/);
    // a number that exists in Brand Intelligence is not invented
    if (digits && brandText.includes(digits[0])) continue;
    return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generation distribution (spec §14) — spread the target across the brand's angles
// ---------------------------------------------------------------------------

const PLATFORM_FORMATS: Record<UgcPlatform, UgcContentFormat[]> = {
  instagram: ["wall_of_text_slide", "video_hook", "talking_head", "product_demo", "green_screen", "meme", "ugc_video", "spokesperson"],
  tiktok: ["video_hook", "talking_head", "green_screen", "product_demo", "meme", "ugc_video", "clay_motion", "mobile_app"],
  linkedin: ["wall_of_text_slide", "talking_head", "video_hook", "product_demo", "spokesperson", "website_demo", "screen_recording"],
  x: ["wall_of_text_slide", "video_hook", "meme", "screen_recording", "talking_head"],
  youtube_shorts: ["video_hook", "talking_head", "screen_recording", "product_demo", "ugc_video", "mobile_app", "website_demo"],
  facebook: ["video_hook", "talking_head", "wall_of_text_slide", "product_demo", "ugc_video", "spokesperson"],
};

// Angle wording that makes a format a natural fit (spec §4: pick from angle + platform).
const FORMAT_KEYWORDS: Record<UgcContentFormat, string[]> = {
  wall_of_text_slide: ["text", "list", "mistakes", "tips", "rules", "lesson", "slide", "carousel", "myth", "principle"],
  video_hook: ["hook", "short", "reel", "trend", "attention", "scroll"],
  talking_head: ["talking", "story", "opinion", "experience", "advice", "founder", "face", "camera", "question"],
  screen_recording: ["screen", "tutorial", "how to", "walkthrough", "software", "recording", "steps"],
  product_demo: ["demo", "product", "unbox", "feature", "show", "before", "after", "result"],
  spokesperson: ["spokesperson", "founder", "ceo", "ambassador", "holding", "character"],
  green_screen: ["green screen", "react", "comment", "duet", "overlay", "news"],
  mobile_app: ["app", "mobile", "phone", "ios", "android", "tap", "swipe"],
  clay_motion: ["clay", "animation", "stop motion", "playful", "craft", "fun"],
  website_demo: ["website", "landing", "signup", "site", "checkout", "page"],
  meme: ["meme", "funny", "humor", "humour", "joke", "relatable", "irony"],
  ugc_video: ["ugc", "review", "day in the life", "vlog", "creator", "authentic"],
};

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function angleText(angle: ContentAngle): string {
  return [angle.name, angle.description, angle.problem, angle.coreMessage, angle.targetAudience, (angle.contentTypes ?? []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** The brand's own platform strategy, normalized; falls back to the full catalog. */
export function anglePlatforms(angle: ContentAngle, angleIndex = 0): UgcPlatform[] {
  const own = dedupe((angle.platforms ?? []).map((p) => normalizePlatform(p)).filter((p): p is UgcPlatform => !!p));
  if (own.length) return own;
  // rotate the starting point per angle so brands without a platform strategy still vary
  return [...UGC_PLATFORMS.slice(angleIndex % UGC_PLATFORMS.length), ...UGC_PLATFORMS.slice(0, angleIndex % UGC_PLATFORMS.length)];
}

export function pickFormat(platform: UgcPlatform, angle: ContentAngle, seed: number): UgcContentFormat {
  const candidates = PLATFORM_FORMATS[platform] ?? UGC_CONTENT_FORMATS;
  const text = angleText(angle);
  // ranked by how well the angle's own wording fits the format (ties broken by name so the
  // plan stays deterministic), then the seed walks that ranking: the angle leads with its
  // best-fit format but still covers the rest of the platform's formats across its pieces.
  const ranked = candidates
    .map((format) => ({ format, score: FORMAT_KEYWORDS[format].filter((kw) => text.includes(kw)).length }))
    .sort((a, b) => b.score - a.score || a.format.localeCompare(b.format));
  return ranked[Math.abs(seed) % ranked.length].format;
}

export function pickContentType(angle: ContentAngle, seed: number): UgcContentType {
  const own = dedupe((angle.contentTypes ?? []).map((t) => normalizeContentType(t)).filter((t): t is UgcContentType => !!t));
  // alternate between the angle's own types and the global catalog so both stay covered
  if (own.length && seed % 2 === 0) return own[Math.floor(seed / 2) % own.length];
  return UGC_CONTENT_TYPES[Math.abs(seed) % UGC_CONTENT_TYPES.length];
}

function slotFor(angle: ContentAngle, indexInAngle: number, angleIndex: number): ContentSlot {
  const platforms = anglePlatforms(angle, angleIndex);
  return {
    contentAngleId: angle.id,
    platform: platforms[indexInAngle % platforms.length],
    contentFormat: pickFormat(platforms[indexInAngle % platforms.length], angle, indexInAngle + angleIndex),
    contentType: pickContentType(angle, indexInAngle + angleIndex),
  };
}

/** Priority-weighted plan: ~10 angles × ~10 pieces = 100, adjusted for any angle count. */
export function planDistribution(angles: ContentAngle[], count: number): ContentSlot[] {
  const active = angles.filter((a) => a.isActive !== false);
  if (!active.length || count <= 0) return [];
  const ordered = [...active].sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5) || a.name.localeCompare(b.name));

  // more angles than pieces — one slot each for the highest-priority angles
  if (ordered.length >= count) return ordered.slice(0, count).map((angle, i) => slotFor(angle, 0, i));

  const weights = ordered.map((a) => Math.max(1, Math.min(10, Math.round(a.priority ?? 5))));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const per = ordered.map((_, i) => Math.max(1, Math.round((count * weights[i]) / totalWeight)));

  // fix rounding drift so the plan sums to exactly `count`
  let sum = per.reduce((s, n) => s + n, 0);
  let guard = 0;
  while (sum > count && guard++ < per.length * 4) {
    let idx = -1;
    for (let i = 0; i < per.length; i++) if (per[i] > 1 && (idx === -1 || per[i] > per[idx])) idx = i;
    if (idx === -1) break;
    per[idx]--;
    sum--;
  }
  let next = 0;
  while (sum < count && guard++ < per.length * 8) {
    per[next % per.length]++;
    sum++;
    next++;
  }

  const slots: ContentSlot[] = [];
  ordered.forEach((angle, angleIndex) => {
    for (let i = 0; i < per[angleIndex]; i++) slots.push(slotFor(angle, i, angleIndex));
  });
  return slots;
}

// ---------------------------------------------------------------------------
// Validation (spec §19) — every AI item is checked before it is allowed near the DB
// ---------------------------------------------------------------------------

export type ValidatedItem = CanonicalUgcItem & {
  contentAngleId: string;
  platform: UgcPlatform;
  contentFormat: UgcContentFormat;
  contentType: UgcContentType;
  contentHash: string;
  tokens: string[];
};

export type DedupeMemory = {
  hashes: Set<string>;
  tokens: string[][];
  hooks: string[];
};

export type ValidationContext = {
  slot: ContentSlot;
  angleIds: string[]; // this brand's own angle ids — a foreign id is always rejected
  brandText: string; // Brand Intelligence text; numbers found here are not "invented"
  allowedPhrases: string[]; // brand vocabulary (tone.wordsToUse) may use a blocklisted phrase
  memory: DedupeMemory; // already-saved + already-accepted-this-run content
};

export type ValidationResult = { ok: true; item: ValidatedItem } | { ok: false; reason: string };

const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});

export function validateGeneratedItem(raw: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = aiUgcItemSchema.safeParse(obj(raw));
  if (!parsed.success) return { ok: false, reason: `not a JSON object (${parsed.error.issues[0]?.message ?? "invalid"})` };
  const data = parsed.data;

  // cross-brand guard: an angle id that is not this brand's is never used (spec §11)
  const claimedAngleId = (data.contentAngleId ?? "").trim();
  if (claimedAngleId && !ctx.angleIds.includes(claimedAngleId)) {
    return { ok: false, reason: `contentAngleId "${claimedAngleId}" does not belong to this brand` };
  }

  // platform/format are server-assigned: an explicit mismatch means the piece was written
  // for the wrong deliverable, so it is regenerated instead of silently relabelled.
  const platform = normalizePlatform(data.platform) ?? (data.platform ? null : ctx.slot.platform);
  if (!platform) return { ok: false, reason: `platform "${String(data.platform)}" is not supported` };
  if (platform !== ctx.slot.platform) return { ok: false, reason: `platform mismatch — expected ${ctx.slot.platform}, got ${platform}` };

  const contentFormat = normalizeContentFormat(data.contentFormat) ?? (data.contentFormat ? null : ctx.slot.contentFormat);
  if (!contentFormat) return { ok: false, reason: `contentFormat "${String(data.contentFormat)}" is not supported` };
  if (contentFormat !== ctx.slot.contentFormat) {
    return { ok: false, reason: `contentFormat mismatch — expected ${ctx.slot.contentFormat}, got ${contentFormat}` };
  }

  const contentType = normalizeContentType(data.contentType) ?? ctx.slot.contentType;

  const candidate = coerceCanonicalItem(data, contentFormat);

  // format contract — "usable content" for the assigned format
  for (const field of FORMAT_REQUIRED_FIELDS[contentFormat]) {
    const value = candidate[field as keyof CanonicalUgcItem];
    const empty = Array.isArray(value) ? value.length < 2 : !String(value ?? "").trim();
    if (empty) return { ok: false, reason: `${contentFormat} needs a non-empty ${field}` };
  }
  if (candidate.hook.trim().length < 8) return { ok: false, reason: "hook is too short to stop a scroll" };

  // visual metadata (spec §8) — required, meaningful, canonical
  const visualStyle = normalizeVisualStyle(candidate.visualStyle) ?? "ugc";
  const visualCategory = normalizeVisualCategory(candidate.visualCategory);
  if (!visualCategory) return { ok: false, reason: "visualCategory is missing or unusable" };
  if (!candidate.visualMood.trim()) return { ok: false, reason: "visualMood is missing" };
  const visualOrientation = normalizeVisualOrientation(candidate.visualOrientation) ?? "portrait";
  const visualTags = dedupe(candidate.visualTags.map((t) => t.toLowerCase()));
  if (visualTags.filter((t) => !GENERIC_VISUAL_TAGS.has(t)).length < 2) {
    return { ok: false, reason: "visualTags must contain at least 2 concrete search terms" };
  }

  const shaped = canonicalUgcItemSchema.safeParse({
    ...candidate,
    visualTags,
    visualStyle,
    visualCategory,
    visualOrientation,
  });
  if (!shaped.success) return { ok: false, reason: shaped.error.issues[0]?.message ?? "invalid content shape" };

  const text = [shaped.data.hook, shaped.data.title, shaped.data.body, shaped.data.script, shaped.data.cta, ...shaped.data.lines, ...shaped.data.onScreenText]
    .filter(Boolean)
    .join("\n");

  const fabrication = scanForFabrication(text, ctx.brandText, ctx.allowedPhrases);
  if (fabrication) return { ok: false, reason: fabrication };

  // duplicate prevention (spec §12) — hash first, then idea/perspective similarity
  const hash = contentHash(shaped.data.hook, text);
  if (ctx.memory.hashes.has(hash)) return { ok: false, reason: "duplicate of content already saved for this brand" };
  const tokens = tokenize(`${shaped.data.hook} ${shaped.data.title} ${shaped.data.body ?? ""} ${shaped.data.script ?? ""} ${shaped.data.lines.join(" ")}`);
  const hookTokens = tokenize(shaped.data.hook);
  for (const existing of ctx.memory.tokens) {
    if (similarity(tokens, existing) >= DUPLICATE_SIMILARITY) {
      return { ok: false, reason: "too similar to content already generated for this brand" };
    }
  }
  for (const existingHook of ctx.memory.hooks) {
    if (similarity(hookTokens, tokenize(existingHook)) >= DUPLICATE_SIMILARITY) {
      return { ok: false, reason: "hook is too similar to one already generated for this brand" };
    }
  }

  return {
    ok: true,
    item: {
      ...shaped.data,
      visualTags: shaped.data.visualTags,
      visualStyle,
      visualCategory,
      visualOrientation,
      contentAngleId: ctx.slot.contentAngleId,
      platform,
      contentFormat,
      contentType,
      contentHash: hash,
      tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function insertContent(input: {
  userId: string;
  companyId: string;
  jobId: string;
  item: ValidatedItem;
  model: string | null;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const { item } = input;
  try {
    // onConflictDoNothing = retry-safe: a re-run can never duplicate a saved piece
    const rows = await db
      .insert(generatedContents)
      .values({
        userId: input.userId,
        companyId: input.companyId,
        jobId: input.jobId,
        contentAngleId: item.contentAngleId,
        platform: item.platform,
        contentFormat: item.contentFormat,
        contentType: item.contentType,
        generationMode: "initial",
        language: "en",
        hook: item.hook,
        title: item.title,
        body: item.body,
        lines: item.lines.length ? JSON.stringify(item.lines) : null,
        script: item.script,
        onScreenText: item.onScreenText.length ? JSON.stringify(item.onScreenText) : null,
        cta: item.cta,
        visualTags: JSON.stringify(item.visualTags),
        visualMood: item.visualMood,
        visualStyle: item.visualStyle,
        visualCategory: item.visualCategory,
        visualOrientation: item.visualOrientation,
        status: "generated",
        source: "ai",
        model: input.model,
        promptVersion: PROMPT_VERSION,
        contentHash: item.contentHash,
        visualIntentId: null,
        visualAssetId: null,
        usageCount: "0",
        isEdited: "0",
        editedAt: null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function countGeneratedContent(companyId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(generatedContents)
    .where(eq(generatedContents.companyId, companyId));
  return Number((row as any)?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Job bookkeeping — one row per (company, type), reused and resumed
// ---------------------------------------------------------------------------

export function isStaleJob(status: string, updatedAt: string | null, maxAgeMs = STALE_JOB_MS): boolean {
  if (status !== "processing" || !updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && Date.now() - t > maxAgeMs;
}

async function findJob(companyId: string) {
  const [row] = await db
    .select()
    .from(contentGenerationJobs)
    .where(and(eq(contentGenerationJobs.companyId, companyId), eq(contentGenerationJobs.type, JOB_TYPE_INITIAL)));
  return row ?? null;
}

async function ensureJob(input: { userId: string; companyId: string; targetCount: number }) {
  const existing = await findJob(input.companyId);
  const now = new Date().toISOString();
  if (existing) {
    const [row] = await db
      .update(contentGenerationJobs)
      .set({
        userId: input.userId,
        targetCount: String(input.targetCount),
        status: "pending",
        error: null,
        startedAt: null,
        completedAt: null,
        promptVersion: PROMPT_VERSION,
        updatedAt: now,
      })
      .where(eq(contentGenerationJobs.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(contentGenerationJobs)
    .values({
      userId: input.userId,
      companyId: input.companyId,
      type: JOB_TYPE_INITIAL,
      targetCount: String(input.targetCount),
      generatedCount: "0",
      status: "pending",
      promptVersion: PROMPT_VERSION,
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning();
  return row;
}

async function touchJob(jobId: string, patch: Record<string, unknown>) {
  await db
    .update(contentGenerationJobs)
    .set({ ...patch, updatedAt: new Date().toISOString() } as any)
    .where(eq(contentGenerationJobs.id, jobId));
}

export type GenerationJobResult = {
  jobId: string | null;
  status: string;
  targetCount: number;
  generatedCount: number;
  savedThisRun: number;
  error: string | null;
  alreadyRunning?: boolean;
};

async function summarizeJob(job: { id: string | null; status: string; targetCount: number; generatedCount: number; error: string | null }, savedCount: number, extra: Partial<GenerationJobResult> = {}): Promise<GenerationJobResult> {
  return {
    jobId: job.id,
    status: job.status,
    targetCount: job.targetCount,
    generatedCount: job.generatedCount,
    savedThisRun: 0,
    error: job.error,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// AI call — injectable so tests never hit a provider (mirrors scrapeFn in instagram.service)
// ---------------------------------------------------------------------------

export type UgcBatchGenerator = (input: {
  userId: string;
  brandBlock: string;
  angle: ContentAngle;
  slots: ContentSlot[];
  recentContent: string[];
  attemptNote: string | null;
}) => Promise<{ items: unknown[]; model: string | null }>;

export const aiBatchGenerator: UgcBatchGenerator = async ({ userId, brandBlock, angle, slots, recentContent, attemptNote }) => {
  // ponytail: dynamic import — the AI SDKs are only loaded when we actually call a model,
  // so read-only paths (list/status) and tests never pull in the provider packages.
  const { resolveUserModel } = await import("../company/company.workflow");
  const model = await resolveUserModel(userId, "text");
  const agent = new (await import("@mastra/core/agent")).Agent({
    id: "ugc-content-agent",
    name: "ugc-content-agent",
    instructions: UGC_CREATOR_SYSTEM_PROMPT,
    model: model as any,
  });
  const res = await agent.generate(buildUgcBatchPrompt({ brandBlock, angle, slots, recentContent, attemptNote }));
  if (!res?.text) throw new UgcError("AI returned an empty response", 502);
  const parsed = extractJson(res.text);
  const items = Array.isArray(parsed?.contents) ? parsed.contents : Array.isArray(parsed) ? parsed : [];
  return { items, model: String((model as any)?.modelId ?? (model as any)?.model ?? "unknown") };
};

// ---------------------------------------------------------------------------
// The generation run
// ---------------------------------------------------------------------------

type PendingUnit = { slot: ContentSlot; note: string | null };
type RunMemory = DedupeMemory & { byAngle: Map<string, { hook: string; title: string; platform: string; contentFormat: string }[]> };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function groupUnits(units: PendingUnit[], size: number): PendingUnit[][] {
  const byAngle = new Map<string, PendingUnit[]>();
  for (const unit of units) {
    const group = byAngle.get(unit.slot.contentAngleId) ?? [];
    group.push(unit);
    byAngle.set(unit.slot.contentAngleId, group);
  }
  const batches: PendingUnit[][] = [];
  for (const group of byAngle.values()) batches.push(...chunk(group, size));
  return batches;
}

/** Recently saved pieces for one angle — the dedupe set + the model's "don't repeat this" list. */
async function loadRecentForAngle(companyId: string, angleId: string) {
  const rows = await db
    .select({
      hook: generatedContents.hook,
      title: generatedContents.title,
      body: generatedContents.body,
      script: generatedContents.script,
      platform: generatedContents.platform,
      contentFormat: generatedContents.contentFormat,
    })
    .from(generatedContents)
    .where(and(eq(generatedContents.companyId, companyId), eq(generatedContents.contentAngleId, angleId)))
    .orderBy(desc(generatedContents.createdAt))
    .limit(RECENT_LIMIT);
  return rows.map((r) => ({
    hook: r.hook ?? "",
    title: r.title ?? "",
    body: r.body ?? "",
    script: r.script ?? "",
    platform: r.platform ?? "",
    contentFormat: r.contentFormat ?? "",
  }));
}

export type GenerateOptions = {
  companyId: string; // === brandId
  userId: string;
  targetCount?: number;
  generateFn?: UgcBatchGenerator;
  concurrency?: number;
};

/**
 * Generate (and persist) at least `targetCount` UGC content pieces for a brand whose
 * Brand Intelligence is ready. Safe to call repeatedly: an in-flight run is left alone,
 * an already-met target is a no-op, and a failed run resumes from what is already saved.
 */
export async function generateInitialBrandContent(opts: GenerateOptions): Promise<GenerationJobResult> {
  const { companyId, userId } = opts;
  const targetCount = Math.max(1, Math.min(500, Math.round(opts.targetCount ?? DEFAULT_TARGET_COUNT)));
  const generateFn = opts.generateFn ?? aiBatchGenerator;
  const concurrency = Math.max(1, opts.concurrency ?? CONCURRENCY);

  // 1. verify brand ownership (never trust ids from a caller)
  const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  if (!company) throw new UgcError("Company not found", 404);

  // 2. verify Brand Intelligence + content angles are complete
  const ctx = await getBrandContext(companyId, userId);
  if (!ctx) throw new UgcError("Brand Intelligence is not ready for this brand yet", 409);
  if (!ctx.contentAngles.length) throw new UgcError("No active content angles for this brand yet", 409);

  // 3. create/reuse the job — but never clobber a run that is genuinely in flight
  if (inFlight.has(companyId)) {
    const running = await findJob(companyId);
    const saved = await countGeneratedContent(companyId);
    return summarizeJob(
      { id: running?.id ?? null, status: running?.status ?? "processing", targetCount, generatedCount: saved, error: null },
      saved,
      { alreadyRunning: true },
    );
  }
  const existingJob = await findJob(companyId);
  if (existingJob && existingJob.status === "processing" && !isStaleJob(existingJob.status, existingJob.updatedAt)) {
    const saved = await countGeneratedContent(companyId);
    return summarizeJob(
      { id: existingJob.id, status: existingJob.status, targetCount, generatedCount: saved, error: null },
      saved,
      { alreadyRunning: true },
    );
  }

  const job = await ensureJob({ userId, companyId, targetCount });
  const jobId = job.id;
  inFlight.add(companyId);
  const startedWith = await countGeneratedContent(companyId);

  try {
    // 4. already at target (e.g. re-analysis after a successful run) → nothing to do
    if (startedWith >= targetCount) {
      await touchJob(jobId, { status: "completed", generatedCount: String(startedWith), startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), error: null });
      return { jobId, status: "completed", targetCount, generatedCount: startedWith, savedThisRun: 0, error: null };
    }

    await touchJob(jobId, { status: "processing", startedAt: new Date().toISOString(), generatedCount: String(startedWith) });

    const brandBlock = buildBrandContextPrompt(ctx);
    const allowedPhrases = [...(ctx.tone.wordsToUse ?? []), ...(ctx.tone.personality ?? [])];
    const angleIds = ctx.contentAngles.map((a) => a.id);
    const anglesById = new Map(ctx.contentAngles.map((a) => [a.id, a]));

    // 5. seed dedupe memory with what is already saved (resume-safe)
    const memory: RunMemory = { hashes: new Set(), tokens: [], hooks: [], byAngle: new Map() };
    const existingRows = await db
      .select({
        contentAngleId: generatedContents.contentAngleId,
        hook: generatedContents.hook,
        title: generatedContents.title,
        body: generatedContents.body,
        script: generatedContents.script,
        platform: generatedContents.platform,
        contentFormat: generatedContents.contentFormat,
      })
      .from(generatedContents)
      .where(eq(generatedContents.companyId, companyId))
      .orderBy(desc(generatedContents.createdAt))
      .limit(500);
    for (const row of existingRows) {
      const text = [row.hook, row.title, row.body, row.script].filter(Boolean).join(" ");
      memory.hashes.add(contentHash(row.hook ?? "", text));
      memory.tokens.push(tokenize(text));
      memory.hooks.push(row.hook ?? "");
      const list = memory.byAngle.get(row.contentAngleId) ?? [];
      list.push({ hook: row.hook ?? "", title: row.title ?? "", platform: row.platform ?? "", contentFormat: row.contentFormat ?? "" });
      memory.byAngle.set(row.contentAngleId, list);
    }

    let model: string | null = null;
    let pending: PendingUnit[] = planDistribution(ctx.contentAngles, targetCount - startedWith).map((slot) => ({ slot, note: null }));
    let round = 0;

    const recentContentFor = (angleId: string, slots: ContentSlot[]): string[] => {
      const savedForAngle = memory.byAngle.get(angleId) ?? [];
      const wanted = new Set(slots.map((s) => `${s.platform}|${s.contentFormat}`));
      const matching = savedForAngle.filter((r) => wanted.has(`${r.platform}|${r.contentFormat}`));
      const others = savedForAngle.filter((r) => !wanted.has(`${r.platform}|${r.contentFormat}`));
      return [...matching, ...others]
        .slice(0, RECENT_IN_PROMPT)
        .map((r) => [r.hook, r.title].filter(Boolean).join(" — ").slice(0, 160))
        .filter(Boolean);
    };

    const runBatch = async (batch: PendingUnit[]) => {
      const angleId = batch[0].slot.contentAngleId;
      const angle = anglesById.get(angleId);
      if (!angle) return { saved: 0, failed: [] as PendingUnit[] };
      const slots = batch.map((b) => b.slot);
      const note = batch.map((b) => b.note).find(Boolean) ?? null;
      const { items, model: usedModel } = await generateFn({
        userId,
        brandBlock,
        angle,
        slots,
        recentContent: recentContentFor(angleId, slots),
        attemptNote: note,
      });
      if (usedModel) model = usedModel;

      const failed: PendingUnit[] = [];
      let saved = 0;
      const validationCtx = { slot: slots[0], angleIds, brandText: brandBlock, allowedPhrases, memory };

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const raw = Array.isArray(items) ? items[i] : undefined;
        if (raw == null) {
          failed.push({ slot, note: "the previous response did not include an item for this assignment" });
          continue;
        }
        const result = validateGeneratedItem(raw, { ...validationCtx, slot });
        if (!result.ok) {
          failed.push({ slot, note: result.reason });
          continue;
        }
        const inserted = await insertContent({ userId, companyId, jobId, item: result.item, model });
        if (!inserted) {
          failed.push({ slot, note: "an identical piece is already saved for this brand" });
          continue;
        }
        // remember it so the rest of the run cannot repeat it
        memory.hashes.add(result.item.contentHash);
        memory.tokens.push(result.item.tokens);
        memory.hooks.push(result.item.hook);
        const list = memory.byAngle.get(slot.contentAngleId) ?? [];
        list.unshift({ hook: result.item.hook, title: result.item.title, platform: slot.platform, contentFormat: slot.contentFormat });
        memory.byAngle.set(slot.contentAngleId, list);
        saved++;
      }
      return { saved, failed };
    };

    // 6. rounds: generate → validate → dedupe → save; only failed items are regenerated
    while (pending.length && round < MAX_ROUNDS) {
      round++;
      const batches = groupUnits(pending, BATCH_SIZE);
      const next: PendingUnit[] = [];

      for (const group of chunk(batches, concurrency)) {
        const settled = await Promise.allSettled(group.map((batch) => runBatch(batch)));
        settled.forEach((res, i) => {
          if (res.status === "fulfilled") {
            next.push(...res.value.failed);
          } else {
            const reason = String((res.reason as any)?.message ?? "generation failed").slice(0, 200);
            next.push(...group[i].map((unit) => ({ slot: unit.slot, note: `the previous attempt failed (${reason})` })));
          }
        });
      }

      const total = await countGeneratedContent(companyId);
      await touchJob(jobId, { status: "processing", generatedCount: String(total), model, error: null });
      pending = total >= targetCount ? [] : next;
    }

    // 7. finalize
    const savedCount = await countGeneratedContent(companyId);
    if (savedCount >= targetCount) {
      await touchJob(jobId, {
        status: "completed",
        generatedCount: String(savedCount),
        completedAt: new Date().toISOString(),
        model,
        error: null,
      });
      return { jobId, status: "completed", targetCount, generatedCount: savedCount, savedThisRun: savedCount - startedWith, error: null };
    }
    const message = `Generated ${savedCount} of ${targetCount} content pieces — the AI provider returned too many unusable or duplicate items. Retry to continue from ${savedCount}.`;
    await touchJob(jobId, {
      status: "failed",
      generatedCount: String(savedCount),
      completedAt: new Date().toISOString(),
      model,
      error: message,
    });
    return { jobId, status: "failed", targetCount, generatedCount: savedCount, savedThisRun: savedCount - startedWith, error: message };
  } catch (e: any) {
    const message = String(e?.message ?? e).slice(0, 2000);
    const savedCount = await countGeneratedContent(companyId).catch(() => 0);
    await touchJob(jobId, { status: "failed", generatedCount: String(savedCount), error: message, model: null }).catch(() => {});
    if (e instanceof UgcError) throw e;
    throw new UgcError(message, 502);
  } finally {
    inFlight.delete(companyId);
  }
}

/** In-process guard: one run per brand (mirrors media.service inFlightSubmissions). */
const inFlight = new Set<string>();

/**
 * Fire-and-forget trigger used by the Brand Intelligence workflow — never throws, never
 * blocks the analysis run, and does nothing when the brand is not ready yet.
 */
export async function maybeStartContentGeneration(input: { companyId: string; userId: string; targetCount?: number }): Promise<void> {
  try {
    await generateInitialBrandContent(input);
  } catch {
    // the reason is persisted on the job row; the analysis flow must not fail because of it
  }
}

// ---------------------------------------------------------------------------
// Reads (spec §16) — always scoped by brandId (companyId) + owning user
// ---------------------------------------------------------------------------

function buildContentConds(input: { companyId: string; userId: string; query?: Partial<GeneratedContentListQuery> }) {
  const q = input.query ?? {};
  const conds = [eq(generatedContents.companyId, input.companyId), eq(generatedContents.userId, input.userId)];
  if (q.contentAngleId) conds.push(eq(generatedContents.contentAngleId, q.contentAngleId));
  if (q.platform) conds.push(eq(generatedContents.platform, q.platform));
  if (q.contentFormat) conds.push(eq(generatedContents.contentFormat, q.contentFormat));
  if (q.contentType) conds.push(eq(generatedContents.contentType, q.contentType));
  if (q.status) conds.push(eq(generatedContents.status, q.status));
  // "content that still needs a visual" — the third tab's base query
  if (q.visualReady === "true") conds.push(isNull(generatedContents.visualAssetId));
  if (q.visualReady === "false") conds.push(sql`${generatedContents.visualAssetId} IS NOT NULL`);
  return conds;
}

export async function listGeneratedContent(input: {
  companyId: string;
  userId: string;
  query?: Partial<GeneratedContentListQuery>;
}): Promise<{ items: GeneratedContentDoc[]; total: number }> {
  const q = input.query ?? {};
  const where = and(...buildContentConds(input));
  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(generatedContents).where(where);
  const rows = await db
    .select()
    .from(generatedContents)
    .where(where)
    .orderBy(desc(generatedContents.createdAt), desc(generatedContents.id))
    .limit(Math.max(1, Math.min(500, q.limit ?? 100)))
    .offset(Math.max(0, q.offset ?? 0));
  return { items: rows.map((row) => parseGeneratedContentRow(row as any)), total: Number((countRow as any)?.n ?? 0) };
}

export async function getGenerationJobStatus(input: { companyId: string; userId: string }) {
  const [company] = await db.select().from(companies).where(and(eq(companies.id, input.companyId), eq(companies.userId, input.userId)));
  if (!company) throw new UgcError("Company not found", 404);
  const savedCount = await countGeneratedContent(input.companyId);
  const [job] = await db
    .select()
    .from(contentGenerationJobs)
    .where(and(eq(contentGenerationJobs.companyId, input.companyId), eq(contentGenerationJobs.type, JOB_TYPE_INITIAL)));
  if (!job) {
    return { status: "none", type: null, targetCount: DEFAULT_TARGET_COUNT, generatedCount: 0, savedCount, error: null, startedAt: null, completedAt: null, updatedAt: null };
  }
  return {
    status: job.status,
    type: job.type,
    targetCount: Number(job.targetCount ?? DEFAULT_TARGET_COUNT),
    generatedCount: Number(job.generatedCount ?? 0),
    savedCount,
    error: job.error ?? null,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    updatedAt: job.updatedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Resume worker — picks up pending/stale jobs (server restart mid-run), same shape
// as startMediaWorker. Content already saved is never regenerated.
// ---------------------------------------------------------------------------

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

export function startContentGenerationWorker(intervalMs = 60_000) {
  if (workerTimer) return () => {};
  const tick = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      const jobs = await db
        .select()
        .from(contentGenerationJobs)
        .where(inArray(contentGenerationJobs.status, ["pending", "processing"] as any))
        .limit(5);
      for (const job of jobs) {
        if (job.status === "processing" && !isStaleJob(job.status, job.updatedAt)) continue;
        if (inFlight.has(job.companyId)) continue;
        await generateInitialBrandContent({
          companyId: job.companyId,
          userId: job.userId,
          targetCount: Number(job.targetCount ?? DEFAULT_TARGET_COUNT),
        }).catch(() => {});
      }
    } catch {
      // job-level errors are persisted on the job row; the worker must never kill the process
    } finally {
      workerBusy = false;
    }
  };
  workerTimer = setInterval(() => void tick(), intervalMs);
  (workerTimer as any).unref?.();
  return () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  };
}
