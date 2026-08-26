import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ponytail: no DB-level FK — better-auth owns `user`; ownership is enforced in queries
export const companies = sqliteTable(
  "company",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    website: text("website"),
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
