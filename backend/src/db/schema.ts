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

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type AiConfig = typeof aiConfigs.$inferSelect;
export type NewAiConfig = typeof aiConfigs.$inferInsert;
