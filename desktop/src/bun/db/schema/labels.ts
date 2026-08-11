import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  account_id: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon_name: text("icon_name"),
  type: text("type").default("user"),
});
