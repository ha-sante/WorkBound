import { getDb } from "./client";
import { send_as_aliases } from "./schema";
import { eq, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type SendAsAliasRow = InferSelectModel<typeof send_as_aliases>;

export function list_send_as_aliases(account_id: string): SendAsAliasRow[] {
  return getDb()
    .select()
    .from(send_as_aliases)
    .where(eq(send_as_aliases.account_id, account_id))
    .all();
}

export function get_send_as_alias(id: string): SendAsAliasRow | undefined {
  return getDb()
    .select()
    .from(send_as_aliases)
    .where(eq(send_as_aliases.id, id))
    .get();
}

export function insert_send_as_alias(data: typeof send_as_aliases.$inferInsert) {
  getDb().insert(send_as_aliases).values(data).run();
}

export function delete_send_as_alias(id: string) {
  getDb().delete(send_as_aliases).where(eq(send_as_aliases.id, id)).run();
}

export function set_default_send_as(account_id: string, alias_id: string) {
  getDb()
    .update(send_as_aliases)
    .set({ is_default: 0 })
    .where(and(eq(send_as_aliases.account_id, account_id), eq(send_as_aliases.is_default, 1)))
    .run();
  getDb()
    .update(send_as_aliases)
    .set({ is_default: 1 })
    .where(eq(send_as_aliases.id, alias_id))
    .run();
}

export function update_send_as_alias_signature(id: string, signature: string | null) {
  getDb()
    .update(send_as_aliases)
    .set({ signature })
    .where(eq(send_as_aliases.id, id))
    .run();
}

export function replace_all_send_as_aliases(account_id: string, aliases: (typeof send_as_aliases.$inferInsert)[]) {
  getDb()
    .delete(send_as_aliases)
    .where(eq(send_as_aliases.account_id, account_id))
    .run();
  for (const alias of aliases) {
    getDb().insert(send_as_aliases).values(alias).run();
  }
}
