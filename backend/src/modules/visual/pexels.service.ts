// ---------------------------------------------------------------------------
// Pexels — the visual discovery feed's photo source.
//
// Server-side only: the API key is read from process.env and NEVER returned to a
// client or written into a response. Mirrors media.providers (fetch + normalized
// result) and instagram.service (injectable fetchFn so tests never hit the network).
//
// Pexels limits: 200 requests/hour, 20_000/month, 429 when exceeded. A min-interval
// throttle + bounded retries with backoff keep a batch of 5 well inside those limits
// without an external queue dependency.
// ---------------------------------------------------------------------------

import type { VisualOrientation } from "../ugc/ugc.schemas";

export class PexelsError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = "PexelsError";
    this.status = status;
    this.retryable = retryable;
  }
}

/** One normalized candidate — photos and videos share the shape so the scorer,
 *  persistence and feed layers treat them identically. Provider-agnostic so a
 *  future source can reuse it. */
export type VisualCandidate = {
  source: "pexels";
  /** "image" for photos, "video" for videos. */
  mediaType: "image" | "video";
  sourceAssetId: string; // video ids are prefixed "video_" (photo/video IDs share a namespace)
  sourceUrl: string; // Pexels page URL (canonical source, also a dedup key)
  previewUrl: string; // rendered asset the feed displays (image URL or playable mp4 link)
  downloadUrl: string; // full-resolution original (future composition stage)
  /** Poster still for videos (Pexels `image`); null for photos. */
  posterUrl: string | null;
  /** Clip length in seconds for videos; null for photos. */
  duration: number | null;
  width: number;
  height: number;
  orientation: VisualOrientation;
  altText: string;
  photographer: string;
  avgColor: string;
  tags: string[];
  // provenance for the semantic scorer — which query surfaced it and how specific that query was
  query: string;
  queryIndex: number;
};

export type PexelsSearchInput = {
  query: string;
  orientation?: VisualOrientation | null;
  perPage?: number;
  page?: number;
  queryIndex?: number;
  /** Videos endpoint only: resolution bucket (Pexels `size`). Default "medium" keeps files cache-friendly. */
  size?: "small" | "medium" | "large" | null;
};

/** Injectable dependencies — tests pass a fake fetch/apiKey and never touch the network. */
export type PexelsDeps = {
  apiKey?: string | null;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  maxRetries?: number;
  baseUrl?: string;
};

const DEFAULT_PER_PAGE = 30;
const DEFAULT_MIN_INTERVAL_MS = 400; // ~2.5 req/s — comfortably under 200/hour when bursty
const DEFAULT_MAX_RETRIES = 3;
const PEXELS_BASE = "https://api.pexels.com/v1";

/** Read the server-side key lazily so read-only paths and tests never require it. */
export function getPexelsApiKey(): string | null {
  const key = process.env.PEXELS_API_KEY?.trim();
  return key ? key : null;
}

export function hasPexelsKey(): boolean {
  return !!getPexelsApiKey();
}

function orientationOf(width: number, height: number): VisualOrientation {
  if (!width || !height) return "square";
  const ratio = width / height;
  if (ratio > 1.08) return "landscape";
  if (ratio < 0.92) return "portrait";
  return "square";
}

/** Pexels search `orientation` param only accepts portrait/landscape/square. */
function pexelsOrientationParam(o?: VisualOrientation | null): string | undefined {
  return o === "portrait" || o === "landscape" || o === "square" ? o : undefined;
}

function normalizePhoto(photo: any, query: string, queryIndex: number): VisualCandidate | null {
  const id = photo?.id;
  const src = photo?.src ?? {};
  const previewUrl = src.large2x || src.large || src.medium || src.original;
  const downloadUrl = src.original || src.large2x || src.large;
  if (id == null || !previewUrl) return null; // missing image URL → unusable candidate
  const width = Number(photo?.width ?? 0) || 0;
  const height = Number(photo?.height ?? 0) || 0;
  return {
    source: "pexels",
    mediaType: "image",
    sourceAssetId: String(id),
    sourceUrl: String(photo?.url ?? `https://www.pexels.com/photo/${id}`),
    previewUrl: String(previewUrl),
    downloadUrl: String(downloadUrl ?? previewUrl),
    posterUrl: null,
    duration: null,
    width,
    height,
    orientation: orientationOf(width, height),
    altText: String(photo?.alt ?? "").slice(0, 500),
    photographer: String(photo?.photographer ?? "").slice(0, 200),
    avgColor: String(photo?.avg_color ?? photo?.avgColor ?? "").slice(0, 16),
    tags: Array.isArray(photo?.tags) ? photo.tags.map((t: any) => String(t)).slice(0, 20) : [],
    query,
    queryIndex,
  };
}

/**
 * Pick the mp4 file to stream/cache: prefer HD near 1080p (crisp on phones
 * without UHD weight), fall back to the first playable mp4.
 */
function chooseVideoFile(mp4s: any[]): any {
  const hd = mp4s.filter((f) => String(f?.quality ?? "").toLowerCase() === "hd");
  const pool = hd.length ? hd : mp4s;
  let best = pool[0];
  let bestScore = Infinity;
  for (const f of pool) {
    const w = Number(f?.width ?? 0) || 0;
    const score = w >= 720 ? Math.abs(w - 1080) : 10000 + (720 - w);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

function normalizeVideo(video: any, query: string, queryIndex: number): VisualCandidate | null {
  const id = video?.id;
  const files: any[] = Array.isArray(video?.video_files) ? video.video_files : [];
  const mp4s = files.filter((f) => f?.link && String(f?.file_type ?? "").toLowerCase().includes("mp4"));
  if (id == null || !mp4s.length) return null; // no playable file → unusable candidate
  const file = chooseVideoFile(mp4s);
  const link = String(file.link);
  const width = Number(video?.width ?? file?.width ?? 0) || 0;
  const height = Number(video?.height ?? file?.height ?? 0) || 0;
  const duration = Number(video?.duration ?? 0);
  return {
    source: "pexels",
    mediaType: "video",
    sourceAssetId: `video_${id}`,
    sourceUrl: String(video?.url ?? `https://www.pexels.com/video/${id}`),
    previewUrl: link,
    downloadUrl: link,
    posterUrl: video?.image ? String(video.image) : null,
    duration: duration > 0 ? Math.round(duration) : null,
    width,
    height,
    orientation: orientationOf(width, height),
    // videos carry no alt/tags — the surfacing query feeds the scorer instead
    // (buildContext tokens include candidate.query).
    altText: "",
    photographer: String(video?.user?.name ?? "").slice(0, 200),
    avgColor: "",
    tags: [],
    query,
    queryIndex,
  };
}

// ---------------------------------------------------------------------------
// Min-interval throttle — one shared gate so concurrent queries stay rate-limited.
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();

function throttle(minIntervalMs: number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const run = gate.then(async () => {
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  // keep the chain alive even if a caller ignores a rejection
  gate = run.catch(() => {});
  return run;
}

/** Reset the throttle gate (tests). */
export function __resetPexelsThrottle() {
  lastRequestAt = 0;
  gate = Promise.resolve();
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Shared GET with throttle + retries (429/5xx/network, honouring
 * Retry-After). Returns the parsed JSON body (null when unparsable).
 * Throws PexelsError on missing key (non-retryable), 401/403
 * (non-retryable), other non-OK statuses, and exhausted retries.
 */
async function pexelsGet(
  url: string,
  opts: {
    apiKey: string;
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    minIntervalMs: number;
    maxRetries: number;
  },
): Promise<any | null> {
  const { apiKey, fetchFn, sleep, minIntervalMs, maxRetries } = opts;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await throttle(minIntervalMs, sleep);
    let res: Response;
    try {
      res = await fetchFn(url, { headers: { Authorization: apiKey, Accept: "application/json" } });
    } catch (e: any) {
      if (attempt++ >= maxRetries) throw new PexelsError(`Pexels request failed: ${String(e?.message ?? e)}`, 502, true);
      await sleep(300 * 2 ** attempt);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt++ >= maxRetries) {
        throw new PexelsError(`Pexels rate limited or unavailable (${res.status})`, res.status, true);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await sleep(backoff);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new PexelsError("Pexels API key was rejected (401/403)", res.status, false);
    }
    if (!res.ok) {
      throw new PexelsError(`Pexels search failed (${res.status})`, res.status, false);
    }

    return await res.json().catch(() => null);
  }
}

type ResolvedDeps = {
  apiKey: string;
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  minIntervalMs: number;
  maxRetries: number;
  baseUrl: string;
};

function resolveDeps(input: { queryIndex?: number }, deps: PexelsDeps): { resolved: ResolvedDeps; queryIndex: number } {
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : getPexelsApiKey();
  if (!apiKey) throw new PexelsError("Pexels API key is not configured (set PEXELS_API_KEY on the server)", 500, false);
  return {
    resolved: {
      apiKey,
      fetchFn: deps.fetchFn ?? fetch,
      sleep: deps.sleep ?? defaultSleep,
      minIntervalMs: deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      maxRetries: deps.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseUrl: (deps.baseUrl ?? PEXELS_BASE).replace(/\/+$/, ""),
    },
    queryIndex: input.queryIndex ?? 0,
  };
}

/**
 * Search Pexels photos for one query and return normalized candidates.
 */
export async function searchPexelsPhotos(input: PexelsSearchInput, deps: PexelsDeps = {}): Promise<VisualCandidate[]> {
  const { resolved, queryIndex } = resolveDeps(input, deps);

  const params = new URLSearchParams({ query: input.query, per_page: String(input.perPage ?? DEFAULT_PER_PAGE) });
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const orientation = pexelsOrientationParam(input.orientation);
  if (orientation) params.set("orientation", orientation);
  const url = `${resolved.baseUrl}/search?${params.toString()}`;

  const body = await pexelsGet(url, resolved);
  const photos: any[] = Array.isArray(body?.photos) ? body.photos : [];
  const candidates = photos.map((p) => normalizePhoto(p, input.query, queryIndex));
  return candidates.filter((c): c is VisualCandidate => c !== null);
}

/** Derive the videos endpoint from a photo-API base (honours custom baseUrl in tests). */
function videosBaseUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  return b.endsWith("/v1") ? `${b.slice(0, -3)}/videos` : `${b}/videos`;
}

/**
 * Search Pexels videos for one query and return normalized candidates.
 * Same contract as photo search; `size` defaults to "medium" so matched
 * files stay cache-friendly.
 */
export async function searchPexelsVideos(input: PexelsSearchInput, deps: PexelsDeps = {}): Promise<VisualCandidate[]> {
  const { resolved, queryIndex } = resolveDeps(input, deps);

  const params = new URLSearchParams({ query: input.query, per_page: String(input.perPage ?? DEFAULT_PER_PAGE) });
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const orientation = pexelsOrientationParam(input.orientation);
  if (orientation) params.set("orientation", orientation);
  params.set("size", input.size ?? "medium");
  const url = `${videosBaseUrl(resolved.baseUrl)}/search?${params.toString()}`;

  const body = await pexelsGet(url, resolved);
  const videos: any[] = Array.isArray(body?.videos) ? body.videos : [];
  const candidates = videos.map((v) => normalizeVideo(v, input.query, queryIndex));
  return candidates.filter((c): c is VisualCandidate => c !== null);
}
