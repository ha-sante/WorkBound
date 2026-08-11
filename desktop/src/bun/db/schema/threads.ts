import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  subject: text("subject"),
  latest_received_at: text("latest_received_at"),
  message_count: integer("message_count").default(1),
  snippet: text("snippet"),
});
