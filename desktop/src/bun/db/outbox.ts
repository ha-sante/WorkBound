import { getDb } from "./client";
import { outbox } from "./schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { InferSelectModel, SQL } from "drizzle-orm";

export type OutboxRow = InferSelectModel<typeof outbox>;

export function insert_outbox(data: typeof outbox.$inferInsert) {
  getDb().insert(outbox).values(data).run();
}

export function get_outbox(id: string): OutboxRow | undefined {
  return getDb().select().from(outbox).where(eq(outbox.id, id)).get();
}

export function list_outbox(limit = 50): OutboxRow[] {
  return getDb()
    .select()
    .from(outbox)
    .orderBy(sql`created_at DESC`)
    .limit(limit)
    .all();
}

export function list_outbox_filtered(opts: { thread_id?: string; status?: string | string[] } = {}): OutboxRow[] {
  const conditions: SQL[] = [];
  if (opts.thread_id) conditions.push(eq(outbox.thread_id, opts.thread_id));
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    conditions.push(inArray(outbox.status, statuses));
  }
  const base = getDb().select().from(outbox);
  const q = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return q.orderBy(sql`created_at DESC`).all();
}

export function clear_scheduled_at(id: string) {
  getDb()
    .update(outbox)
    .set({ scheduled_at: null, status: "queued", error: null })
    .where(eq(outbox.id, id))
    .run();
}

export function cancel_outbox(id: string) {
  getDb()
    .update(outbox)
    .set({ status: "cancelled" })
    .where(and(eq(outbox.id, id), eq(outbox.status, "queued")))
    .run();
}

export function update_outbox_status(
  id: string,
  status: string,
  error?: string,
) {
  const update: Partial<Pick<OutboxRow, "status" | "error" | "sent_at">> = {
    status,
    ...(error !== undefined ? { error } : {}),
    ...(status === "sent" ? { sent_at: Date.now() } : {}),
  };
  getDb().update(outbox).set(update).where(eq(outbox.id, id)).run();
}

export function pick_queued_outbox(): OutboxRow[] {
  return getDb()
    .select()
    .from(outbox)
    .where(sql`${outbox.status} = 'queued' AND (${outbox.scheduled_at} IS NULL OR ${outbox.scheduled_at} <= ${Date.now()})`)
    .orderBy(sql`created_at ASC`)
    .limit(5)
    .all();
}

export function delete_outbox(id: string) {
  getDb().delete(outbox).where(eq(outbox.id, id)).run();
}

export function cancel_outbox_for_job(job_id: string): number {
  const rows = getDb()
    .select()
    .from(outbox)
    .where(sql`${outbox.command} = 'label_batch' AND ${outbox.status} = 'queued'`)
    .all();
  let count = 0;
  for (const r of rows) {
    try {
      const extras = JSON.parse(r.extras ?? "{}") as Record<string, unknown>;
      if (extras.auto_label_job_id === job_id) {
        update_outbox_status(r.id, "cancelled");
        count++;
      }
    } catch { /* skip unparseable extras */ }
  }
  return count;
}

export function delete_captured_outbox_for_message(account_id: string, gmail_message_id: string): number {
  const rows = getDb()
    .select()
    .from(outbox)
    .where(sql`${outbox.status} IN ('queued', 'cancelled')`)
    .all();
  let count = 0;
  for (const r of rows) {
    try {
      const extras = JSON.parse(r.extras ?? "{}") as Record<string, unknown>;
      if (
        r.account_id === account_id &&
        r.command === "send_email" &&
        extras.source === "gmail_capture" &&
        extras.gmail_message_id === gmail_message_id
      ) {
        getDb().delete(outbox).where(eq(outbox.id, r.id)).run();
        count++;
      }
    } catch { /* skip unparseable extras */ }
  }
  return count;
}
