import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const filtered_views = sqliteTable("filtered_views", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon_name: text("icon_name"),
  clauses: text("clauses").notNull().default("[]"),
  folder: text("folder").notNull().default("inbox"),
  visible: integer("visible").notNull().default(1),
  position: integer("position").notNull().default(0),
  created_at: text("created_at").default("datetime('now')"),
  updated_at: text("updated_at").default("datetime('now')"),
});
