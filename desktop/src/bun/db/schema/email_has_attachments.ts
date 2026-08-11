import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { emails } from "./emails";

export const email_has_attachments = sqliteTable("email_has_attachments", {
  email_id: text("email_id")
    .primaryKey()
    .references(() => emails.id, { onDelete: "cascade" }),
  created_at: text("created_at"),
});
