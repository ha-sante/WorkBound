import { getDb } from "./client";
import { accounts, backfill_state, newfill_state, emails, threads, attachments, email_has_attachments, outbox, labels, send_as_aliases, notes, contacts, signature_templates, email_templates } from "./schema";
import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type AccountRow = InferSelectModel<typeof accounts>;

export function insert_account(data: typeof accounts.$inferInsert) {
  getDb().insert(accounts).values(data).run();
}

export function get_account(id: string): AccountRow | undefined {
  return getDb().select().from(accounts).where(eq(accounts.id, id)).get();
}

export function get_account_by_email(email: string): AccountRow | undefined {
  return getDb().select().from(accounts).where(eq(accounts.email, email)).get();
}

export function list_accounts(): AccountRow[] {
  return getDb().select().from(accounts).orderBy(accounts.created_at).all();
}

export function update_account(
  id: string,
  data: Partial<Pick<AccountRow, "name" | "has_credentials" | "avatar_url" | "is_active">>,
) {
  getDb()
    .update(accounts)
    .set(data)
    .where(eq(accounts.id, id))
    .run();
}

export function delete_account(id: string) {
  getDb().delete(accounts).where(eq(accounts.id, id)).run();
}

export function delete_all_accounts() {
  const db = getDb();
  db.delete(attachments).run();
  db.delete(email_has_attachments).run();
  db.delete(emails).run();
  db.delete(threads).run();
  db.delete(backfill_state).run();
  db.delete(newfill_state).run();
  db.delete(outbox).run();
  db.delete(labels).run();
  db.delete(send_as_aliases).run();
  db.delete(notes).run();
  db.delete(contacts).run();
  db.delete(signature_templates).run();
  db.delete(email_templates).run();
  db.delete(accounts).run();
}

export type BackfillStateRow = InferSelectModel<typeof backfill_state>;

export function upsert_backfill_state(data: typeof backfill_state.$inferInsert) {
  getDb()
    .insert(backfill_state)
    .values(data)
    .onConflictDoUpdate({
      target: backfill_state.account_id,
      set: {
        backfill_done: sql`excluded.backfill_done`,
        backfill_next_page_token: sql`excluded.backfill_next_page_token`,
        backfill_oldest_synced_at: sql`excluded.backfill_oldest_synced_at`,
        backfill_status: sql`excluded.backfill_status`,
        backfill_fetched_total: sql`excluded.backfill_fetched_total`,
      },
    })
    .run();
}

export function update_backfill_total_messages(account_id: string, total: number) {
  getDb()
    .insert(backfill_state)
    .values({ account_id, backfill_initial_total_messages: total })
    .onConflictDoUpdate({
      target: backfill_state.account_id,
      set: { backfill_initial_total_messages: sql`excluded.backfill_initial_total_messages` },
    })
    .run();
}

export function get_backfill_state(account_id: string): BackfillStateRow | undefined {
  return getDb().select().from(backfill_state).where(eq(backfill_state.account_id, account_id)).get();
}

export type NewfillStateRow = InferSelectModel<typeof newfill_state>;

export function upsert_newfill_state(data: typeof newfill_state.$inferInsert) {
  getDb()
    .insert(newfill_state)
    .values(data)
    .onConflictDoUpdate({
      target: newfill_state.account_id,
      set: {
        newfill_current_history_id: sql`excluded.newfill_current_history_id`,
        newfill_last_synced_at: sql`excluded.newfill_last_synced_at`,
        newfill_status: sql`excluded.newfill_status`,
      },
    })
    .run();
}

export function get_newfill_state(account_id: string): NewfillStateRow | undefined {
  return getDb().select().from(newfill_state).where(eq(newfill_state.account_id, account_id)).get();
}
