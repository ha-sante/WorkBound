import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";

export const send_as_aliases = sqliteTable("send_as_aliases", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  send_as_email: text("send_as_email").notNull(),
  display_name: text("display_name"),
  reply_to_address: text("reply_to_address"),
  signature: text("signature"),
  is_primary: integer("is_primary").default(0),
  is_default: integer("is_default").default(0),
  treat_as_alias: integer("treat_as_alias").default(0),
  smtp_msa_host: text("smtp_msa_host"),
  smtp_msa_port: integer("smtp_msa_port"),
  smtp_msa_security_mode: text("smtp_msa_security_mode"),
  verification_status: text("verification_status"),
  created_at: text("created_at").default(new Date().toISOString()),
});
