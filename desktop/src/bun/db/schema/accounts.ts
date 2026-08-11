import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatar_url: text("avatar_url"),
  has_credentials: integer("has_credentials").notNull().default(0),
  is_active: integer("is_active").default(1),
  created_at: text("created_at").default("datetime('now')"),
});
