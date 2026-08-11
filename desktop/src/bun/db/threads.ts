import { getDb } from "./client";
import { threads, emails } from "./schema";
import { eq, asc, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { preview_base, to_email_preview } from "./emails";

export type ThreadRow = InferSelectModel<typeof threads>;

export function get_or_create_thread(id: string, account_id: string, subject?: string | null): ThreadRow {
  const existing = getDb().select().from(threads).where(eq(threads.id, id)).get();
  if (existing) return existing;
  getDb()
    .insert(threads)
    .values({ id, account_id, subject: subject ?? null })
    .run();
  return { id, account_id, subject: subject ?? null, latest_received_at: null, message_count: 1, snippet: null };
}

export function get_thread(id: string): ThreadRow | undefined {
  return getDb().select().from(threads).where(eq(threads.id, id)).get();
}

export function get_thread_emails(thread_id: string) {
  return getDb()
    .select()
    .from(emails)
    .where(eq(emails.thread_id, thread_id))
    .orderBy(asc(emails.received_at))
    .all();
}

export function update_thread(
  id: string,
  data: Partial<Pick<ThreadRow, "subject" | "latest_received_at" | "message_count" | "snippet">>,
) {
  getDb()
    .update(threads)
    .set(data)
    .where(eq(threads.id, id))
    .run();
}

export function refresh_thread(thread_id: string) {
  const stats = getDb()
    .select({
      count: sql<number>`COUNT(*)`,
      latest_received_at: sql<string | null>`MAX(received_at)`,
      snippet: sql<string | null>`snippet`,
    })
    .from(emails)
    .where(eq(emails.thread_id, thread_id))
    .get();

  if (stats) {
    update_thread(thread_id, {
      message_count: stats.count,
      latest_received_at: stats.latest_received_at,
      snippet: stats.snippet,
    });
  }
}

export function get_thread_email_previews(thread_id: string) {
  const rows = preview_base()
    .where(eq(emails.thread_id, thread_id))
    .orderBy(asc(emails.received_at))
    .all();
  return rows.map(to_email_preview);
}
