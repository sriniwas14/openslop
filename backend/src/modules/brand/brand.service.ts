import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { brandIntelligence, type BrandIntelligence as BrandIntelligenceRow } from "../../db/schema";
import { aiOutputShapeSchema } from "./brand.schemas";
import type {
  Audience,
  BrandCore,
  BrandIntelligenceDoc,
  BrandMetadata,
  Competitor,
  ContentAngle,
  CustomerSegment,
  IdentityAndProduct,
  MarketAndCompetition,
  PurposeAndPositioning,
  ToneAndVoice,
} from "./brand.schemas";

export type SectionKey =
  | "brand"
  | "identityAndProduct"
  | "purposeAndPositioning"
  | "audience"
  | "toneAndVoice"
  | "marketAndCompetition"
  | "contentAngles";

// ---------------------------------------------------------------------------
// Coercion helpers — AI output and user patches are both run through these so
// nothing malformed reaches the DB (spec: never save malformed output).
// ---------------------------------------------------------------------------

const uid = () => crypto.randomUUID();

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = (typeof v === "string" ? v : String(v)).trim();
  return t ? t.slice(0, max) : null;
}
function arr(v: unknown, max = 40, itemMax = 500): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim()))
    .filter((x) => x.length > 0)
    .slice(0, max)
    .map((x) => x.slice(0, itemMax));
}
function num(v: unknown, min: number, max: number, integer = false): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = integer ? Math.round(n) : n;
  return Math.min(max, Math.max(min, r));
}
function bool(v: unknown, def: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v == null) return def;
  if (typeof v === "string") return !["false", "0", "no", ""].includes(v.toLowerCase());
  return Boolean(v);
}
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});

// ---------------------------------------------------------------------------
// Section normalizers (canonical shape; array items always get a stable id)
// ---------------------------------------------------------------------------

export function normBrandCore(raw: unknown): BrandCore {
  const r = obj(raw);
  return {
    name: str(r.name, 255),
    website: str(r.website, 2048),
    tagline: str(r.tagline, 500),
    description: str(r.description, 4000),
    industry: str(r.industry, 255),
    category: str(r.category, 255),
  };
}
export function normIdentity(raw: unknown): IdentityAndProduct {
  const r = obj(raw);
  return {
    coreIdentity: str(r.coreIdentity, 4000),
    productOffering: str(r.productOffering, 4000),
    productFeatures: arr(r.productFeatures),
    productBenefits: arr(r.productBenefits),
    useCases: arr(r.useCases),
    uniqueBenefits: arr(r.uniqueBenefits),
    problemSolution: str(r.problemSolution, 4000),
  };
}
export function normPositioning(raw: unknown): PurposeAndPositioning {
  const r = obj(raw);
  return {
    mission: str(r.mission, 4000),
    vision: str(r.vision, 4000),
    valueProposition: str(r.valueProposition, 4000),
    marketPositioning: str(r.marketPositioning, 4000),
    differentiation: str(r.differentiation, 4000),
    ownedSpace: str(r.ownedSpace, 4000),
  };
}
export function normTone(raw: unknown): ToneAndVoice {
  const r = obj(raw);
  return {
    tone: arr(r.tone),
    personality: arr(r.personality),
    dos: arr(r.dos),
    donts: arr(r.donts),
    wordsToUse: arr(r.wordsToUse),
    wordsToAvoid: arr(r.wordsToAvoid),
    writingStyle: str(r.writingStyle, 4000),
  };
}
export function normSegment(raw: unknown): CustomerSegment {
  const r = obj(raw);
  return {
    id: str(r.id, 64) ?? uid(),
    name: str(r.name, 255) ?? "Untitled segment",
    description: str(r.description, 2000),
    problems: arr(r.problems, 30),
    desires: arr(r.desires, 30),
    objections: arr(r.objections, 30),
    buyingReasons: arr(r.buyingReasons, 30),
    percentage: num(r.percentage, 0, 100),
  };
}
export function normAudience(raw: unknown): Audience {
  const r = obj(raw);
  return {
    primaryAudience: str(r.primaryAudience, 4000),
    customerSegments: Array.isArray(r.customerSegments) ? r.customerSegments.slice(0, 30).map(normSegment) : [],
  };
}
export function normAngle(raw: unknown): ContentAngle {
  const r = obj(raw);
  const name = str(r.name, 255) ?? "Untitled angle";
  return {
    id: str(r.id, 64) ?? uid(),
    name,
    description: str(r.description, 2000) ?? name,
    targetAudience: str(r.targetAudience, 1000),
    problem: str(r.problem, 2000),
    coreMessage: str(r.coreMessage, 2000),
    emotionalTrigger: str(r.emotionalTrigger, 1000),
    hookIdeas: arr(r.hookIdeas, 30),
    contentTypes: arr(r.contentTypes, 20, 100),
    platforms: arr(r.platforms, 20, 100),
    ctaIdeas: arr(r.ctaIdeas, 20, 300),
    priority: num(r.priority, 1, 10, true) ?? 5,
    isActive: bool(r.isActive, true),
  };
}
export function normAngles(raw: unknown): ContentAngle[] {
  return Array.isArray(raw) ? raw.slice(0, 40).map(normAngle) : [];
}
export function normCompetitor(raw: unknown): Competitor {
  const r = obj(raw);
  return {
    id: str(r.id, 64) ?? uid(),
    name: str(r.name, 255) ?? "Competitor",
    positioning: str(r.positioning, 2000),
    strengths: arr(r.strengths, 30),
    weaknesses: arr(r.weaknesses, 30),
  };
}
export function normMarket(raw: unknown): MarketAndCompetition {
  const r = obj(raw);
  return {
    market: str(r.market, 4000),
    competitors: Array.isArray(r.competitors) ? r.competitors.slice(0, 30).map(normCompetitor) : [],
    marketTrends: arr(r.marketTrends),
  };
}
export function normMetadata(raw: unknown): BrandMetadata {
  const r = obj(raw);
  return {
    source: str(r.source, 255) ?? "website+ai",
    lastAnalyzedAt: str(r.lastAnalyzedAt, 64),
    lastUpdatedAt: str(r.lastUpdatedAt, 64),
    version: num(r.version, 0, 1_000_000, true) ?? 1,
    editedSections: arr(r.editedSections, 20, 64),
    editedAngles: arr(r.editedAngles, 200, 64),
    editedSegments: arr(r.editedSegments, 200, 64),
  };
}

export type NormalizedAnalysis = {
  brand: BrandCore;
  identityAndProduct: IdentityAndProduct;
  purposeAndPositioning: PurposeAndPositioning;
  audience: Audience;
  toneAndVoice: ToneAndVoice;
  contentAngles: ContentAngle[];
  marketAndCompetition: MarketAndCompetition;
};

/** Models sometimes wrap JSON in prose/fences — extract the first {...} block. */
export function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI response contained no JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Validate + normalize raw AI JSON. Throws on structurally malformed / empty output. */
export function normalizeAiOutput(raw: unknown): NormalizedAnalysis {
  const parsed = aiOutputShapeSchema.parse(obj(raw));
  const out: NormalizedAnalysis = {
    brand: normBrandCore(parsed.brand),
    identityAndProduct: normIdentity(parsed.identityAndProduct),
    purposeAndPositioning: normPositioning(parsed.purposeAndPositioning),
    audience: normAudience(parsed.audience),
    toneAndVoice: normTone(parsed.toneAndVoice),
    contentAngles: normAngles(parsed.contentAngles),
    marketAndCompetition: normMarket(parsed.marketAndCompetition),
  };
  const hasSignal = !!(
    out.brand.name ||
    out.brand.description ||
    out.identityAndProduct.productOffering ||
    out.contentAngles.length
  );
  if (!hasSignal) throw new Error("AI returned an empty brand profile — nothing verifiable to save");
  return out;
}

// ---------------------------------------------------------------------------
// Row <-> doc
// ---------------------------------------------------------------------------

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function emptyDoc(userId: string, companyId: string): BrandIntelligenceDoc {
  return {
    id: "",
    userId,
    companyId,
    status: "pending",
    error: null,
    brand: normBrandCore({}),
    identityAndProduct: normIdentity({}),
    purposeAndPositioning: normPositioning({}),
    audience: normAudience({}),
    toneAndVoice: normTone({}),
    contentAngles: [],
    marketAndCompetition: normMarket({}),
    metadata: normMetadata({}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function toDoc(row: BrandIntelligenceRow): BrandIntelligenceDoc {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    status: row.status,
    error: row.error ?? null,
    brand: normBrandCore(parseJson(row.brand)),
    identityAndProduct: normIdentity(parseJson(row.identityAndProduct)),
    purposeAndPositioning: normPositioning(parseJson(row.purposeAndPositioning)),
    audience: normAudience(parseJson(row.audience)),
    toneAndVoice: normTone(parseJson(row.toneAndVoice)),
    contentAngles: normAngles(parseJson(row.contentAngles)),
    marketAndCompetition: normMarket(parseJson(row.marketAndCompetition)),
    metadata: normMetadata(parseJson(row.metadata)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columns(doc: BrandIntelligenceDoc) {
  return {
    status: doc.status,
    error: doc.error,
    brand: JSON.stringify(doc.brand),
    identityAndProduct: JSON.stringify(doc.identityAndProduct),
    purposeAndPositioning: JSON.stringify(doc.purposeAndPositioning),
    audience: JSON.stringify(doc.audience),
    toneAndVoice: JSON.stringify(doc.toneAndVoice),
    contentAngles: JSON.stringify(doc.contentAngles),
    marketAndCompetition: JSON.stringify(doc.marketAndCompetition),
    metadata: JSON.stringify(doc.metadata),
    updatedAt: new Date().toISOString(),
  };
}

export async function getRow(companyId: string, userId: string): Promise<BrandIntelligenceRow | null> {
  const [row] = await db
    .select()
    .from(brandIntelligence)
    .where(and(eq(brandIntelligence.companyId, companyId), eq(brandIntelligence.userId, userId)));
  return row ?? null;
}

export async function getDoc(companyId: string, userId: string): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  return row ? toDoc(row) : null;
}

async function persist(id: string, doc: BrandIntelligenceDoc): Promise<BrandIntelligenceDoc> {
  const [row] = await db.update(brandIntelligence).set(columns(doc)).where(eq(brandIntelligence.id, id)).returning();
  return toDoc(row);
}

// ---------------------------------------------------------------------------
// Metadata edit-tracking (re-analysis must never silently drop user edits)
// ---------------------------------------------------------------------------

function touch(
  md: BrandMetadata,
  opts: { section?: SectionKey; angleId?: string; segmentId?: string; analyzed?: boolean } = {},
): BrandMetadata {
  const now = new Date().toISOString();
  const editedSections = new Set(md.editedSections ?? []);
  const editedAngles = new Set(md.editedAngles ?? []);
  const editedSegments = new Set(md.editedSegments ?? []);
  if (opts.section) editedSections.add(opts.section);
  if (opts.angleId) editedAngles.add(opts.angleId);
  if (opts.segmentId) editedSegments.add(opts.segmentId);
  return {
    ...md,
    source: md.source ?? "website+ai",
    lastAnalyzedAt: opts.analyzed ? now : (md.lastAnalyzedAt ?? null),
    lastUpdatedAt: now,
    version: (md.version ?? 1) + 1,
    editedSections: [...editedSections],
    editedAngles: [...editedAngles],
    editedSegments: [...editedSegments],
  };
}

// ---------------------------------------------------------------------------
// Analysis persistence (create or re-analyze with edit preservation)
// ---------------------------------------------------------------------------

function mergeByEditedId<T extends { id: string; name: string }>(existing: T[], fresh: T[], editedIds: string[]): T[] {
  const preserved = existing.filter((x) => editedIds.includes(x.id));
  const names = new Set(preserved.map((x) => x.name.toLowerCase()));
  const freshKept = fresh.filter((x) => !names.has(x.name.toLowerCase()));
  return [...preserved, ...freshKept];
}

export function mergeForReanalyze(existing: BrandIntelligenceDoc | null, fresh: NormalizedAnalysis): NormalizedAnalysis & { metadata: BrandMetadata } {
  const md = existing?.metadata ?? normMetadata({});
  const editedSections = new Set(md.editedSections ?? []);
  const keep = <K extends keyof NormalizedAnalysis>(key: K) => (existing && editedSections.has(key as string) ? existing[key] : fresh[key]);

  let audience: Audience;
  if (existing && editedSections.has("audience")) {
    audience = existing.audience;
  } else {
    audience = {
      primaryAudience: fresh.audience.primaryAudience,
      customerSegments: mergeByEditedId(existing?.audience.customerSegments ?? [], fresh.audience.customerSegments ?? [], md.editedSegments ?? []).slice(0, 30),
    };
  }

  let contentAngles: ContentAngle[];
  if (existing && editedSections.has("contentAngles")) {
    contentAngles = existing.contentAngles;
  } else {
    contentAngles = mergeByEditedId(existing?.contentAngles ?? [], fresh.contentAngles, md.editedAngles ?? []).slice(0, 40);
  }

  return {
    brand: keep("brand") as BrandCore,
    identityAndProduct: keep("identityAndProduct") as IdentityAndProduct,
    purposeAndPositioning: keep("purposeAndPositioning") as PurposeAndPositioning,
    audience,
    toneAndVoice: keep("toneAndVoice") as ToneAndVoice,
    contentAngles,
    marketAndCompetition: keep("marketAndCompetition") as MarketAndCompetition,
    metadata: { ...touch(md, { analyzed: true }), version: (md.version ?? 0) + 1 },
  };
}

export async function saveAnalysis(userId: string, companyId: string, fresh: NormalizedAnalysis): Promise<BrandIntelligenceDoc> {
  const existingRow = await getRow(companyId, userId);
  const merged = mergeForReanalyze(existingRow ? toDoc(existingRow) : null, fresh);
  if (existingRow) {
    const doc: BrandIntelligenceDoc = { ...toDoc(existingRow), ...merged, status: "ready", error: null };
    return persist(existingRow.id, doc);
  }
  const base = emptyDoc(userId, companyId);
  const [row] = await db
    .insert(brandIntelligence)
    .values({ userId, companyId, ...columns({ ...base, ...merged, status: "ready", error: null }) })
    .returning();
  return toDoc(row);
}

export async function markStatus(companyId: string, userId: string, status: string, error: string | null): Promise<void> {
  const row = await getRow(companyId, userId);
  if (row) await db.update(brandIntelligence).set({ status, error, updatedAt: new Date().toISOString() }).where(eq(brandIntelligence.id, row.id));
}

// ---------------------------------------------------------------------------
// Background analysis (decoupled from the HTTP request so the user can navigate
// away without cancelling the run — the previous SSE approach broke the workflow
// on client disconnect, leaving no row and a permanent "not generated yet" 404).
// ---------------------------------------------------------------------------

/**
 * Ensure a row exists and mark it "analyzing" BEFORE the workflow starts, so GET/status
 * never 404s mid-analysis and the analyzing state survives client navigation / refresh.
 * Creates the row on first analysis (id/createdAt filled by Drizzle column defaults).
 */
export async function ensureAnalyzingRow(companyId: string, userId: string): Promise<BrandIntelligenceDoc> {
  const row = await getRow(companyId, userId);
  if (row) {
    const [updated] = await db
      .update(brandIntelligence)
      .set({ status: "analyzing", error: null, updatedAt: new Date().toISOString() })
      .where(eq(brandIntelligence.id, row.id))
      .returning();
    return toDoc(updated);
  }
  const base = emptyDoc(userId, companyId);
  const [inserted] = await db
    .insert(brandIntelligence)
    .values({ userId, companyId, ...columns({ ...base, status: "analyzing", error: null }) })
    .returning();
  return toDoc(inserted);
}

/** Lightweight status for polling (no full document). status "none" when no row exists. */
export async function getStatus(
  companyId: string,
  userId: string,
): Promise<{ status: string; error: string | null; updatedAt: string | null }> {
  const row = await getRow(companyId, userId);
  if (!row) return { status: "none", error: null, updatedAt: null };
  return { status: row.status, error: row.error ?? null, updatedAt: row.updatedAt ?? null };
}

/** True when a row is stuck in "analyzing" longer than maxAgeMs (e.g. the server restarted mid-run). */
export function isStaleAnalyzing(status: string, updatedAt: string | null, maxAgeMs = 5 * 60 * 1000): boolean {
  if (status !== "analyzing" || !updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && Date.now() - t > maxAgeMs;
}

/**
 * Run the brand-intelligence workflow to completion in the BACKGROUND. Called
 * fire-and-forget by the route; never throws (all failures are persisted as status
 * "failed" with a readable reason). persistStep saves the doc (status -> "ready").
 */
export async function runBrandAnalysis(input: {
  companyId: string;
  userId: string;
  name: string;
  website: string;
  extra: string | null;
}): Promise<void> {
  const { companyId, userId } = input;
  try {
    const { brandIntelligenceWorkflow } = await import("./brand.workflow");
    const run = await brandIntelligenceWorkflow.createRun();
    const stream = run.stream({
      inputData: { companyId, userId, name: input.name, website: input.website, extra: input.extra },
    });
    // Drain the stream in the background — this drives fetch -> analyze -> persist to completion.
    for await (const _evt of (stream as any).fullStream ?? stream) {
      /* no client attached; progress is intentionally discarded */
    }
    await (stream as any).result; // rejects if the workflow failed
    const doc = await getDoc(companyId, userId);
    if (!doc || doc.status !== "ready") {
      const message = doc?.error ?? "Brand analysis failed — check the website URL and your AI provider, then try again.";
      await markStatus(companyId, userId, "failed", message);
    } else if (doc.contentAngles.length) {
      // ponytail: Brand Intelligence + content angles are ready → fill the content library
      // automatically. Fire-and-forget on purpose: generation is its own background job with
      // its own status row, so a slow or failed run can never fail (or delay) the analysis.
      const { maybeStartContentGeneration } = await import("../ugc/ugc.service");
      void maybeStartContentGeneration({ companyId, userId }).catch(() => {});
    }
  } catch (e: any) {
    const message = e?.message ?? String(e);
    await markStatus(companyId, userId, "failed", message).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Section + item mutations (each bumps metadata + updatedAt)
// ---------------------------------------------------------------------------

const SECTION_NORMALIZERS: Record<SectionKey, (v: unknown) => unknown> = {
  brand: normBrandCore,
  identityAndProduct: normIdentity,
  purposeAndPositioning: normPositioning,
  audience: normAudience,
  toneAndVoice: normTone,
  marketAndCompetition: normMarket,
  contentAngles: normAngles,
};

export async function updateSection(companyId: string, userId: string, section: SectionKey, value: unknown): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  (doc as any)[section] = SECTION_NORMALIZERS[section](value);
  doc.metadata = touch(doc.metadata, { section });
  doc.error = null;
  return persist(row.id, doc);
}

/** Apply several sections in one write (whole-document PATCH); each provided section is marked edited. */
export async function updateSections(
  companyId: string,
  userId: string,
  patch: Partial<Record<SectionKey, unknown>>,
): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  let md = doc.metadata;
  for (const [key, value] of Object.entries(patch)) {
    const section = key as SectionKey;
    if (value === undefined || !(section in SECTION_NORMALIZERS)) continue;
    (doc as any)[section] = SECTION_NORMALIZERS[section](value);
    md = touch(md, { section });
  }
  doc.metadata = md;
  doc.error = null;
  return persist(row.id, doc);
}

export async function addContentAngle(companyId: string, userId: string, input: unknown): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const angle = normAngle(input);
  doc.contentAngles = [...doc.contentAngles, angle].slice(0, 40);
  doc.metadata = touch(doc.metadata, { angleId: angle.id });
  return persist(row.id, doc);
}

export async function updateContentAngle(companyId: string, userId: string, angleId: string, patch: unknown): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const i = doc.contentAngles.findIndex((a) => a.id === angleId);
  if (i === -1) return null;
  doc.contentAngles[i] = normAngle({ ...doc.contentAngles[i], ...obj(patch), id: angleId });
  doc.metadata = touch(doc.metadata, { angleId });
  return persist(row.id, doc);
}

export async function deleteContentAngle(companyId: string, userId: string, angleId: string): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const before = doc.contentAngles.length;
  doc.contentAngles = doc.contentAngles.filter((a) => a.id !== angleId);
  if (doc.contentAngles.length === before) return null;
  doc.metadata = touch(doc.metadata, {});
  return persist(row.id, doc);
}

export async function addSegment(companyId: string, userId: string, input: unknown): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const seg = normSegment(input);
  doc.audience.customerSegments = [...(doc.audience.customerSegments ?? []), seg].slice(0, 30);
  doc.metadata = touch(doc.metadata, { segmentId: seg.id });
  return persist(row.id, doc);
}

export async function updateSegment(companyId: string, userId: string, segmentId: string, patch: unknown): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const segs = doc.audience.customerSegments ?? [];
  const i = segs.findIndex((s) => s.id === segmentId);
  if (i === -1) return null;
  segs[i] = normSegment({ ...segs[i], ...obj(patch), id: segmentId });
  doc.metadata = touch(doc.metadata, { segmentId });
  return persist(row.id, doc);
}

export async function deleteSegment(companyId: string, userId: string, segmentId: string): Promise<BrandIntelligenceDoc | null> {
  const row = await getRow(companyId, userId);
  if (!row) return null;
  const doc = toDoc(row);
  const segs = doc.audience.customerSegments ?? [];
  const next = segs.filter((s) => s.id !== segmentId);
  if (next.length === segs.length) return null;
  doc.audience.customerSegments = next;
  doc.metadata = touch(doc.metadata, {});
  return persist(row.id, doc);
}

// ---------------------------------------------------------------------------
// getBrandContext — the single source of truth for UGC generation.
// Returns a clean, prompt-ready view; null when no Brand Brain exists yet so
// callers can fall back to the legacy company.persona.
// ---------------------------------------------------------------------------

export type BrandContext = {
  name: string | null;
  website: string | null;
  tagline: string | null;
  description: string | null;
  industry: string | null;
  category: string | null;
  identity: IdentityAndProduct;
  positioning: PurposeAndPositioning;
  audience: Audience;
  tone: ToneAndVoice;
  contentAngles: ContentAngle[];
  market: MarketAndCompetition;
  version: number | null;
  lastAnalyzedAt: string | null;
};

export async function getBrandContext(companyId: string, userId: string): Promise<BrandContext | null> {
  const doc = await getDoc(companyId, userId);
  if (!doc || doc.status !== "ready") return null;
  return {
    name: doc.brand.name ?? null,
    website: doc.brand.website ?? null,
    tagline: doc.brand.tagline ?? null,
    description: doc.brand.description ?? null,
    industry: doc.brand.industry ?? null,
    category: doc.brand.category ?? null,
    identity: doc.identityAndProduct,
    positioning: doc.purposeAndPositioning,
    audience: doc.audience,
    tone: doc.toneAndVoice,
    // only active angles feed generation
    contentAngles: doc.contentAngles.filter((a) => a.isActive !== false),
    market: doc.marketAndCompetition,
    version: doc.metadata.version ?? null,
    lastAnalyzedAt: doc.metadata.lastAnalyzedAt ?? null,
  };
}

const line = (label: string, value: string | null | undefined) => (value && value.trim() ? `${label}: ${value.trim()}` : null);
const list = (label: string, items: (string | null | undefined)[] | null | undefined) => {
  const clean = (items ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  return clean.length ? `${label}: ${clean.join("; ")}` : null;
};

/** Render a BrandContext into a compact text block for AI prompts (capped). */
export function buildBrandContextPrompt(ctx: BrandContext, maxChars = 12000): string {
  const out: string[] = [];
  out.push(
    [
      line("Brand", ctx.name ?? undefined),
      ctx.industry || ctx.category ? line("Category", [ctx.industry, ctx.category].filter(Boolean).join(" / ")) : null,
      line("Website", ctx.website ?? undefined),
      line("Tagline", ctx.tagline ?? undefined),
      line("Description", ctx.description ?? undefined),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const id = ctx.identity;
  out.push(
    [
      line("Core identity", id.coreIdentity ?? undefined),
      line("Product offering", id.productOffering ?? undefined),
      list("Product features", id.productFeatures ?? undefined),
      list("Product benefits", id.productBenefits ?? undefined),
      list("Use cases", id.useCases ?? undefined),
      list("Unique benefits", id.uniqueBenefits ?? undefined),
      line("Problem solved", id.problemSolution ?? undefined),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const p = ctx.positioning;
  out.push(
    [
      line("Mission", p.mission ?? undefined),
      line("Vision", p.vision ?? undefined),
      line("Value proposition", p.valueProposition ?? undefined),
      line("Market positioning", p.marketPositioning ?? undefined),
      line("Differentiation", p.differentiation ?? undefined),
      line("Owned space", p.ownedSpace ?? undefined),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const a = ctx.audience;
  const segLines = (a.customerSegments ?? []).map((s) => {
    const bits = [
      s.percentage != null ? `${s.percentage}%` : null,
      list("problems", s.problems) ?? undefined,
      list("desires", s.desires) ?? undefined,
      list("objections", s.objections) ?? undefined,
      list("buying reasons", s.buyingReasons) ?? undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    return `- ${s.name}${bits ? ` (${bits})` : ""}`;
  });
  out.push([line("Primary audience", a.primaryAudience ?? undefined), segLines.length ? `Segments:\n${segLines.join("\n")}` : null].filter(Boolean).join("\n"));

  const t = ctx.tone;
  out.push(
    [
      list("Tone", t.tone ?? undefined),
      list("Personality", t.personality ?? undefined),
      list("Do", t.dos ?? undefined),
      list("Don't", t.donts ?? undefined),
      list("Use words", t.wordsToUse ?? undefined),
      list("Avoid words", t.wordsToAvoid ?? undefined),
      line("Writing style", t.writingStyle ?? undefined),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (ctx.contentAngles.length) {
    const angles = ctx.contentAngles
      .slice(0, 20)
      .map((ang) =>
        [
          `- ${ang.name}: ${ang.description}`,
          list("audience", [ang.targetAudience]) ?? undefined,
          list("problem", [ang.problem]) ?? undefined,
          list("message", [ang.coreMessage]) ?? undefined,
          list("hooks", ang.hookIdeas) ?? undefined,
          list("platforms", ang.platforms) ?? undefined,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    out.push(`Content angles:\n${angles.join("\n")}`);
  }

  const m = ctx.market;
  const compLines = (m.competitors ?? []).map((c) => `- ${c.name}: ${[c.positioning, list("strengths", c.strengths), list("weaknesses", c.weaknesses)].filter(Boolean).join(" · ")}`);
  out.push([line("Market", m.market ?? undefined), compLines.length ? `Competitors:\n${compLines.join("\n")}` : null, list("Market trends", m.marketTrends ?? undefined)].filter(Boolean).join("\n"));

  return out
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maxChars);
}
