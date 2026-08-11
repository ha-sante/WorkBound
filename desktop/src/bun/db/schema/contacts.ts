import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name"),
  email: text("email").notNull(),
  last_contacted_at: text("last_contacted_at"),
  times_contacted: integer("times_contacted").notNull().default(1),
  emails_received: integer("emails_received").notNull().default(0),
  emails_sent: integer("emails_sent").notNull().default(0),
  avatar_url: text("avatar_url"),
  photo_fetched_at: text("photo_fetched_at"),
  created_at: text("created_at").default("datetime('now')"),
  updated_at: text("updated_at").default("datetime('now')"),
}, (table) => ({
  uniqueAccountEmail: uniqueIndex("uq_contacts_account_email").on(table.account_id, table.email),
}));
