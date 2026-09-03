import { z } from "zod";

// ---------------------------------------------------------------------------
// Canonical catalogs for automatically generated UGC content.
// Ids are snake_case (same style as VALID_PLATFORMS in ai.routes). The model may
// answer with free text ("Instagram Reels", "Talking head") — normalizers below
// map it onto these ids, and anything unmappable falls back to the server-assigned
// slot value, so only canonical values ever reach the DB.
// ---------------------------------------------------------------------------

export const UGC_PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "youtube_shorts", "facebook"] as const;

export const UGC_CONTENT_FORMATS = [
  "wall_of_text_slide",
  "video_hook",
  "talking_head",
  "screen_recording",
  "product_demo",
  "spokesperson",
  "green_screen",
  "mobile_app",
  "clay_motion",
  "website_demo",
  "meme",
  "ugc_video",
] as const;

// Storytelling approaches (spec §6 rules 25-38) — every piece gets one so a batch
// never collapses into "problem → solution → CTA" repeated 100 times.
export const UGC_CONTENT_TYPES = [
  "observation",
  "opinion",
  "educational",
  "mistake",
  "story",
  "assumption_challenge",
  "comparison",
  "behavior_explainer",
  "relatable_situation",
  "use_case_demo",
  "question_answer",
  "surprising_insight",
  "objection_handling",
  "practical_lesson",
] as const;

export const VISUAL_STYLES = [
  "ugc",
  "candid",
  "lifestyle",
  "product_photography",
  "screen_capture",
  "documentary",
  "cinematic",
  "illustration",
] as const;

export const VISUAL_CATEGORIES = [
  "creator_lifestyle",
  "workspace",
  "product_closeup",
  "screen_ui",
  "people_talking",
  "hands_and_objects",
  "outdoor",
  "street",
  "home",
  "food_and_drink",
  "fitness",
  "abstract_texture",
] as const;

export const VISUAL_ORIENTATIONS = ["portrait", "square", "landscape"] as const;

export const GENERATED_CONTENT_STATUSES = ["generated", "visual_matched", "used", "archived"] as const;

export type UgcPlatform = (typeof UGC_PLATFORMS)[number];
export type UgcContentFormat = (typeof UGC_CONTENT_FORMATS)[number];
export type UgcContentType = (typeof UGC_CONTENT_TYPES)[number];
export type VisualStyle = (typeof VISUAL_STYLES)[number];
export type VisualCategory = (typeof VISUAL_CATEGORIES)[number];
export type VisualOrientation = (typeof VISUAL_ORIENTATIONS)[number];

// ---------------------------------------------------------------------------
// Normalizers — tolerant alias matching, canonical id out (null when unmappable)
// ---------------------------------------------------------------------------

const slug = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return t || null;
};

const PLATFORM_ALIASES: Record<string, UgcPlatform> = {
  instagram: "instagram",
  insta: "instagram",
  ig: "instagram",
  instagram_reels: "instagram",
  reels: "instagram",
  reel: "instagram",
  tiktok: "tiktok",
  tik_tok: "tiktok",
  linkedin: "linkedin",
  linked_in: "linkedin",
  x: "x",
  twitter: "x",
  youtube_shorts: "youtube_shorts",
  youtube: "youtube_shorts",
  shorts: "youtube_shorts",
  facebook: "facebook",
  fb: "facebook",
};

export function normalizePlatform(v: unknown): UgcPlatform | null {
  const s = slug(v);
  return s ? (PLATFORM_ALIASES[s] ?? null) : null;
}

const FORMAT_ALIASES: Record<string, UgcContentFormat> = {
  wall_of_text_slide: "wall_of_text_slide",
  wall_of_text: "wall_of_text_slide",
  text_slide: "wall_of_text_slide",
  slideshow: "wall_of_text_slide",
  carousel: "wall_of_text_slide",
  video_hook: "video_hook",
  hook: "video_hook",
  hook_demo: "video_hook",
  talking_head: "talking_head",
  talking_head_ugc: "talking_head",
  talkinghead: "talking_head",
  presenter: "talking_head",
  screen_recording: "screen_recording",
  screen_recording_demo: "screen_recording",
  screencast: "screen_recording",
  product_demo: "product_demo",
  demo: "product_demo",
  product_demonstration: "product_demo",
  spokesperson: "spokesperson",
  product_spokesperson: "spokesperson",
  green_screen: "green_screen",
  greenscreen: "green_screen",
  talking_head_green_screen: "green_screen",
  mobile_app: "mobile_app",
  app: "mobile_app",
  clay_motion: "clay_motion",
  claymation: "clay_motion",
  stop_motion: "clay_motion",
  website_demo: "website_demo",
  website: "website_demo",
  meme: "meme",
  ugc_video: "ugc_video",
  ugc: "ugc_video",
};

export function normalizeContentFormat(v: unknown): UgcContentFormat | null {
  const s = slug(v);
  return s ? (FORMAT_ALIASES[s] ?? null) : null;
}

const CONTENT_TYPE_ALIASES: Record<string, UgcContentType> = {
  observation: "observation",
  opinion: "opinion",
  opinionated: "opinion",
  hot_take: "opinion",
  educational: "educational",
  education: "educational",
  how_to: "educational",
  mistake: "mistake",
  mistakes: "mistake",
  story: "story",
  storytelling: "story",
  personal_experience: "story",
  assumption_challenge: "assumption_challenge",
  myth: "assumption_challenge",
  myth_busting: "assumption_challenge",
  contrarian: "assumption_challenge",
  comparison: "comparison",
  versus: "comparison",
  behavior_explainer: "behavior_explainer",
  behavior: "behavior_explainer",
  psychology: "behavior_explainer",
  relatable_situation: "relatable_situation",
  relatable: "relatable_situation",
  use_case_demo: "use_case_demo",
  use_case: "use_case_demo",
  demonstration: "use_case_demo",
  question_answer: "question_answer",
  faq: "question_answer",
  qa: "question_answer",
  surprising_insight: "surprising_insight",
  insight: "surprising_insight",
  objection_handling: "objection_handling",
  objection: "objection_handling",
  practical_lesson: "practical_lesson",
  lesson: "practical_lesson",
  tip: "practical_lesson",
};

export function normalizeContentType(v: unknown): UgcContentType | null {
  const s = slug(v);
  if (!s) return null;
  if (CONTENT_TYPE_ALIASES[s]) return CONTENT_TYPE_ALIASES[s];
  // partial match — models answer with phrases like "common mistakes people make"
  const hit = Object.entries(CONTENT_TYPE_ALIASES).find(([alias]) => s.includes(alias) || alias.includes(s));
  return hit ? hit[1] : null;
}

function normalizeFromList<T extends string>(v: unknown, list: readonly T[], aliases: Record<string, T> = {}): T | null {
  const s = slug(v);
  if (!s) return null;
  if ((list as readonly string[]).includes(s)) return s as T;
  if (aliases[s]) return aliases[s];
  const hit = (list as readonly string[]).find((item) => s.includes(item) || item.includes(s));
  return (hit as T) ?? null;
}

export function normalizeVisualStyle(v: unknown): VisualStyle | null {
  return normalizeFromList<VisualStyle>(v, VISUAL_STYLES, { user_generated: "ugc", photo: "product_photography", ui: "screen_capture" });
}

export function normalizeVisualCategory(v: unknown): VisualCategory | null {
  return normalizeFromList<VisualCategory>(v, VISUAL_CATEGORIES, {
    lifestyle: "creator_lifestyle",
    creator: "creator_lifestyle",
    desk: "workspace",
    office: "workspace",
    product: "product_closeup",
    ui: "screen_ui",
    people: "people_talking",
    nature: "outdoor",
  });
}

export function normalizeVisualOrientation(v: unknown): VisualOrientation | null {
  return normalizeFromList<VisualOrientation>(v, VISUAL_ORIENTATIONS, {
    vertical: "portrait",
    portrait_9_16: "portrait",
    horizontal: "landscape",
    wide: "landscape",
    "1_1": "square",
  });
}

// ---------------------------------------------------------------------------
// Format contract — which canonical fields each format must fill. Used by the
// prompt (tells the model what to write) and by validation (rejects unusable items).
// ---------------------------------------------------------------------------

export const FORMAT_REQUIRED_FIELDS: Record<UgcContentFormat, ("hook" | "body" | "lines" | "script" | "onScreenText")[]> = {  wall_of_text_slide: ["hook", "lines"],
  video_hook: ["hook"],
  talking_head: ["hook", "script"],
  screen_recording: ["hook", "script", "onScreenText"],
  product_demo: ["hook", "script"],
  spokesperson: ["hook", "script"],
  green_screen: ["hook", "script"],
  mobile_app: ["hook", "script"],
  clay_motion: ["hook", "script"],
  website_demo: ["hook", "script"],
  meme: ["hook", "body"], // hook = setup, body = punchline
  ugc_video: ["hook", "script"],
};

// ---------------------------------------------------------------------------
// Visual kind per format — image formats pair with stills, everything else
// pairs with motion. Unknown formats fall back to stills (status quo).
// ---------------------------------------------------------------------------

/** Formats whose visual is a still image; all other formats want video. */
export const IMAGE_CONTENT_FORMATS = ["wall_of_text_slide", "meme"] as const;

export function isVideoContentFormat(format: unknown): boolean {
  return typeof format === "string" && format.length > 0 && !(IMAGE_CONTENT_FORMATS as readonly string[]).includes(format);
}

export const FORMAT_GUIDE: Record<UgcContentFormat, string> = {
  wall_of_text_slide: "hook = first slide line; lines = 4-8 short visually readable lines (never a paragraph)",
  video_hook: "hook = the scroll-stopping first line; body = what happens next in 1-3 sentences",
  talking_head: "hook = opening line spoken to camera; script = 60-180 word spoken script; lines = 3-5 key points",
  screen_recording: "hook = opening line; script = voice-over narration; onScreenText = 2-5 short captions; lines = the steps shown",
  product_demo: "hook = opening line; script = setup → demonstration → benefit, spoken naturally; body = the benefit in one line",
  spokesperson: "hook = opening line; script = what the person says while holding/using the product",
  green_screen: "hook = opening line; script = what the creator says over the background; onScreenText = 1-3 captions",
  mobile_app: "hook = opening line; script = narration while the app is used; lines = the taps/steps shown on screen",
  clay_motion: "hook = opening line; script = narration or character dialogue, playful and simple",
  website_demo: "hook = opening line; script = narration while the site is shown; lines = the steps shown",
  meme: "hook = the setup; body = the punchline; onScreenText = the overlay text",
  ugc_video: "hook = opening line; script = 40-150 word first-person creator script",
};

// ---------------------------------------------------------------------------
// AI output — lenient (models rename fields); coerceCanonicalItem folds the
// format-specific aliases into the canonical shape before strict validation.
// ---------------------------------------------------------------------------

const str = (max: number) => z.string().max(max).nullish();
const strArr = (max = 20, itemMax = 600) => z.array(z.string().max(itemMax)).max(max).nullish();

export const aiUgcItemSchema = z.object({
  hook: str(400),
  title: str(255),
  body: str(8000),
  lines: strArr(20, 500),
  script: str(8000),
  onScreenText: strArr(20, 200),
  cta: str(300),
  // format-specific aliases (spec §7)
  keyPoints: strArr(12, 300),
  steps: strArr(12, 400),
  narration: str(6000),
  setup: str(2000),
  demonstration: str(6000),
  benefit: str(1000),
  punchline: str(500),
  overlayText: str(200),
  optionalCTA: str(300),
  // classification (server-assigned slot wins, but a mismatch is a validation signal)
  contentType: str(64),
  platform: str(64),
  contentFormat: str(64),
  contentAngleId: str(64),
  contentAngleName: str(255),
  perspective: str(300),
  emotionalTrigger: str(200),
  // visual search metadata (spec §8)
  visualTags: strArr(12, 80),
  visualMood: str(200),
  visualStyle: str(80),
  visualCategory: str(80),
  visualOrientation: str(20),
});

export type AiUgcItem = z.infer<typeof aiUgcItemSchema>;

/** Canonical, validated shape of one generated piece (what gets persisted). */
export const canonicalUgcItemSchema = z.object({
  hook: z.string().min(1).max(400),
  title: z.string().min(1).max(255),
  body: z.string().max(8000).nullable(),
  lines: z.array(z.string().min(1).max(500)).max(20),
  script: z.string().max(8000).nullable(),
  onScreenText: z.array(z.string().min(1).max(200)).max(20),
  cta: z.string().max(300).nullable(),
  visualTags: z.array(z.string().min(2).max(80)).min(2).max(12),
  visualMood: z.string().min(1).max(200),
  visualStyle: z.enum(VISUAL_STYLES),
  visualCategory: z.enum(VISUAL_CATEGORIES),
  visualOrientation: z.enum(VISUAL_ORIENTATIONS),
});

export type CanonicalUgcItem = z.infer<typeof canonicalUgcItemSchema>;

/** Fold format-specific aliases into the canonical fields (meme maps setup/punchline). */
export function coerceCanonicalItem(raw: AiUgcItem, format: UgcContentFormat) {
  const pick = (...vals: (string | null | undefined)[]) => {
    for (const v of vals) {
      const t = (v ?? "").trim();
      if (t) return t;
    }
    return "";
  };
  const pickArr = (...vals: (string[] | null | undefined)[]) => {
    for (const v of vals) {
      const clean = (v ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
      if (clean.length) return clean;
    }
    return [] as string[];
  };
  const isMeme = format === "meme";
  return {
    hook: pick(raw.hook, isMeme ? raw.setup : null).slice(0, 400),
    title: pick(raw.title, raw.hook, isMeme ? raw.setup : null).slice(0, 255),
    body: (pick(raw.body, isMeme ? raw.punchline : null, raw.benefit, raw.setup, raw.demonstration) || null)?.slice(0, 8000) ?? null,
    lines: pickArr(raw.lines, raw.keyPoints, raw.steps).slice(0, 20).map((x) => x.slice(0, 500)),
    script: (pick(raw.script, raw.narration, raw.demonstration, isMeme ? raw.punchline : null) || null)?.slice(0, 8000) ?? null,
    onScreenText: pickArr(raw.onScreenText, raw.overlayText ? [raw.overlayText] : null).slice(0, 20).map((x) => x.slice(0, 200)),
    cta: (pick(raw.cta, raw.optionalCTA) || null)?.slice(0, 300) ?? null,
    visualTags: (raw.visualTags ?? []).map((x) => String(x ?? "").trim()).filter((x) => x.length > 1).slice(0, 12).map((x) => x.slice(0, 80)),
    visualMood: pick(raw.visualMood).slice(0, 200),
    visualStyle: raw.visualStyle ?? null,
    visualCategory: raw.visualCategory ?? null,
    visualOrientation: raw.visualOrientation ?? null,
  };
}

// ---------------------------------------------------------------------------
// API schemas (read-only for now — no frontend UI is built in this stage)
// ---------------------------------------------------------------------------

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });
export const errorResponseSchema = z.object({ error: z.string() });

export const generatedContentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  jobId: z.string().nullable(),
  contentAngleId: z.string(),
  platform: z.enum(UGC_PLATFORMS),
  contentFormat: z.enum(UGC_CONTENT_FORMATS),
  contentType: z.enum(UGC_CONTENT_TYPES),
  generationMode: z.string(),
  language: z.string(),
  hook: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  lines: z.array(z.string()),
  script: z.string().nullable(),
  onScreenText: z.array(z.string()),
  cta: z.string().nullable(),
  visualTags: z.array(z.string()),
  visualMood: z.string().nullable(),
  visualStyle: z.string().nullable(),
  visualCategory: z.string().nullable(),
  visualOrientation: z.string(),
  status: z.string(),
  source: z.string(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  visualIntentId: z.string().nullable(),
  visualAssetId: z.string().nullable(),
  usageCount: z.number().int(),
  isEdited: z.boolean(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GeneratedContentDoc = z.infer<typeof generatedContentSchema>;

// "Give me this brand's generated content that has no visual yet" (spec §16)
export const generatedContentListQuerySchema = z.object({
  contentAngleId: z.string().min(1).optional(),
  platform: z.enum(UGC_PLATFORMS).optional(),
  contentFormat: z.enum(UGC_CONTENT_FORMATS).optional(),
  contentType: z.enum(UGC_CONTENT_TYPES).optional(),
  status: z.enum(GENERATED_CONTENT_STATUSES).optional(),
  visualReady: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GeneratedContentListQuery = z.infer<typeof generatedContentListQuerySchema>;

export const generatedContentListResponseSchema = z.object({
  items: z.array(generatedContentSchema),
  total: z.number().int(),
});

export const generationJobStatusSchema = z.object({
  status: z.string(), // none | pending | processing | completed | failed
  type: z.string().nullable(),
  targetCount: z.number().int(),
  generatedCount: z.number().int(),
  savedCount: z.number().int(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const generateContentBodySchema = z.object({
  targetCount: z.number().int().min(1).max(500).optional(),
});

export const generateAcceptedSchema = z.object({
  status: z.string(),
  companyId: z.string(),
  targetCount: z.number().int(),
  savedCount: z.number().int(),
});

/** sqlite stores JSON as text and numbers/booleans as text — parse on read. */
export function parseGeneratedContentRow(row: Record<string, any>): GeneratedContentDoc {
  const jsonArr = (v: unknown): string[] => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(String(v));
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  };
  return {
    id: String(row.id),
    userId: String(row.userId),
    companyId: String(row.companyId),
    jobId: row.jobId ?? null,
    contentAngleId: String(row.contentAngleId),
    platform: row.platform as UgcPlatform,
    contentFormat: row.contentFormat as UgcContentFormat,
    contentType: row.contentType as UgcContentType,
    generationMode: String(row.generationMode ?? "initial"),
    language: String(row.language ?? "en"),
    hook: row.hook ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    lines: jsonArr(row.lines),
    script: row.script ?? null,
    onScreenText: jsonArr(row.onScreenText),
    cta: row.cta ?? null,
    visualTags: jsonArr(row.visualTags),
    visualMood: row.visualMood ?? null,
    visualStyle: row.visualStyle ?? null,
    visualCategory: row.visualCategory ?? null,
    visualOrientation: String(row.visualOrientation ?? "portrait"),
    status: String(row.status ?? "generated"),
    source: String(row.source ?? "ai"),
    model: row.model ?? null,
    promptVersion: row.promptVersion ?? null,
    visualIntentId: row.visualIntentId ?? null,
    visualAssetId: row.visualAssetId ?? null,
    usageCount: Number(row.usageCount ?? 0) || 0,
    isEdited: String(row.isEdited ?? "0") === "1",
    editedAt: row.editedAt ?? null,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? new Date().toISOString()),
  };
}
