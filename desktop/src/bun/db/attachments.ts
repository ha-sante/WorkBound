import { getDb } from "./client";
import { attachments } from "./schema";
import { eq, sql, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type AttachmentRow = InferSelectModel<typeof attachments>;

export function insert_attachment(data: typeof attachments.$inferInsert) {
  getDb().insert(attachments).values(data).run();
}

export function bulk_insert_attachments(rows: typeof attachments.$inferInsert[]) {
  if (rows.length === 0) return;
  getDb().insert(attachments).values(rows).run();
}

export function get_attachments_by_email(email_id: string): AttachmentRow[] {
  return getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.email_id, email_id))
    .orderBy(attachments.filename)
    .all();
}

export function get_attachment(id: string): AttachmentRow | undefined {
  return getDb().select().from(attachments).where(eq(attachments.id, id)).get();
}

export function get_all_media(opts: {
  account_id: string;
  mime_type?: string;
  cursor?: number;
  limit?: number;
}): AttachmentRow[] {
  const { account_id, mime_type, cursor, limit = 50 } = opts;
  const conditions = [
    sql`${attachments.id} IN (SELECT id FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE account_id = ${account_id}))`,
  ];

  if (mime_type) {
    conditions.push(sql`${attachments.mime_type} LIKE ${mime_type + '%'}`);
  }
  if (cursor !== undefined) {
    conditions.push(sql`${attachments.id} IN (SELECT id FROM attachments WHERE rowid < ${cursor})`);
  }

  return getDb()
    .select()
    .from(attachments)
    .where(and(...conditions))
    .orderBy(sql`rowid DESC`)
    .limit(limit)
    .all();
}

export function update_attachment(
  id: string,
  data: Partial<Pick<AttachmentRow, "cache_path" | "local_path">>,
) {
  getDb()
    .update(attachments)
    .set(data)
    .where(eq(attachments.id, id))
    .run();
}

export function delete_attachment(id: string) {
  getDb().delete(attachments).where(eq(attachments.id, id)).run();
}

export function evict_stale_attachment_metadata(cutoff: string): number {
  const result = getDb()
    .delete(attachments)
    .where(
      sql`${attachments.email_id} IN (
        SELECT id FROM emails
        WHERE received_at < ${cutoff} AND folder != 'drafts'
      )`,
    )
    .run();
  return result.changes ?? 0;
}

export function list_stale_attachment_paths(cutoff: string): string[] {
  const rows = getDb()
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        sql`${attachments.cache_path} IS NOT NULL`,
        sql`${attachments.email_id} IN (
          SELECT id FROM emails
          WHERE received_at < ${cutoff} AND folder != 'drafts'
        )`,
      ),
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

export function upsert_attachment_metadatas(rows: typeof attachments.$inferInsert[]) {
  if (rows.length === 0) return;
  for (const row of rows) {
    const existing = getDb()
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.email_id, row.email_id), eq(attachments.filename, row.filename)))
      .get();

    if (existing) {
      getDb().update(attachments).set({
        remote_url: row.remote_url ?? null,
        size: row.size ?? null,
        mime_type: row.mime_type ?? null,
      }).where(and(eq(attachments.email_id, row.email_id), eq(attachments.filename, row.filename))).run();
    } else {
      getDb().insert(attachments).values(row).run();
    }
  }
}
