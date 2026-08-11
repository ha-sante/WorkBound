import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const email_templates = sqliteTable("email_templates", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  created_at: text("created_at").default("datetime('now')"),
  updated_at: text("updated_at").default("datetime('now')"),
});
