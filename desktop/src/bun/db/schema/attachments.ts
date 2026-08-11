import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { emails } from "./emails";

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  email_id: text("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime_type: text("mime_type"),
  size: integer("size"),
  disposition: text("disposition"),
  part_id: text("part_id"),
  headers: text("headers"),
  local_path: text("local_path"),
  cache_path: text("cache_path"),
  remote_url: text("remote_url"),
  cid: text("cid"),
  data: text("data"),
});
