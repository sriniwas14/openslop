import { z } from "zod";
import { generatedContentSchema } from "../ugc/ugc.schemas";

// ---------------------------------------------------------------------------
// Visual discovery feed — API schemas.
//
// The feed is an Instagram/Reels-style vertical stream over a brand's already-generated
// content, where each post is paired with the best Pexels visual found for it. The client
// only ever sees content + visual + status; the Pexels key and search internals stay
// server-side. brandId === companyId, so the route is company-scoped like every other API.
// ---------------------------------------------------------------------------

export const FEED_BATCH_SIZE = 5; // exactly 5 posts per batch (spec)
export const FEED_DAILY_LIMIT = 100; // 20 batches × 5 = 100 prepared items per brand per day

export const VISUAL_SEARCH_STATUSES = ["pending", "searching", "matched", "needs_review", "failed"] as const;
export type VisualSearchStatus = (typeof VISUAL_SEARCH_STATUSES)[number];

export const VISUAL_BATCH_STATUSES = ["pending", "processing", "ready", "partial", "failed"] as const;
export type VisualBatchStatus = (typeof VISUAL_BATCH_STATUSES)[number];

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });
export const errorResponseSchema = z.object({ error: z.string() });

/** Cursor pagination — limit is fixed at the batch size (5); the client never asks for 100. */
export const contentFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(FEED_BATCH_SIZE).default(FEED_BATCH_SIZE),
  cursor: z.string().min(1).max(512).optional(),
});
export type ContentFeedQuery = z.infer<typeof contentFeedQuerySchema>;

/** A selected visual, safe to expose to the client (no source credentials, no API key). */
export const visualAssetSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceAssetId: z.string(),
  sourceUrl: z.string().nullable(),
  previewUrl: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  localUrl: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  orientation: z.string().nullable(),
  altText: z.string().nullable(),
  photographer: z.string().nullable(),
  avgColor: z.string().nullable(),
  tags: z.array(z.string()),
  /** "image" for photos, "video" for motion (additive — old rows read as image). */
  mediaType: z.string().nullable().optional(),
  /** Poster still for videos (additive). */
  posterUrl: z.string().nullable().optional(),
  /** Clip length in seconds for videos (additive). */
  duration: z.number().nullable().optional(),
  createdAt: z.string(),
});
export type VisualAssetDoc = z.infer<typeof visualAssetSchema>;

export const feedItemSchema = z.object({
  content: generatedContentSchema,
  visual: visualAssetSchema.nullable(),
  visualStatus: z.enum(VISUAL_SEARCH_STATUSES),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const feedBatchSchema = z.object({
  batchNumber: z.number().int(),
  size: z.number().int(),
  status: z.enum(VISUAL_BATCH_STATUSES),
});

export const contentFeedResponseSchema = z.object({
  items: z.array(feedItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  dailyLimit: z.number().int(),
  preparedToday: z.number().int(),
  remainingToday: z.number().int(),
  batch: feedBatchSchema,
});
export type ContentFeedResponse = z.infer<typeof contentFeedResponseSchema>;

/** sqlite stores JSON as text and numbers as text — parse a visual_asset row on read. */
export function parseVisualAssetRow(row: Record<string, any>): VisualAssetDoc {
  const jsonArr = (v: unknown): string[] => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(String(v));
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  };
  const meta = (() => {
    try {
      const parsed = JSON.parse(String(row.metadata ?? "{}"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();
  return {
    id: String(row.id),
    source: String(row.source ?? "pexels"),
    sourceAssetId: String(row.sourceAssetId ?? ""),
    sourceUrl: row.sourceUrl ?? null,
    previewUrl: row.previewUrl ?? null,
    downloadUrl: row.downloadUrl ?? null,
    localUrl: row.localUrl ?? null,
    width: Number(row.width ?? 0) || 0,
    height: Number(row.height ?? 0) || 0,
    orientation: row.orientation ?? null,
    altText: row.altText ?? null,
    photographer: (meta.photographer as string) ?? null,
    avgColor: (meta.avgColor as string) ?? null,
    tags: jsonArr(row.tags),
    mediaType: (meta.mediaType as string) ?? "image",
    posterUrl: (meta.posterUrl as string) ?? null,
    duration: typeof meta.duration === "number" ? meta.duration : null,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
  };
}
