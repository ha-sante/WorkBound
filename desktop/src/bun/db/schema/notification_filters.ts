import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const notification_filters = sqliteTable("notification_filters", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon_name: text("icon_name"),
  clauses: text("clauses").notNull().default("[]"),
  enabled: integer("enabled").notNull().default(1),
  position: integer("position").notNull().default(0),
  created_at: text("created_at").default("datetime('now')"),
  updated_at: text("updated_at").default("datetime('now')"),
});
