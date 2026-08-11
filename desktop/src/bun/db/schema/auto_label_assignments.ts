import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { emails } from "./emails";

export const auto_label_assignments = sqliteTable("auto_label_assignments", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email_id: text("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  rule_id: text("rule_id").notNull(),
  rule_version: integer("rule_version").notNull(),
  label_ids: text("label_ids"),
  created_at: integer("created_at").notNull(),
}, (t) => ({
  uniqEmailRule: uniqueIndex("uq_auto_label_assignments_email_rule").on(t.email_id, t.rule_id, t.rule_version),
}));
