import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import {
  instagramPosts,
  instagramSources,
  instagramScrapeJobs,
  companies,
} from "../../db/schema";
import { scrapeInstagram, normalizeCreatorToUrl, usernameFromUrl, ApifyError } from "./apify.service";
import type { NormalizedInstagramPost } from "./apify.service";

export interface ScrapeAndStoreResult {
  sourceId: string;
  creatorUsername: string;
  profileUrl: string;
  displayName: string | null;
  newCount: number;
  updatedCount: number;
  postsFound: number;
  storedPosts: (typeof instagramPosts.$inferSelect)[];
  message: string;
}

/**
 * Core scrape+store pipeline extracted for testability.
 * - resolves the company (workspace) for a user, enforcing ownership
 * - requires a stored Apify key
 * - normalizes/validates the creator URL
 * - creates or reuses the creator record (per company)
 * - calls Apify (mocked in tests) and upserts posts (dedup by company+external_post_id)
 */
export async function scrapeAndStorePosts({
  userId,
  companyId,
  creator,
  resultsLimit,
  scrapeFn = scrapeInstagram,
  dedupeGuard,
}: {
  userId: string;
  companyId?: string | null;
  creator: string;
  resultsLimit: number;
  scrapeFn?: typeof scrapeInstagram;
  dedupeGuard?: { acquire: (key: string) => boolean; release: (key: string) => void };
}): Promise<ScrapeAndStoreResult> {
  // resolve workspace (company)
  let companyIdResolved = companyId ?? null;
  if (!companyIdResolved) {
    const [first] = await db.select().from(companies).where(eq(companies.userId, userId)).limit(1);
    companyIdResolved = first?.id ?? null;
  }
  if (!companyIdResolved) throw new ScrapeError("Create a company before scraping Instagram posts.", 400);

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyIdResolved), eq(companies.userId, userId)));
  if (!company) throw new ScrapeError("Company not found", 404);

  // Apify key (per-user credential, never exposed)
  const { socialCredentials } = await import("../../db/schema");
  const [cred] = await db
    .select()
    .from(socialCredentials)
    .where(and(eq(socialCredentials.userId, userId), eq(socialCredentials.provider, "apify")));
  const token = cred?.apiKey ?? null;
  if (!token) throw new ScrapeError("Please connect your Apify account before scraping Instagram posts.", 400);

  // normalize creator
  let profileUrl: string;
  let username: string;
  try {
    profileUrl = normalizeCreatorToUrl(creator);
    username = usernameFromUrl(profileUrl);
  } catch (e: any) {
    throw new ScrapeError(e?.message ?? "Please enter a valid Instagram creator profile.", 400);
  }

  const dedupeKey = `${companyIdResolved}:${username.toLowerCase()}`;
  if (dedupeGuard) {
    if (!dedupeGuard.acquire(dedupeKey)) {
      throw new ScrapeError("A scrape is already running for this creator. Please wait.", 409);
    }
  }

  // create/reuse creator
  let [creatorRow] = await db
    .select()
    .from(instagramSources)
    .where(and(eq(instagramSources.companyId, companyIdResolved), eq(instagramSources.username, username)));
  if (!creatorRow) {
    [creatorRow] = await db
      .insert(instagramSources)
      .values({ userId, companyId: companyIdResolved, username, profileUrl, displayName: null })
      .returning();
  }
  const sourceId = creatorRow.id;

  const jobId = crypto.randomUUID();
  await db.insert(instagramScrapeJobs).values({
    id: jobId,
    userId,
    companyId: companyIdResolved,
    sourceId,
    actorId: "apify~instagram-scraper",
    status: "running",
    startedAt: new Date().toISOString(),
  });

  let result: ScrapeAndStoreResult;
  try {
    const normalized = await scrapeFn({ token, profileUrl, username, resultsLimit });
    result = await storeNormalized({ userId, companyId: companyIdResolved, sourceId, username, normalized, jobId });
  } catch (e: any) {
    let message = "Instagram scraping failed. Please try again.";
    let failed = false;
    if (e instanceof ApifyError) {
      if (e.kind === "invalid_key") {
        message = "Your Apify API key is invalid. Please update it in Settings.";
      } else if (e.message.includes("timed out")) {
        message = "Instagram scraping timed out. Please try again.";
      }
      failed = true;
    } else if (e instanceof ScrapeError) {
      throw e;
    } else {
      failed = true;
    }
    if (failed) {
      await db
        .update(instagramScrapeJobs)
        .set({ status: "failed", error: message, completedAt: new Date().toISOString() })
        .where(eq(instagramScrapeJobs.id, jobId));
      throw new ApifyError(message, e instanceof ApifyError ? e.kind : "upstream");
    }
    throw e;
  } finally {
    if (dedupeGuard) dedupeGuard.release(dedupeKey);
  }

  return result;
}

async function storeNormalized({
  userId,
  companyId,
  sourceId,
  username,
  normalized,
  jobId,
}: {
  userId: string;
  companyId: string;
  sourceId: string;
  username: string;
  normalized: NormalizedInstagramPost[];
  jobId: string;
}): Promise<ScrapeAndStoreResult> {
  let newCount = 0;
  let updatedCount = 0;
  for (const p of normalized) {
    const [existing] = await db
      .select()
      .from(instagramPosts)
      .where(and(eq(instagramPosts.companyId, companyId), eq(instagramPosts.externalPostId, p.externalPostId)));
    const values: any = {
      userId,
      companyId,
      sourceId,
      externalPostId: p.externalPostId,
      shortcode: p.shortcode,
      postUrl: p.postUrl,
      username: p.username ?? username,
      ownerFullName: p.ownerFullName,
      caption: p.caption,
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt,
      likes: p.likes != null ? String(p.likes) : null,
      comments: p.comments != null ? String(p.comments) : null,
      shares: p.shares != null ? String(p.shares) : null,
      views: p.views != null ? String(p.views) : null,
      hashtags: (p.hashtags ?? []).length ? JSON.stringify(p.hashtags ?? []) : null,
      mentions: (p.mentions ?? []).length ? JSON.stringify(p.mentions ?? []) : null,
      source: "apify",
      rawData: JSON.stringify(p.rawData),
      scrapedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      await db.update(instagramPosts).set(values).where(eq(instagramPosts.id, existing.id));
      updatedCount++;
    } else {
      await db.insert(instagramPosts).values(values);
      newCount++;
    }
  }

  const firstWithName = normalized.find((p) => p.ownerFullName);
  const displayName = firstWithName?.ownerFullName ?? null;
  await db
    .update(instagramSources)
    .set({ displayName, lastScrapedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(instagramSources.id, sourceId));

  const completedAt = new Date().toISOString();
  const postsFound = normalized.length;
  await db
    .update(instagramScrapeJobs)
    .set({ status: "completed", postsFound: String(postsFound), completedAt })
    .where(eq(instagramScrapeJobs.id, jobId));

  const storedPosts = await db
    .select()
    .from(instagramPosts)
    .where(and(eq(instagramPosts.sourceId, sourceId), eq(instagramPosts.companyId, companyId)))
    .orderBy(instagramPosts.publishedAt);

  const message =
    normalized.length === 0
      ? "No posts were found for this creator."
      : `${postsFound} posts scraped successfully.`;

  return {
    sourceId,
    creatorUsername: username,
    profileUrl: `https://www.instagram.com/${username}/`,
    displayName,
    newCount,
    updatedCount,
    postsFound,
    storedPosts,
    message,
  };
}

export class ScrapeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ScrapeError";
  }
}
