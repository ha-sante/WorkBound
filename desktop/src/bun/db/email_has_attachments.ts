import { getDb } from "./client";
import { email_has_attachments } from "./schema";
import { eq } from "drizzle-orm";

export type EmailHasAttachmentsInsert = typeof email_has_attachments.$inferInsert;

export function email_has_attachments_exists(email_id: string): boolean {
  const row = getDb()
    .select({ email_id: email_has_attachments.email_id })
    .from(email_has_attachments)
    .where(eq(email_has_attachments.email_id, email_id))
    .get();
  return !!row;
}

export function bulk_insert_email_has_attachments(email_ids: string[]): void {
  if (email_ids.length === 0) return;

  const now = new Date().toISOString();
  const rows: EmailHasAttachmentsInsert[] = email_ids.map((email_id) => ({ email_id, created_at: now }));

  getDb()
    .insert(email_has_attachments)
    .values(rows)
    .onConflictDoNothing({ target: [email_has_attachments.email_id] })
    .run();
}
