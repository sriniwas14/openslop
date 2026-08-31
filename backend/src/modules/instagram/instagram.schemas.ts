import { z } from "zod";

export const errorResponseSchema = z.object({ error: z.string() });

// Apify API key — accepted on save, never returned (masked only)
export const saveApifyKeySchema = z.object({
  apiKey: z.string().min(1).max(2048, "API key too long"),
});

export const apifyStatusSchema = z.enum(["not_connected", "connected", "invalid"]);

export const apifyKeyResponseSchema = z.object({
  provider: z.string(),
  apiKeyMasked: z.string().nullable(),
  hasKey: z.boolean(),
  status: apifyStatusSchema,
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

// Test connection uses a transient key (from the form, not stored) or the stored key
export const testApifyKeyBodySchema = z.object({
  apiKey: z.string().max(2048).optional(),
});

// creator + results limit for scraping
export const scrapeRequestBodySchema = z.object({
  creator: z.string().min(1).max(500),
  resultsLimit: z.number().int().min(1).max(200).default(20),
});

export const creatorResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  username: z.string(),
  profileUrl: z.string(),
  displayName: z.string().nullable(),
  status: z.string(),
  lastScrapedAt: z.string().nullable(),
  postCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const postResponseSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  externalPostId: z.string(),
  shortcode: z.string().nullable(),
  postUrl: z.string().nullable(),
  username: z.string().nullable(),
  ownerFullName: z.string().nullable(),
  caption: z.string().nullable(),
  mediaType: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  views: z.number().nullable(),
  hashtags: z.array(z.string()),
  mentions: z.array(z.string()),
  source: z.string(),
  scrapedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const scrapeResponseSchema = z.object({
  creator: creatorResponseSchema,
  job: z.object({
    id: z.string(),
    status: z.string(),
    postsFound: z.number(),
    error: z.string().nullable(),
  }),
  posts: z.array(postResponseSchema),
  newCount: z.number(),
  message: z.string(),
});
