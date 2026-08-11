import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { emails } from "./emails";

export const email_headers = sqliteTable("email_headers", {
  email_id: text("email_id").primaryKey().references(() => emails.id, { onDelete: "cascade" }),
  headers: text("headers").notNull(),
});
