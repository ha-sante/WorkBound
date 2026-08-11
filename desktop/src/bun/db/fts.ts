import { getDb, get_raw_db } from "./client";
import { sql } from "drizzle-orm";

export function get_email_rowid(email_id: string): number | undefined {
  const row = getDb().get(sql`SELECT rowid FROM emails WHERE id = ${email_id}`) as { rowid: number } | undefined;
  return row?.rowid;
}

export function insert_email_meta_fts(email: {
  id: string;
  subject?: string | null;
  from_name?: string | null;
  from_address?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
}) {
  const rowid = get_email_rowid(email.id);
  if (!rowid) return;
  getDb().run(sql`
    DELETE FROM email_meta_fts WHERE email_id = ${email.id}
  `);
  getDb().run(sql`
    DELETE FROM email_meta_fts WHERE rowid = ${rowid}
  `);
  getDb().run(sql`
    INSERT INTO email_meta_fts(rowid, email_id, subject, from_name, from_address, to_addr, cc, bcc)
    VALUES (${rowid}, ${email.id}, ${email.subject ?? null}, ${email.from_name ?? null}, ${email.from_address ?? null}, ${email.to ?? null}, ${email.cc ?? null}, ${email.bcc ?? null})
  `);
}

export function update_email_meta_fts(email_id: string) {
  const email = getDb().get(sql`
    SELECT rowid, id, subject, from_name, from_address, "to", cc, bcc FROM emails WHERE id = ${email_id}
  `) as FtsSearchRow | undefined;
  if (!email) return;
  getDb().run(sql`DELETE FROM email_meta_fts WHERE email_id = ${email.id}`);
  getDb().run(sql`
    INSERT INTO email_meta_fts(rowid, email_id, subject, from_name, from_address, to_addr, cc, bcc)
    VALUES (${email.rowid}, ${email.id}, ${email.subject}, ${email.from_name}, ${email.from_address}, ${email.to}, ${email.cc}, ${email.bcc})
  `);
}

export function delete_email_meta_fts(email_id: string) {
  getDb().run(sql`DELETE FROM email_meta_fts WHERE email_id = ${email_id}`);
}

export function bulk_delete_email_meta_fts(ids: string[]) {
  if (ids.length === 0) return;
  for (const id of ids) {
    getDb().run(sql`DELETE FROM email_meta_fts WHERE email_id = ${id}`);
  }
}

export function upsert_email_body_fts(rowid: number, email_id: string, body_text: string | null, body_html_stripped: string | null) {
  getDb().run(sql`DELETE FROM email_body_fts WHERE email_id = ${email_id}`);
  getDb().run(sql`
    DELETE FROM email_body_fts WHERE rowid = ${rowid}
  `);
  getDb().run(sql`
    INSERT INTO email_body_fts(rowid, email_id, body_text, body_html_stripped)
    VALUES (${rowid}, ${email_id}, ${body_text}, ${body_html_stripped})
  `);
}

export function delete_email_body_fts(email_id: string) {
  getDb().run(sql`DELETE FROM email_body_fts WHERE email_id = ${email_id}`);
}

export function evict_viewable_body_cache(cutoff: string): { emails: number; fts: number } {
  const raw = get_raw_db();
  const ftsResult = raw.run(
    `DELETE FROM email_body_fts WHERE email_id IN (
      SELECT id FROM emails WHERE received_at < ? AND mail_cached_at IS NOT NULL AND folder != 'drafts'
    )`,
    [cutoff],
  );
  const emailsResult = raw.run(
    `UPDATE emails SET body_text = NULL, body_html = NULL, mail_cached_at = NULL, cid_refs_fetched = 0
     WHERE received_at < ? AND mail_cached_at IS NOT NULL AND folder != 'drafts'`,
    [cutoff],
  );
  if ((ftsResult.changes ?? 0) > 0) {
    raw.run("INSERT INTO email_body_fts(email_body_fts) VALUES('merge')");
  }
  return { emails: emailsResult.changes ?? 0, fts: ftsResult.changes ?? 0 };
}

export function bulk_delete_email_body_fts(ids: string[]) {
  if (ids.length === 0) return;
  for (const id of ids) {
    getDb().run(sql`DELETE FROM email_body_fts WHERE email_id = ${id}`);
  }
}

export function insert_contact_fts(rowid: number, name: string | null, email: string) {
  getDb().run(sql`
    INSERT INTO contacts_fts(rowid, name, email)
    VALUES (${rowid}, ${name}, ${email})
  `);
}

export function delete_contact_fts(contact_id: string) {
  getDb().run(sql`DELETE FROM contacts_fts WHERE rowid IN (SELECT rowid FROM contacts WHERE id = ${contact_id})`);
}
