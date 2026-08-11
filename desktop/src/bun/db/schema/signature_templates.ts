import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const signature_templates = sqliteTable("signature_templates", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  body: text("body").notNull().default(""),
  created_at: text("created_at").default(new Date().toISOString()),
  updated_at: text("updated_at").default(new Date().toISOString()),
});
