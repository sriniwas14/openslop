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
    kind: text("kind").notNull(), // video | carousel | talkinghead | greenscreen
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"), // draft | published
    images: text("images"), // JSON: { url, text, font?, background?, color? }[]
    scripts: text("scripts"), // JSON: { type: "aroll"|"broll", prompt }[]
    format: text("format"), // vertical | horizontal | null
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
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type AiConfig = typeof aiConfigs.$inferSelect;
export type NewAiConfig = typeof aiConfigs.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
