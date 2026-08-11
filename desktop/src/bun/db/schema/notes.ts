import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  email_id: text("email_id"),
  account_id: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  created_at: text("created_at").default("datetime('now')"),
  updated_at: text("updated_at").default("datetime('now')"),
});
