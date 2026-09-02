const APIFY_BASE_URL = process.env.APIFY_BASE_URL ?? "https://api.apify.com/v2";
const APIFY_ACTOR_ENDPOINT = "/acts/apify~instagram-scraper/run-sync-get-dataset-items";
const DEFAULT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Creator input normalization
// ---------------------------------------------------------------------------

/**
 * Converts arbitrary creator input into a canonical Instagram profile URL:
 *   "@nike" -> "https://www.instagram.com/nike/"
 *   "nike"  -> "https://www.instagram.com/nike/"
 *   full URL -> kept if it belongs to instagram.com
 * Throws a descriptive error for anything that isn't a valid Instagram profile.
 */
export function normalizeCreatorToUrl(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("Please enter a valid Instagram creator profile.");

  let url: URL;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("www.") || /^instagram\.com\//i.test(raw)) {
    // Full URL provided — must be a valid URL and belong to Instagram.
    try {
      const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      url = new URL(prefixed);
    } catch {
      throw new Error("Please enter a valid Instagram creator profile.");
    }
    if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ""))) {
      throw new Error("Please enter a valid Instagram creator profile.");
    }
  } else {
    // bare username or @username
    let username = raw;
    if (username.startsWith("@")) username = username.slice(1);
    // allow "instagram.com/user" style shorthand
    const slashMatch = username.match(/^(?:instagram\.com\/)?(.+)$/i);
    username = slashMatch?.[1] ?? username;
    if (!username || username.includes("/") || /\s/.test(username) || username.includes("?")) {
      throw new Error("Please enter a valid Instagram creator profile.");
    }
    return `https://www.instagram.com/${username}/`;
  }

  // URL path validation: the first segment must be a valid username.
  // Instagram profile URLs are always of the form /username/ (a trailing
  // path like /p/<code>/ or /reels/ is stripped back to the profile).
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Please enter a valid Instagram creator profile.");
  }
  const username = segments[0];
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    throw new Error("Please enter a valid Instagram creator profile.");
  }
  return `https://www.instagram.com/${username}/`;
}

/** Extract just the username from a canonical profile URL. */
export function usernameFromUrl(url: string): string {
  const segments = url.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

// ---------------------------------------------------------------------------
// Apify response normalization
// ---------------------------------------------------------------------------

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.round(Number(v));
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  return null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export interface NormalizedInstagramPost {
  externalPostId: string;
  shortcode: string | null;
  postUrl: string | null;
  username: string | null;
  ownerFullName: string | null;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  hashtags: string[];
  mentions: string[];
  rawData: unknown;
}

/**
 * Normalize a single raw Apify Instagram row into the internal post model.
 * Every field is optional — missing fields become null / empty.
 */
export function normalizeInstagramRow(row: Record<string, unknown>): NormalizedInstagramPost {
  const shortcode = toStr(row.shortcode) ?? toStr(row.code);
  const username = toStr(row.username) ?? toStr(row.ownerUsername);

  const mediaTypeRaw = (toStr(row.type) ?? toStr(row.mediaType) ?? "").toLowerCase();
  const isVideo = mediaTypeRaw.includes("video") || mediaTypeRaw === "sidecar" && toStr(row.videoUrl) != null;
  const mediaType = mediaTypeRaw === "image" ? "image" : isVideo ? "video" : mediaTypeRaw || null;

  const postUrl =
    toStr(row.url) ??
    (username && shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);

  const hashtags = toStringArray(row.hashtags).length
    ? toStringArray(row.hashtags)
    : extractHashtagsToStr(toStr(row.caption));

  return {
    externalPostId: shortcode ?? toStr(row.id) ?? shortcode ?? String(row.postId ?? ""),
    shortcode,
    postUrl,
    username,
    ownerFullName: toStr(row.ownerFullName) ?? toStr(row.fullName),
    caption: toStr(row.caption),
    mediaType,
    mediaUrl: toStr(row.displayUrl) ?? toStr(row.imageUrl) ?? (isVideo ? toStr(row.videoUrl) : null),
    thumbnailUrl: toStr(row.thumbnailSrc) ?? toStr(row.displayUrl) ?? null,
    publishedAt: toStr(row.timestamp) ?? toStr(row.takenAtTimestamp) ?? null,
    likes: toInt(row.likesCount) ?? toInt(row.likeCount),
    comments: toInt(row.commentsCount) ?? toInt(row.commentCount),
    shares: toInt(row.sharesCount),
    views: toInt(row.videoViewCount) ?? toInt(row.viewCount),
    hashtags,
    mentions: toStringArray(row.mentions),
    rawData: row,
  };
}

function extractHashtagsToStr(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#([a-zA-Z0-9_]+)/g) ?? [];
  return matches.map((m) => m.replace(/^#/, ""));
}

// ---------------------------------------------------------------------------
// Apify API call
// ---------------------------------------------------------------------------

export class ApifyError extends Error {
  status: number;
  kind: "invalid_key" | "upstream" | "invalid_response";
  constructor(message: string, kind: "invalid_key" | "upstream" | "invalid_response", status = 502) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Scrape Instagram posts for a creator via the Apify Instagram Scraper.
 * The token is provided at call time from the user's stored credential — it is
 * never logged, never defaulted, and never included in error messages.
 */
export async function scrapeInstagram({
  token,
  profileUrl,
  username,
  resultsLimit,
  signal,
}: {
  token: string;
  profileUrl: string;
  username: string;
  resultsLimit: number;
  signal?: AbortSignal;
}): Promise<NormalizedInstagramPost[]> {
  const url = `${APIFY_BASE_URL}${APIFY_ACTOR_ENDPOINT}?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  const externalAbort = signal;
  const onAbort = () => ctrl.abort();
  if (externalAbort) {
    if (externalAbort.aborted) ctrl.abort();
    else externalAbort.addEventListener("abort", onAbort);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultsType: "posts",
        directUrls: [profileUrl],
        resultsLimit,
      }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    throw new ApifyError(
      aborted ? "Instagram scraping timed out." : "Instagram scraping failed.",
      "upstream",
    );
  } finally {
    clearTimeout(timer);
    if (externalAbort) externalAbort.removeEventListener("abort", onAbort);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ApifyError("Your Apify API key is invalid.", "invalid_key", res.status);
    }
    // swallow the upstream body — it may echo the token
    throw new ApifyError("Instagram scraping failed.", "upstream", res.status);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ApifyError("Instagram scraping failed.", "invalid_response");
  }

  let rows: unknown[];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    rows = Array.isArray(obj.items)
      ? (obj.items as unknown[])
      : Array.isArray(obj.data)
        ? (obj.data as unknown[])
        : [];
  } else {
    rows = [];
  }

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map(normalizeInstagramRow)
    .filter((p) => p.externalPostId && (p.postUrl || p.shortcode))
    .filter((p) => {
      // only keep posts actually belonging to the target creator on profile scrapes
      if (p.username) return p.username.toLowerCase() === username.replace(/^@/, "").toLowerCase();
      return true;
    });
}

// Zod helper re-exported for tests
export const _private = { APIFY_BASE_URL, APIFY_ACTOR_ENDPOINT };
