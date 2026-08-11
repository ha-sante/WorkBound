import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const newfill_state = sqliteTable("newfill_state", {
  account_id: text("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  newfill_current_history_id: text("newfill_current_history_id"),
  newfill_last_synced_at: text("newfill_last_synced_at"),
  newfill_status: text("newfill_status").default("idle"),
});
