import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const auto_label_jobs = sqliteTable("auto_label_jobs", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  kind: text("kind").$type<AutoLabelRuleKindWire>().notNull(),
  rule_id: text("rule_id").notNull(),
  rule_name: text("rule_name").notNull(),
  rule_version: integer("rule_version").notNull(),
  scope: text("scope").$type<AutoLabelJobScopeWire>().notNull(),
  scope_limit: integer("scope_limit"),
  status: text("status").$type<AutoLabelJobStatusWire>().notNull().default("queued"),
  scanned: integer("scanned").notNull().default(0),
  matches: integer("matches").notNull().default(0),
  applied: integer("applied").notNull().default(0),
  total: integer("total").notNull().default(0),
  error: text("error"),
  created_at: integer("created_at").notNull(),
  started_at: integer("started_at"),
  finished_at: integer("finished_at"),
});
