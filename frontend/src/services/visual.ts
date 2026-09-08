// ponytail: Visual discovery feed client — types mirror the backend visual.schemas.ts
// response shape. This is a READ-ONLY API: one call returns one batch (≤5 posts) of the
// brand's already-generated content plus each post's current visual state.
//
// The Pexels key never reaches the browser — the client only ever sees a selected visual's
// public URLs. brandId === companyId, so the path is company-scoped like every other API.

export const FEED_BATCH_SIZE = 5
export const FEED_DAILY_LIMIT = 100

/** Per-post visual pipeline state. */
export type VisualSearchStatus = 'pending' | 'searching' | 'matched' | 'needs_review' | 'failed'

/** Per-batch preparation state. */
export type VisualBatchStatus = 'pending' | 'processing' | 'ready' | 'partial' | 'failed'

/** A selected visual asset, safe to render (no source credentials). */
export type VisualAssetDoc = {
  id: string
  source: string
  sourceAssetId: string
  sourceUrl: string | null
  previewUrl: string | null
  downloadUrl: string | null
  /** Local copy under /media/files when the server cached it; prefer this for rendering. */
  localUrl: string | null
  width: number
  height: number
  orientation: string | null
  altText: string | null
  photographer: string | null
  avgColor: string | null
  tags: string[]
  /** "image" for photos, "video" for motion (absent on old photo rows). */
  mediaType?: string | null
  /** Poster still for videos (absent on old rows). */
  posterUrl?: string | null
  /** Clip length in seconds for videos (absent on old rows). */
  duration?: number | null
  createdAt: string
}

/** One already-generated post. Mirrors ugc.schemas.generatedContentSchema. */
export type GeneratedContentDoc = {
  id: string
  userId: string
  companyId: string
  jobId: string | null
  contentAngleId: string
  platform: string
  contentFormat: string
  contentType: string
  generationMode: string
  language: string
  hook: string | null
  title: string | null
  body: string | null
  lines: string[]
  script: string | null
  onScreenText: string[]
  cta: string | null
  visualTags: string[]
  visualMood: string | null
  visualStyle: string | null
  visualCategory: string | null
  visualOrientation: string
  status: string
  source: string
  model: string | null
  promptVersion: string | null
  visualIntentId: string | null
  visualAssetId: string | null
  usageCount: number
  isEdited: boolean
  editedAt: string | null
  createdAt: string
  updatedAt: string
}

export type FeedItem = {
  content: GeneratedContentDoc
  visual: VisualAssetDoc | null
  visualStatus: VisualSearchStatus
}

export type FeedBatch = {
  batchNumber: number
  size: number
  status: VisualBatchStatus
}

export type ContentFeedResponse = {
  items: FeedItem[]
  /** Opaque keyset cursor for the next batch; null at the end of the feed. */
  nextCursor: string | null
  hasMore: boolean
  dailyLimit: number
  preparedToday: number
  remainingToday: number
  batch: FeedBatch
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text || res.statusText || `Request failed (${res.status})`
    try {
      const j = JSON.parse(text)
      msg = j?.error || j?.message || msg
    } catch {
      /* body was plain text */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const root = (companyId: string) => `/companies/${companyId}/content-feed`

/**
 * GET one batch of the feed. Pass no cursor for the first batch, then the previous
 * response's nextCursor for each subsequent one.
 *
 * The server answers immediately with whatever visual state exists right now and prepares
 * the batch in the background, so the same cursor can be re-requested to poll: repeating a
 * cursor never re-triggers work, it just returns the updated visuals.
 */
export function fetchContentFeed(
  companyId: string,
  opts: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<ContentFeedResponse> {
  const sp = new URLSearchParams()
  if (opts.limit) sp.set('limit', String(opts.limit))
  if (opts.cursor) sp.set('cursor', opts.cursor)
  const qs = sp.toString()
  return fetch(qs ? `${root(companyId)}?${qs}` : root(companyId), {
    credentials: 'include',
    signal: opts.signal,
  }).then(handle<ContentFeedResponse>)
}

/** The URL a feed card should render — the cached local copy when present, else the CDN preview. */
export function visualSrc(visual: VisualAssetDoc | null): string | null {
  if (!visual) return null
  return visual.localUrl || visual.previewUrl || visual.downloadUrl || null
}

/** True while the visual is still being prepared (skeleton, keep polling). */
export function isVisualPending(status: VisualSearchStatus): boolean {
  return status === 'pending' || status === 'searching'
}
