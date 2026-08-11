import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const images = sqliteTable("images", {
  url: text("url").primaryKey(),
  data: text("data").notNull(),
  mime: text("mime").notNull(),
  created_at: text("created_at").notNull().default("datetime('now')"),
});