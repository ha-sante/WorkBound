import { getDb } from "./client";
import { sql } from "drizzle-orm";

export function list_reminders(account_id: string): ReminderWire[] {
  return getDb().all(sql`
    SELECT r.id, r.account_id, r.email_id, r.thread_id, r.remind_at, r.status, r.created_at,
      e.subject, e.from_name, e.from_address, e.snippet
    FROM reminders r
    LEFT JOIN emails e ON e.id = r.email_id
    WHERE r.account_id = ${account_id} AND r.status = 'pending'
    ORDER BY r.remind_at ASC
  `) as ReminderWire[];
}

type DueReminderRow = ReminderWire & {
  notified_at: number | null;
};

export function list_unnotified_due_reminders(now: number): DueReminderRow[] {
  return getDb().all(sql`
    SELECT r.id, r.account_id, r.email_id, r.thread_id, r.remind_at, r.status,
      r.created_at, r.notified_at, e.subject, e.from_name, e.from_address, e.snippet
    FROM reminders r
    LEFT JOIN emails e ON e.id = r.email_id
    WHERE r.status = 'pending' AND r.remind_at <= ${now} AND r.notified_at IS NULL
    ORDER BY r.remind_at ASC
  `) as DueReminderRow[];
}

export function claim_due_reminder(id: string, now: number): boolean {
  const result = getDb().run(sql`
    UPDATE reminders
    SET notified_at = ${now}
    WHERE id = ${id}
      AND status = 'pending'
      AND remind_at <= ${now}
      AND notified_at IS NULL
  `);
  return result.changes > 0;
}

export function reset_due_reminder_notification(id: string, claimed_at: number): void {
  getDb().run(sql`
    UPDATE reminders
    SET notified_at = NULL
    WHERE id = ${id} AND notified_at = ${claimed_at}
  `);
}

export function create_reminder(data: { account_id: string; email_id: string; thread_id?: string | null; remind_at: number }): ReminderWire {
  const id = crypto.randomUUID();
  const created_at = Date.now();
  getDb().run(sql`
    INSERT INTO reminders (id, account_id, email_id, thread_id, remind_at, status, notified_at, created_at)
    VALUES (${id}, ${data.account_id}, ${data.email_id}, ${data.thread_id ?? null}, ${data.remind_at}, 'pending', NULL, ${created_at})
  `);
  return getDb().get(sql`SELECT id, account_id, email_id, thread_id, remind_at, status, created_at FROM reminders WHERE id = ${id}`) as ReminderWire;
}

export function update_reminder(id: string, data: { remind_at?: number; status?: "pending" | "completed" | "dismissed" }): void {
  if (data.remind_at !== undefined) {
    getDb().run(sql`UPDATE reminders SET remind_at = ${data.remind_at}, status = 'pending', notified_at = NULL WHERE id = ${id}`);
  }
  if (data.status !== undefined) {
    getDb().run(sql`UPDATE reminders SET status = ${data.status} WHERE id = ${id}`);
  }
}

export function delete_reminder(id: string): void {
  getDb().run(sql`DELETE FROM reminders WHERE id = ${id}`);
}
