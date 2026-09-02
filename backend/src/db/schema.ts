import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
export type AiConfig = typeof aiConfigs.$inferSelect;
export type NewAiConfig = typeof aiConfigs.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type AiPreferences = typeof aiPreferences.$inferSelect;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type MediaJob = typeof mediaJobs.$inferSelect;
export type Influencer = typeof influencers.$inferSelect;
