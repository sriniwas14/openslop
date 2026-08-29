import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const aiConfigs = sqliteTable(
  "ai_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    apiKey: text("api_key"),
    baseUrl: text("base_url"),
    model: text("model"),
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
    format: text("format"), // vertical | horizontal | null
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

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type AiConfig = typeof aiConfigs.$inferSelect;
export type NewAiConfig = typeof aiConfigs.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type AiPreferences = typeof aiPreferences.$inferSelect;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
