import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const backfill_state = sqliteTable("backfill_state", {
  account_id: text("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  backfill_done: integer("backfill_done").default(0),
  backfill_next_page_token: text("backfill_next_page_token"),
  backfill_oldest_synced_at: text("backfill_oldest_synced_at"),
  backfill_status: text("backfill_status").default("idle"),
  backfill_initial_total_messages: integer("backfill_initial_total_messages"),
  backfill_fetched_total: integer("backfill_fetched_total").default(0),

  attachments_marker_backfill_done: integer("attachments_marker_backfill_done").default(0),
  attachments_marker_next_page_token: text("attachments_marker_next_page_token"),
  attachments_marker_backfill_status: text("attachments_marker_backfill_status").default("idle"),
});
