import { getDb } from "./client";
import { auto_label_jobs } from "./schema";
import { eq, and, sql } from "drizzle-orm";

export function insert_auto_label_job(data: typeof auto_label_jobs.$inferInsert): AutoLabelJobWire {
  getDb().insert(auto_label_jobs).values(data).run();
  return getDb().select().from(auto_label_jobs).where(eq(auto_label_jobs.id, data.id)).get()!;
}

export function get_auto_label_job(id: string): AutoLabelJobWire | undefined {
  return getDb().select().from(auto_label_jobs).where(eq(auto_label_jobs.id, id)).get();
}

export function list_auto_label_jobs(account_id: string, limit = 50): AutoLabelJobWire[] {
  return getDb()
    .select()
    .from(auto_label_jobs)
    .where(eq(auto_label_jobs.account_id, account_id))
    .orderBy(sql`created_at DESC`)
    .limit(limit)
    .all();
}

export function pick_queued_auto_label_job(): AutoLabelJobWire | undefined {
  return getDb()
    .select()
    .from(auto_label_jobs)
    .where(and(eq(auto_label_jobs.status, "queued"), sql`${auto_label_jobs.created_at} <= ${Date.now()}`))
    .orderBy(sql`created_at ASC`)
    .limit(1)
    .get();
}

export function update_auto_label_job(
  id: string,
  patch: Partial<Pick<AutoLabelJobWire, "status" | "scanned" | "matches" | "applied" | "total" | "error" | "started_at" | "finished_at" | "created_at">>,
): AutoLabelJobWire {
  getDb().update(auto_label_jobs).set(patch).where(eq(auto_label_jobs.id, id)).run();
  return getDb().select().from(auto_label_jobs).where(eq(auto_label_jobs.id, id)).get()!;
}
