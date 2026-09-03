import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { companies, generatedContents, visualAssets, visualFeedDaily, visualSearchBatches } from "../../db/schema";
import { parseGeneratedContentRow, type GeneratedContentDoc } from "../ugc/ugc.schemas";
import { buildVisualQueries, refineVisualQueries, type VisualQueryMeta } from "./visual.queries";
import {
  MIN_RELEVANCE_THRESHOLD,
  VisualCandidateScorer,
  desiredOrientation,
  selectBestVisual,
  type ScoredCandidate,
} from "./visual.scorer";
import { PexelsError, searchPexelsPhotos, searchPexelsVideos, type VisualCandidate } from "./pexels.service";
import {
  FEED_BATCH_SIZE,
  FEED_DAILY_LIMIT,
  parseVisualAssetRow,
  type ContentFeedResponse,
  type FeedItem,
  type VisualAssetDoc,
} from "./visual.schemas";

// ---------------------------------------------------------------------------
// Visual discovery + background prefetching.
//
// Takes a brand's ALREADY-generated content and pairs each post with the best Pexels
// visual, in Instagram/Reels-sized batches of 5. Completely independent of Trending
// Topics → Generate UGC. The feed endpoint returns content + current visual state
// immediately and kicks off visual search in the background, so the client prefetches
// the next batch (around item 3) and the visuals are ready before the user arrives.
//
// brandId === companyId. Ownership is enforced through the parent company row, exactly
// like ugc.routes / instagram.service.
// ---------------------------------------------------------------------------

const PROCESS_CONCURRENCY = 2; // items searched in parallel within one batch
const STALE_BATCH_MS = 10 * 60 * 1000; // a "processing" batch older than this can be resumed

export class VisualFeedError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "VisualFeedError";
  }
}

/** Injectable so tests never hit Pexels or the network. */
export type VisualSearcher = (args: { queries: string[]; meta: VisualQueryMeta }) => Promise<VisualCandidate[]>;
export type AssetCacher = (candidate: VisualCandidate) => Promise<string | null>;

export type VisualFeedDeps = {
  searcher?: VisualSearcher;
  cacheFn?: AssetCacher | null; // null disables local caching (tests / no-disk)
  concurrency?: number;
  threshold?: number;
  dailyLimit?: number;
  autoProcess?: boolean; // getContentFeed kicks off background processing (default true)
  now?: () => Date;
};

// ---------------------------------------------------------------------------
// Date + cursor helpers (pure, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Feed "day" key (YYYY-MM-DD). The app has no per-user timezone model and stores UTC ISO
 * timestamps everywhere, so this centralizes the day boundary in one swappable place.
 */
export function feedDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type Cursor = { createdAt: string; id: string };

export function encodeCursor(row: { createdAt: string; id: string }): string {
  const json = JSON.stringify({ c: row.createdAt, i: row.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(cursor?: string | null): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const createdAt = String(parsed?.c ?? "");
    const id = String(parsed?.i ?? "");
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null; // an invalid cursor is treated as "start" rather than a 400
  }
}

function rowToQueryMeta(row: any): VisualQueryMeta {
  const tags = (() => {
    try {
      const parsed = JSON.parse(String(row.visualTags ?? "[]"));
      return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
    } catch {
      return [] as string[];
    }
  })();
  return {
    visualTags: tags,
    visualMood: row.visualMood ?? null,
    visualStyle: row.visualStyle ?? null,
    visualCategory: row.visualCategory ?? null,
    visualOrientation: row.visualOrientation ?? null,
    platform: row.platform ?? null,
    contentFormat: row.contentFormat ?? null,
    contentType: row.contentType ?? null,
  };
}

// ---------------------------------------------------------------------------
// Default Pexels searcher + best-effort local cache (reuse /media/files storage)
// ---------------------------------------------------------------------------

export const pexelsVisualSearcher: VisualSearcher = async ({ queries, meta }) => {
  const orientation = desiredOrientation(meta);
  // Video-kind formats search motion, image formats search stills — same
  // request count either way, so Pexels spend per post is unchanged.
  const { isVideoContentFormat } = await import("../ugc/ugc.schemas");
  const useVideo = isVideoContentFormat(meta.contentFormat);
  const all: VisualCandidate[] = [];
  for (let i = 0; i < queries.length; i++) {
    try {
      const found = useVideo
        ? await searchPexelsVideos({ query: queries[i], orientation, perPage: 24, queryIndex: i })
        : await searchPexelsPhotos({ query: queries[i], orientation, perPage: 24, queryIndex: i });
      all.push(...found);
    } catch (e) {
      // a hard failure on the first query (e.g. missing key) aborts the item;
      // later queries failing just means a smaller pool, which is still usable.
      if (i === 0) throw e;
    }
  }
  return all;
};

/** Skip local caching for video files above this — the remote CDN URLs still play. */
export const MAX_VIDEO_CACHE_BYTES = 60 * 1024 * 1024;

/** Download the SELECTED asset only (never every candidate) into /media/files. Best-effort. */
export const cacheSelectedAsset: AssetCacher = async (candidate) => {
  try {
    const url = candidate.previewUrl;
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const isVideo = (candidate as VisualCandidate).mediaType === "video";
    const res = await fetch(url);
    if (!res.ok) return null;
    // Oversized video files stay remote — downloading gigabytes per batch
    // would fill the disk; the CDN link remains playable.
    const contentLength = Number(res.headers.get("content-length"));
    if (isVideo && Number.isFinite(contentLength) && contentLength > MAX_VIDEO_CACHE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (isVideo && buf.length > MAX_VIDEO_CACHE_BYTES) return null;
    const path = await import("node:path");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = path.join(process.cwd(), "data", "media");
    await mkdir(dir, { recursive: true });
    const extMatch = url.split("?")[0].match(/\.(jpe?g|png|webp|mp4|mov|webm)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : isVideo ? "mp4" : "jpg";
    const filename = `visual_${candidate.sourceAssetId}_${Date.now()}.${ext}`;
    await writeFile(path.join(dir, filename), buf);
    return `/media/files/${filename}`;
  } catch {
    return null; // remote URLs remain on the asset; caching is an optimization, not a requirement
  }
};

// ---------------------------------------------------------------------------
// Daily-state bookkeeping — caps preparation at dailyLimit items per brand per day.
// Sequential per-company processing (inFlightCompanies) keeps read-modify-write safe.
// ---------------------------------------------------------------------------

export type DailyState = { preparedCount: number; dailyLimit: number; status: string };

async function getDailyState(companyId: string, date: string, dailyLimit: number): Promise<DailyState> {
  const [row] = await db.select().from(visualFeedDaily).where(and(eq(visualFeedDaily.companyId, companyId), eq(visualFeedDaily.date, date)));
  if (!row) return { preparedCount: 0, dailyLimit, status: "active" };
  return {
    preparedCount: Number(row.preparedCount ?? 0) || 0,
    dailyLimit: Number(row.dailyLimit ?? dailyLimit) || dailyLimit,
    status: String(row.status ?? "active"),
  };
}

async function bumpPrepared(companyId: string, userId: string, date: string, by: number, dailyLimit: number): Promise<DailyState> {
  const [row] = await db.select().from(visualFeedDaily).where(and(eq(visualFeedDaily.companyId, companyId), eq(visualFeedDaily.date, date)));
  const preparedCount = (Number(row?.preparedCount ?? 0) || 0) + by;
  const status = preparedCount >= dailyLimit ? "completed" : "active";
  const now = new Date().toISOString();
  if (row) {
    await db
      .update(visualFeedDaily)
      .set({ preparedCount: String(preparedCount), dailyLimit: String(dailyLimit), status, updatedAt: now } as any)
      .where(and(eq(visualFeedDaily.companyId, companyId), eq(visualFeedDaily.date, date)));
  } else {
    await db
      .insert(visualFeedDaily)
      .values({ companyId, date, userId, preparedCount: String(preparedCount), dailyLimit: String(dailyLimit), status, createdAt: now, updatedAt: now } as any)
      .onConflictDoNothing();
  }
  return { preparedCount, dailyLimit, status };
}

// ---------------------------------------------------------------------------
// VisualAsset persistence — dedup on (source, sourceAssetId) so retries never duplicate.
// ---------------------------------------------------------------------------

async function persistVisualAsset(input: {
  best: ScoredCandidate;
  userId: string;
  companyId: string;
  queries: string[];
  cacheFn?: AssetCacher | null;
}): Promise<string> {
  const { best, userId, companyId, queries, cacheFn } = input;
  const c = best.candidate;

  const [existing] = await db.select().from(visualAssets).where(and(eq(visualAssets.source, c.source), eq(visualAssets.sourceAssetId, c.sourceAssetId)));
  if (existing) return existing.id; // reuse the same Pexels photo if selected again

  let localUrl: string | null = null;
  if (cacheFn) {
    try {
      localUrl = await cacheFn(c);
    } catch {
      localUrl = null;
    }
  }

  const now = new Date().toISOString();
  const metadata = JSON.stringify({
    photographer: c.photographer,
    avgColor: c.avgColor,
    score: best.score,
    breakdown: best.breakdown,
    matchedQuery: c.query,
    queries,
    mediaType: c.mediaType ?? "image",
    duration: c.duration ?? null,
    posterUrl: c.posterUrl ?? null,
  });
  const [row] = await db
    .insert(visualAssets)
    .values({
      userId,
      companyId,
      source: c.source,
      sourceAssetId: c.sourceAssetId,
      sourceUrl: c.sourceUrl,
      previewUrl: c.previewUrl,
      downloadUrl: c.downloadUrl,
      localUrl,
      width: String(c.width),
      height: String(c.height),
      orientation: c.orientation,
      altText: c.altText,
      tags: JSON.stringify(c.tags),
      metadata,
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoNothing()
    .returning();
  if (row) return row.id;
  const [raced] = await db.select().from(visualAssets).where(and(eq(visualAssets.source, c.source), eq(visualAssets.sourceAssetId, c.sourceAssetId)));
  return raced?.id ?? "";
}

async function setContentVisual(contentId: string, patch: Record<string, unknown>) {
  await db
    .update(generatedContents)
    .set({ ...patch, updatedAt: new Date().toISOString() } as any)
    .where(eq(generatedContents.id, contentId));
}

// ---------------------------------------------------------------------------
// Per-item visual search — one content row → matched | needs_review | failed.
// Returns whether the daily counter should advance (a completed search attempt).
// ---------------------------------------------------------------------------

const scorer = new VisualCandidateScorer();

type ItemOutcome = { status: "matched" | "needs_review" | "failed"; counted: boolean };

async function searchVisualForContent(input: {
  row: any;
  userId: string;
  companyId: string;
  deps: VisualFeedDeps;
}): Promise<ItemOutcome> {
  const { row, userId, companyId, deps } = input;
  const searcher = deps.searcher ?? pexelsVisualSearcher;
  const threshold = deps.threshold ?? MIN_RELEVANCE_THRESHOLD;
  const meta = rowToQueryMeta(row);

  await setContentVisual(row.id, { visualSearchStatus: "searching", visualSearchError: null });

  try {
    const queries = buildVisualQueries(meta);
    let candidates = await searcher({ queries, meta });
    let best = selectBestVisual(candidates, meta, queries, threshold, scorer);

    if (!best) {
      // refined retry: broaden the queries once and merge the new pool
      const refined = refineVisualQueries(meta, queries);
      if (refined.length) {
        const more = await searcher({ queries: refined, meta });
        candidates = [...candidates, ...more];
        best = selectBestVisual(candidates, meta, [...queries, ...refined], threshold, scorer);
      }
    }

    if (best) {
      const assetId = await persistVisualAsset({ best, userId, companyId, queries, cacheFn: deps.cacheFn ?? cacheSelectedAsset });
      await setContentVisual(row.id, { visualAssetId: assetId, visualSearchStatus: "matched", status: "visual_matched", visualSearchError: null });
      return { status: "matched", counted: true };
    }

    await setContentVisual(row.id, { visualSearchStatus: "needs_review", visualSearchError: "no candidate met the relevance threshold" });
    return { status: "needs_review", counted: true };
  } catch (e: any) {
    const message = String(e?.message ?? e).slice(0, 500);
    // a missing key is a config problem, not a consumed request — don't burn daily quota on it
    const counted = !(e instanceof PexelsError && e.status === 500);
    await setContentVisual(row.id, { visualSearchStatus: "failed", visualSearchError: message });
    return { status: "failed", counted };
  }
}

// ---------------------------------------------------------------------------
// Batch processing — sequential per company, limited concurrency within a batch.
// ---------------------------------------------------------------------------

const inFlightBatches = new Set<string>();
const inFlightCompanies = new Set<string>();

function isStaleBatch(status: string, updatedAt: string | null, maxAgeMs = STALE_BATCH_MS): boolean {
  if (status !== "processing" || !updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && Date.now() - t > maxAgeMs;
}

async function touchBatch(batchId: string, patch: Record<string, unknown>) {
  await db
    .update(visualSearchBatches)
    .set({ ...patch, updatedAt: new Date().toISOString() } as any)
    .where(eq(visualSearchBatches.id, batchId));
}

/** Look up a batch by its cursor key (used by the feed + tests). */
export async function getBatchByCursor(companyId: string, date: string, cursorKey: string) {
  const [row] = await db
    .select()
    .from(visualSearchBatches)
    .where(and(eq(visualSearchBatches.companyId, companyId), eq(visualSearchBatches.date, date), eq(visualSearchBatches.cursorKey, cursorKey)));
  return row ?? null;
}

/**
 * Process every not-yet-matched item in a batch. Idempotent: already matched/needs_review
 * items are skipped, one failed item never blocks the rest, and the daily limit stops
 * further Pexels work. Safe to re-run (worker resume / failed-item retry).
 */
export async function processBatchVisualSearch(batchId: string, deps: VisualFeedDeps = {}): Promise<void> {
  if (inFlightBatches.has(batchId)) return;
  const [batch] = await db.select().from(visualSearchBatches).where(eq(visualSearchBatches.id, batchId));
  if (!batch) return;
  if (batch.status === "ready") return;

  const companyId = batch.companyId;
  const userId = batch.userId;
  const dailyLimit = deps.dailyLimit ?? FEED_DAILY_LIMIT;

  // one batch per company at a time → keeps the daily counter and Pexels throttle sane.
  // A concurrent request leaves this batch "pending" and the worker picks it up shortly.
  if (inFlightCompanies.has(companyId)) return;

  inFlightBatches.add(batchId);
  inFlightCompanies.add(companyId);
  try {
    await touchBatch(batchId, { status: "processing", error: null });

    const contentIds: string[] = (() => {
      try {
        const parsed = JSON.parse(String(batch.contentIds ?? "[]"));
        return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
      } catch {
        return [];
      }
    })();
    if (!contentIds.length) {
      await touchBatch(batchId, { status: "ready", size: "0" });
      return;
    }

    const rows = await db.select().from(generatedContents).where(and(eq(generatedContents.companyId, companyId), inArray(generatedContents.id, contentIds)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = contentIds.map((id) => byId.get(id)).filter(Boolean) as any[];

    const daily = await getDailyState(companyId, batch.date, dailyLimit);
    let prepared = daily.preparedCount;

    // items still needing work (idempotent skip of matched / needs_review)
    const pending = ordered.filter((r) => !r.visualAssetId && !["matched", "needs_review"].includes(String(r.visualSearchStatus)));

    const concurrency = Math.max(1, deps.concurrency ?? PROCESS_CONCURRENCY);
    let matched = ordered.filter((r) => String(r.visualSearchStatus) === "matched").length;
    let needsReview = ordered.filter((r) => String(r.visualSearchStatus) === "needs_review").length;
    let failed = 0;

    for (let i = 0; i < pending.length; i += concurrency) {
      if (prepared >= dailyLimit) break; // daily cap reached — stop making Pexels requests
      const slice = pending.slice(i, i + concurrency).filter((_, k) => prepared + k < dailyLimit);
      if (!slice.length) break;
      const results = await Promise.all(slice.map((row) => searchVisualForContent({ row, userId, companyId, deps })));
      for (const outcome of results) {
        if (outcome.status === "matched") matched++;
        else if (outcome.status === "needs_review") needsReview++;
        else failed++;
        if (outcome.counted) prepared++;
      }
      if (results.some((r) => r.counted)) {
        await bumpPrepared(companyId, userId, batch.date, results.filter((r) => r.counted).length, dailyLimit);
      }
    }

    const size = ordered.length;
    const status = failed === size && size > 0 ? "failed" : matched === size && size > 0 ? "ready" : "partial";
    await touchBatch(batchId, {
      status,
      size: String(size),
      matchedCount: String(matched),
      needsReviewCount: String(needsReview),
      failedCount: String(failed),
      error: null,
    });
  } catch (e: any) {
    await touchBatch(batchId, { status: "failed", error: String(e?.message ?? e).slice(0, 500) }).catch(() => {});
  } finally {
    inFlightBatches.delete(batchId);
    inFlightCompanies.delete(companyId);
  }
}

// ---------------------------------------------------------------------------
// Feed read — keyset-paginated batches of 5 over the brand's generated content.
// ---------------------------------------------------------------------------

function keysetWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  return or(
    lt(generatedContents.createdAt, cursor.createdAt),
    and(eq(generatedContents.createdAt, cursor.createdAt), lt(generatedContents.id, cursor.id)),
  );
}

async function loadVisualsForRows(rows: any[]): Promise<Map<string, VisualAssetDoc>> {
  const assetIds = rows.map((r) => r.visualAssetId).filter(Boolean) as string[];
  const map = new Map<string, VisualAssetDoc>();
  if (!assetIds.length) return map;
  const assets = await db.select().from(visualAssets).where(inArray(visualAssets.id, assetIds));
  for (const a of assets) map.set(a.id, parseVisualAssetRow(a as any));
  return map;
}

export type GetContentFeedInput = {
  companyId: string;
  userId: string;
  cursor?: string | null;
  limit?: number;
  deps?: VisualFeedDeps;
};

/**
 * Return one batch (≤5 posts) of the brand's content with each post's current visual state.
 * Creating a NEW batch kicks off background visual search (fire-and-forget); re-requesting
 * the SAME cursor is a no-op trigger (duplicate-prefetch guard) and simply reflects the
 * latest state, which is how the client polls a batch until its visuals are ready.
 */
export async function getContentFeed(input: GetContentFeedInput): Promise<ContentFeedResponse> {
  const { companyId, userId } = input;
  const deps = input.deps ?? {};
  const limit = Math.max(1, Math.min(FEED_BATCH_SIZE, input.limit ?? FEED_BATCH_SIZE));
  const dailyLimit = deps.dailyLimit ?? FEED_DAILY_LIMIT;

  const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  if (!company) throw new VisualFeedError("Company not found", 404);

  const date = feedDate(deps.now?.());
  const keyset = decodeCursor(input.cursor);
  const cursorKey = input.cursor ?? "start";

  const whereClauses = [eq(generatedContents.companyId, companyId), eq(generatedContents.userId, userId)];
  const kw = keysetWhere(keyset);
  if (kw) whereClauses.push(kw as any);

  const rows = await db
    .select()
    .from(generatedContents)
    .where(and(...whereClauses))
    .orderBy(desc(generatedContents.createdAt), desc(generatedContents.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  const daily = await getDailyState(companyId, date, dailyLimit);

  if (!pageRows.length) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      dailyLimit,
      preparedToday: daily.preparedCount,
      remainingToday: Math.max(0, daily.dailyLimit - daily.preparedCount),
      batch: { batchNumber: 0, size: 0, status: "ready" },
    };
  }

  const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  // find-or-create the batch row keyed by (company, date, cursor) — the dedup guard
  let batch = await getBatchByCursor(companyId, date, cursorKey);
  let isNew = false;
  if (!batch) {
    const [countRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(visualSearchBatches)
      .where(and(eq(visualSearchBatches.companyId, companyId), eq(visualSearchBatches.date, date)));
    const batchNumber = Number((countRow as any)?.n ?? 0) + 1;
    const now = new Date().toISOString();
    const [created] = await db
      .insert(visualSearchBatches)
      .values({
        userId,
        companyId,
        date,
        batchNumber: String(batchNumber),
        cursorKey,
        status: "pending",
        size: String(pageRows.length),
        matchedCount: "0",
        needsReviewCount: "0",
        failedCount: "0",
        contentIds: JSON.stringify(pageRows.map((r) => r.id)),
        nextCursor,
        hasMore: hasMore ? "1" : "0",
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoNothing()
      .returning();
    batch = created ?? (await getBatchByCursor(companyId, date, cursorKey));
    isNew = !!created;
  }

  if (isNew && batch && deps.autoProcess !== false) {
    void processBatchVisualSearch(batch.id, deps).catch(() => {});
  }

  const visuals = await loadVisualsForRows(pageRows);
  const items: FeedItem[] = pageRows.map((row) => {
    const doc: GeneratedContentDoc = parseGeneratedContentRow(row as any);
    const visual = row.visualAssetId ? (visuals.get(row.visualAssetId) ?? null) : null;
    const rawStatus = String((row as any).visualSearchStatus ?? "pending");
    const visualStatus = (["pending", "searching", "matched", "needs_review", "failed"] as const).includes(rawStatus as any)
      ? (rawStatus as FeedItem["visualStatus"])
      : visual
        ? "matched"
        : "pending";
    return { content: doc, visual, visualStatus };
  });

  return {
    items,
    nextCursor,
    hasMore,
    dailyLimit,
    preparedToday: daily.preparedCount,
    remainingToday: Math.max(0, daily.dailyLimit - daily.preparedCount),
    batch: {
      batchNumber: Number(batch?.batchNumber ?? 1),
      size: Number(batch?.size ?? pageRows.length),
      status: (batch?.status as ContentFeedResponse["batch"]["status"]) ?? "pending",
    },
  };
}

// ---------------------------------------------------------------------------
// Resume worker — picks up pending/stale/failed batches (server restart, or a batch that
// was deferred because the company was already processing one). Same shape as the media
// and content-generation workers; never throws out of the tick.
// ---------------------------------------------------------------------------

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

export function startVisualWorker(intervalMs = 20_000) {
  if (workerTimer) return () => {};
  const tick = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      const batches = await db
        .select()
        .from(visualSearchBatches)
        .where(inArray(visualSearchBatches.status, ["pending", "processing", "partial", "failed"] as any))
        .orderBy(desc(visualSearchBatches.updatedAt))
        .limit(10);
      for (const batch of batches) {
        if (inFlightBatches.has(batch.id) || inFlightCompanies.has(batch.companyId)) continue;
        if (batch.status === "processing" && !isStaleBatch(batch.status, batch.updatedAt)) continue;
        // a completed daily quota means no more Pexels work today — skip until tomorrow
        const daily = await getDailyState(batch.companyId, batch.date, FEED_DAILY_LIMIT);
        if (daily.preparedCount >= daily.dailyLimit) continue;
        await processBatchVisualSearch(batch.id).catch(() => {});
      }
    } catch {
      // worker errors must never terminate the process
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
