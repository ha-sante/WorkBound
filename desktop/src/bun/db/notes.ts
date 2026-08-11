import { getDb } from "./client";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger";

export type NoteRow = {
  id: string;
  email_id: string | null;
  account_id: string | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
};

export function list_notes(account_id: string): NoteRow[] {
  return getDb().all(sql`SELECT * FROM notes WHERE account_id = ${account_id} ORDER BY created_at DESC`) as NoteRow[];
}

export function get_note_by_email(email_id: string): NoteRow | undefined {
  return getDb().get(sql`SELECT * FROM notes WHERE email_id = ${email_id}`) as NoteRow | undefined;
}

export function create_note(data: { email_id?: string; account_id?: string; content: string }): NoteRow {
  const id = crypto.randomUUID();
  getDb().run(sql`INSERT INTO notes (id, email_id, account_id, content) VALUES (${id}, ${data.email_id ?? null}, ${data.account_id ?? null}, ${data.content})`);
  logger.info("db", `create_note id=${id} email_id=${data.email_id ?? null}`);
  return getDb().get(sql`SELECT * FROM notes WHERE id = ${id}`) as NoteRow;
}

export function update_note(id: string, content: string): void {
  getDb().run(sql`UPDATE notes SET content = ${content}, updated_at = datetime('now') WHERE id = ${id}`);
  logger.info("db", `update_note id=${id}`);
}

export function delete_note(id: string): void {
  getDb().run(sql`DELETE FROM notes WHERE id = ${id}`);
  logger.info("db", `delete_note id=${id}`);
}
