import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const aiConfigs = sqliteTable(
  "ai_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    apiKey: text("api_key"),
    serviceAccountJson: text("service_account_json"),
    baseUrl: text("base_url"),
    projectId: text("project_id"),
    location: text("location"),
    model: text("model"),
    configId: text("config_id"),
    name: text("name"),
    isDefault: text("is_default").notNull().default("0"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_ai_config_user").on(t.userId)],
);

// ponytail: no DB-level FK — better-auth owns `user`; ownership is enforced in queries
export const companies = sqliteTable(
  "company",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    website: text("website").notNull(),
    persona: text("persona"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_company_user_id").on(t.userId)],
);

// ponytail: Brand Intelligence ("Brand Brain") — 1:1 with company (brandId === companyId).
// Sections stored as JSON text (sqlite has no native JSON); zod validates each shape on read/write.
// Arrays of objects (contentAngles, customerSegments, competitors) carry stable ids for item-level CRUD.
export const brandIntelligence = sqliteTable(
  "brand_intelligence",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | analyzing | ready | failed
    error: text("error"),
    brand: text("brand"), // JSON: { name, website, tagline, description, industry, category }
    identityAndProduct: text("identity_and_product"), // JSON
    purposeAndPositioning: text("purpose_and_positioning"), // JSON
    audience: text("audience"), // JSON: { primaryAudience, customerSegments[] }
    toneAndVoice: text("tone_and_voice"), // JSON
    contentAngles: text("content_angles"), // JSON: ContentAngle[]
    marketAndCompetition: text("market_and_competition"), // JSON
    metadata: text("metadata"), // JSON: { source, lastAnalyzedAt, lastUpdatedAt, version }
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_brand_intel_user").on(t.userId),
    uniqueIndex("uq_brand_intel_company").on(t.companyId),
  ],
);

// ponytail: single table — JSON stored as text (sqlite has no native JSON); zod validates kind-specific shapes
export const contents = sqliteTable(
  "content",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    kind: text("kind").notNull(), // carousel | talkinghead | greenscreen
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"), // draft | published
    images: text("images"), // JSON: { url, text, font?, background?, color? }[]
    scripts: text("scripts"), // JSON: { type: "aroll"|"broll", prompt }[]
    mediaUrl: text("media_url"), // primary generated media URL
    format: text("format"), // vertical | horizontal | null
    duration: text("duration"), // 15|30|45 seconds for video, null for carousel
    influencerId: text("influencer_id"), // single influencer for talkinghead
    scheduledAt: text("scheduled_at"), // ISO datetime, nullable (optional — drafts may omit)
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_content_user").on(t.userId),
    index("idx_content_company").on(t.companyId),
    index("idx_content_kind").on(t.kind),
    index("idx_content_scheduled_at").on(t.scheduledAt),
  ],
);

// ponytail: GeneratedContent — UGC pieces written automatically once Brand Intelligence +
// content angles are ready. brandId === companyId (Brand Intelligence is 1:1 with company),
// and contentAngleId points at an id inside brand_intelligence.content_angles — the brand
// document is never copied into these rows. Stores text + visual SEARCH metadata only; the
// later Visual Content Studio fills visualIntentId / visualAssetId (both nullable for now).
export const generatedContents = sqliteTable(
  "generated_content",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    jobId: text("job_id"), // content_generation_job that produced this row
    contentAngleId: text("content_angle_id").notNull(),
    platform: text("platform").notNull(), // instagram | tiktok | linkedin | x | youtube_shorts | facebook
    contentFormat: text("content_format").notNull(), // wall_of_text_slide | video_hook | talking_head | ...
    contentType: text("content_type").notNull(), // observation | story | educational | mistake | ...
    generationMode: text("generation_mode").notNull().default("initial"),
    language: text("language").notNull().default("en"),
    hook: text("hook"),
    title: text("title"),
    body: text("body"),
    lines: text("lines"), // JSON string[]
    script: text("script"),
    onScreenText: text("on_screen_text"), // JSON string[]
    cta: text("cta"),
    visualTags: text("visual_tags"), // JSON string[] — search signals, never image prompts
    visualMood: text("visual_mood"),
    visualStyle: text("visual_style"),
    visualCategory: text("visual_category"),
    visualOrientation: text("visual_orientation").notNull().default("portrait"),
    status: text("status").notNull().default("generated"), // generated | visual_matched | used | archived
    // ponytail: visual discovery pipeline state (independent of Trending Topics) —
    // pending | searching | matched | needs_review | failed. `visualAssetId` stays null
    // until a Pexels candidate passes the relevance threshold (status → matched).
    visualSearchStatus: text("visual_search_status").notNull().default("pending"),
    visualSearchError: text("visual_search_error"),
    source: text("source").notNull().default("ai"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    contentHash: text("content_hash"), // normalized hook+body — retry-safe duplicate guard
    visualIntentId: text("visual_intent_id"),
    visualAssetId: text("visual_asset_id"),
    usageCount: text("usage_count").notNull().default("0"),
    isEdited: text("is_edited").notNull().default("0"),
    editedAt: text("edited_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_generated_content_user").on(t.userId),
    index("idx_generated_content_company").on(t.companyId),
    index("idx_generated_content_angle").on(t.companyId, t.contentAngleId),
    index("idx_generated_content_status").on(t.companyId, t.status),
    // "give me this brand's content that has no visual yet" — the third tab's base query
    index("idx_generated_content_visual_ready").on(t.companyId, t.visualAssetId),
    // visual discovery feed: "this brand's content still needing a visual search"
    index("idx_generated_content_visual_search").on(t.companyId, t.visualSearchStatus),
    uniqueIndex("uq_generated_content_hash").on(t.companyId, t.contentHash),
  ],
);

// ponytail: VisualAsset — one row per selected source image (Pexels today). Dedup key is
// (source, sourceAssetId) so re-running visual search reuses an existing asset instead of
// inserting duplicates. GeneratedContent.visualAssetId points here. Remote URLs are stored;
// localUrl is a best-effort cached copy under /media/files for the future composition stage.
export const visualAssets = sqliteTable(
  "visual_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    source: text("source").notNull().default("pexels"),
    sourceAssetId: text("source_asset_id").notNull(),
    sourceUrl: text("source_url"), // Pexels page URL (canonical source)
    previewUrl: text("preview_url"), // medium/rendered image used by the feed
    downloadUrl: text("download_url"), // original/full-resolution download link
    localUrl: text("local_url"), // cached copy under /media/files (nullable, best-effort)
    width: text("width"),
    height: text("height"),
    orientation: text("orientation"), // portrait | landscape | square
    altText: text("alt_text"),
    tags: text("tags"), // JSON string[]
    metadata: text("metadata"), // JSON: photographer, avgColor, score breakdown, queries, etc.
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_visual_asset_company").on(t.companyId),
    uniqueIndex("uq_visual_asset_source_id").on(t.source, t.sourceAssetId),
  ],
);

// ponytail: one row per (brand, day, batch) of the visual discovery feed. cursorKey is the
// incoming cursor token ("start" for the first batch) — the unique index makes a repeated
// prefetch of the same batch a no-op (duplicate-request guard, mirrors instagram scrape jobs).
export const visualSearchBatches = sqliteTable(
  "visual_search_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (feed timezone)
    batchNumber: text("batch_number").notNull().default("1"),
    cursorKey: text("cursor_key").notNull().default("start"),
    status: text("status").notNull().default("pending"), // pending | processing | ready | partial | failed
    size: text("size").notNull().default("0"),
    matchedCount: text("matched_count").notNull().default("0"),
    needsReviewCount: text("needs_review_count").notNull().default("0"),
    failedCount: text("failed_count").notNull().default("0"),
    contentIds: text("content_ids"), // JSON string[] in feed order
    nextCursor: text("next_cursor"),
    hasMore: text("has_more").notNull().default("0"),
    error: text("error"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_visual_batch_company_status").on(t.companyId, t.status),
    uniqueIndex("uq_visual_batch_company_date_cursor").on(t.companyId, t.date, t.cursorKey),
  ],
);

// ponytail: daily preparation counter per brand — caps visual/feed preparation at
// dailyLimit (100) items per day. One row per (company, date); resets naturally next day.
export const visualFeedDaily = sqliteTable(
  "visual_feed_daily",
  {
    companyId: text("company_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (feed timezone)
    userId: text("user_id").notNull(),
    preparedCount: text("prepared_count").notNull().default("0"),
    dailyLimit: text("daily_limit").notNull().default("100"),
    status: text("status").notNull().default("active"), // active | completed
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.date] })],
);

// ponytail: one row per (company, type) — reused/resumed rather than duplicated, so a crashed
// or restarted run continues from the content already saved instead of starting over.
export const contentGenerationJobs = sqliteTable(
  "content_generation_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    type: text("type").notNull().default("initial_content_generation"),
    targetCount: text("target_count").notNull().default("100"),
    generatedCount: text("generated_count").notNull().default("0"),
    status: text("status").notNull().default("pending"), // pending | processing | completed | failed
    error: text("error"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_content_gen_job_user").on(t.userId),
    index("idx_content_gen_job_status").on(t.status),
    uniqueIndex("uq_content_gen_job_company_type").on(t.companyId, t.type),
  ],
);

// ponytail: per-task routing — provider + model independent; model string per task
export const aiPreferences = sqliteTable("ai_preferences", {
  userId: text("user_id").primaryKey(),
  videoConfigId: text("video_config_id"),
  videoModel: text("video_model"),
  imageConfigId: text("image_config_id"),
  imageModel: text("image_model"),
  textConfigId: text("text_config_id"),
  textModel: text("text_model"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ponytail: onboarding resume — single row per user, JSON blob for partial progress
export const onboardingProgress = sqliteTable("onboarding_progress", {
  userId: text("user_id").primaryKey(),
  step: text("step").notNull().default("1"),
  data: text("data"), // JSON string
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const mediaJobs = sqliteTable(
  "media_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    contentId: text("content_id"),
    configId: text("config_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    routerConfigId: text("router_config_id"),
    task: text("task").notNull(), // image | video
    prompt: text("prompt").notNull(),
    inputUrl: text("input_url"),
    format: text("format"),
    outputIndex: text("output_index"), // carousel slide index, or null for video
    providerTaskId: text("provider_task_id"),
    status: text("status").notNull().default("queued"), // queued | processing | completed | failed
    outputUrl: text("output_url"),
    error: text("error"),
    attempts: text("attempts").notNull().default("0"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_media_job_user").on(t.userId),
    index("idx_media_job_content").on(t.contentId),
    index("idx_media_job_status").on(t.status),
  ],
);

// ponytail: integrations credentials — per-user Apify token, masked on read (see ai_config pattern)
export const socialCredentials = sqliteTable(
  "social_credential",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull().default("apify"),
    apiKey: text("api_key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("uq_social_credential_user_provider").on(t.userId, t.provider)],
);

// ponytail: Instagram creator — scoped to company (workspace-like) + user
export const instagramSources = sqliteTable(
  "instagram_source",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    username: text("username").notNull(),
    profileUrl: text("profile_url").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull().default("active"),
    lastScrapedAt: text("last_scraped_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_instagram_source_user").on(t.userId),
    index("idx_instagram_source_company").on(t.companyId),
    uniqueIndex("uq_instagram_source_company_username").on(t.companyId, t.username),
  ],
);

// ponytail: Instagram post — dedup key is company_id + external_post_id (shortcode)
export const instagramPosts = sqliteTable(
  "instagram_post",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    sourceId: text("source_id").notNull(),
    externalPostId: text("external_post_id").notNull(),
    shortcode: text("shortcode"),
    postUrl: text("post_url"),
    username: text("username"),
    ownerFullName: text("owner_full_name"),
    caption: text("caption"),
    mediaType: text("media_type"),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: text("published_at"),
    likes: text("likes"),
    comments: text("comments"),
    shares: text("shares"),
    views: text("views"),
    hashtags: text("hashtags"), // JSON array of strings
    mentions: text("mentions"), // JSON array of strings
    source: text("source").notNull().default("apify"),
    rawData: text("raw_data"), // raw Apify response JSON
    scrapedAt: text("scraped_at"),
    savedAt: text("saved_at"), // bookmarked as UGC inspiration — null means not saved
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_instagram_post_user").on(t.userId),
    index("idx_instagram_post_company").on(t.companyId),
    index("idx_instagram_post_source").on(t.sourceId),
    uniqueIndex("uq_instagram_post_company_external").on(t.companyId, t.externalPostId),
  ],
);

// ponytail: scrape job tracking for cost/usage visibility and duplicate-request guard
export const instagramScrapeJobs = sqliteTable(
  "instagram_scrape_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    sourceId: text("source_id").notNull(),
    actorId: text("actor_id").notNull(),
    apifyRunId: text("apify_run_id"),
    datasetId: text("dataset_id"),
    status: text("status").notNull().default("pending"), // pending | running | completed | failed
    postsFound: text("posts_found"),
    error: text("error"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_instagram_scrape_job_user").on(t.userId),
    index("idx_instagram_scrape_job_source").on(t.sourceId),
  ],
);

export type SocialCredential = typeof socialCredentials.$inferSelect;
export type InstagramSource = typeof instagramSources.$inferSelect;
export type InstagramPost = typeof instagramPosts.$inferSelect;
export type InstagramScrapeJob = typeof instagramScrapeJobs.$inferSelect;

export const influencers = sqliteTable(
  "influencer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    companyId: text("company_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    prompt: text("prompt"),
    attributes: text("attributes"), // JSON string
    source: text("source").notNull().default("generated"), // upload | generated
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_influencer_user").on(t.userId),
    index("idx_influencer_company").on(t.companyId),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type BrandIntelligence = typeof brandIntelligence.$inferSelect;
export type NewBrandIntelligence = typeof brandIntelligence.$inferInsert;
export type AiConfig = typeof aiConfigs.$inferSelect;
export type NewAiConfig = typeof aiConfigs.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type AiPreferences = typeof aiPreferences.$inferSelect;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type MediaJob = typeof mediaJobs.$inferSelect;
export type Influencer = typeof influencers.$inferSelect;
export type GeneratedContent = typeof generatedContents.$inferSelect;
export type NewGeneratedContent = typeof generatedContents.$inferInsert;
export type ContentGenerationJob = typeof contentGenerationJobs.$inferSelect;
export type VisualAsset = typeof visualAssets.$inferSelect;
export type NewVisualAsset = typeof visualAssets.$inferInsert;
export type VisualSearchBatch = typeof visualSearchBatches.$inferSelect;
export type VisualFeedDaily = typeof visualFeedDaily.$inferSelect;
