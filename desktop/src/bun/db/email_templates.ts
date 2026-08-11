import { getDb } from "./client";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger";

export type EmailTemplateRow = {
  id: string;
  account_id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string | null;
  updated_at: string | null;
};

export function list_email_templates(account_id: string): EmailTemplateRow[] {
  return getDb().all(sql`SELECT * FROM email_templates WHERE account_id = ${account_id}`) as EmailTemplateRow[];
}

export function create_email_template(data: { account_id: string; name: string; subject?: string; body?: string }): EmailTemplateRow {
  const id = crypto.randomUUID();
  getDb().run(sql`
    INSERT INTO email_templates (id, account_id, name, subject, body)
    VALUES (${id}, ${data.account_id}, ${data.name}, ${data.subject ?? ""}, ${data.body ?? ""})
  `);
  logger.info("db", `create_email_template id=${id} name=${data.name}`);
  return getDb().get(sql`SELECT * FROM email_templates WHERE id = ${id}`) as EmailTemplateRow;
}

export function update_email_template(id: string, data: { name?: string; subject?: string; body?: string }): void {
  const sets: ReturnType<typeof sql>[] = [];
  if (data.name !== undefined) sets.push(sql`name = ${data.name}`);
  if (data.subject !== undefined) sets.push(sql`subject = ${data.subject}`);
  if (data.body !== undefined) sets.push(sql`body = ${data.body}`);
  if (sets.length === 0) return;
  getDb().run(sql`UPDATE email_templates SET ${sql.join(sets, sql`, `)}, updated_at = datetime('now') WHERE id = ${id}`);
  logger.info("db", `update_email_template id=${id}`);
}

export function delete_email_template(id: string): void {
  getDb().run(sql`DELETE FROM email_templates WHERE id = ${id}`);
  logger.info("db", `delete_email_template id=${id}`);
}
