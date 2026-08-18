import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  command: text("command").$type<OutboxCommand>().notNull(),
  payload: text("payload"),
  extras: text("extras"),
  to_addr: text("to_addr"),
  subject: text("subject"),
  thread_id: text("thread_id"),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  created_at: integer("created_at").notNull(),
  sent_at: integer("sent_at"),
  scheduled_at: integer("scheduled_at"),
  available_at: integer("available_at"),
  attempt_count: integer("attempt_count").notNull().default(0),
  next_retry_at: integer("next_retry_at"),
  locked_at: integer("locked_at"),
  locked_by: text("locked_by"),
});
