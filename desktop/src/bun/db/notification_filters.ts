import { sql } from "drizzle-orm";
import { getDb, get_raw_db } from "./client";
import { logger } from "../utils/logger";
import { get_pref, set_pref } from "./preferences";
import { pref_keys } from "../../shared/pref_keys";

type NotificationFilterRow = {
  id: string;
  account_id: string;
  name: string;
  icon_name: string | null;
  clauses: string;
  enabled: number;
  position: number;
};

function row_to_wire(row: NotificationFilterRow): NotificationFilterWire {
  return {
    id: row.id,
    name: row.name,
    icon_name: row.icon_name ?? "ListFilter",
    clauses: (JSON.parse(row.clauses) ?? []) as ClientFilterClause[],
    enabled: row.enabled === 1,
    position: row.position,
  };
}

export function list_notification_filters(account_id: string): NotificationFilterWire[] {
  const rows = getDb().all(
    sql`SELECT * FROM notification_filters WHERE account_id = ${account_id} ORDER BY position ASC`,
  ) as NotificationFilterRow[];
  const filters = rows.map(row_to_wire);
  const migrated = (get_pref(pref_keys.notifications_migrated_accounts) as Record<string, boolean> | null) ?? {};
  if (!migrated[account_id]) {
    const senders = (get_pref(pref_keys.notifications_allowed_senders) as string[] | null) ?? [];
    const migrated_filters = senders.filter((sender) => sender.trim()).map((sender, index) => ({
      id: crypto.randomUUID(),
      name: `From ${sender.trim()}`,
      icon_name: "ListFilter",
      clauses: [{ id: crypto.randomUUID(), field: "from", op: "contains", value: sender.trim() } as ClientFilterClause],
      enabled: true,
      position: filters.length + index,
    }));
    if (migrated_filters.length > 0 && filters.length === 0) {
      replace_notification_filters(account_id, migrated_filters);
      filters.push(...migrated_filters);
    }
    set_pref(pref_keys.notifications_migrated_accounts, { ...migrated, [account_id]: true });
  }
  return filters;
}

export function replace_notification_filters(account_id: string, filters: NotificationFilterWire[]): void {
  const db = get_raw_db();
  const tx = db.transaction(() => {
    db.run("DELETE FROM notification_filters WHERE account_id = ?", [account_id]);
    for (const filter of filters) {
      db.run(
        "INSERT INTO notification_filters (id, account_id, name, icon_name, clauses, enabled, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [filter.id, account_id, filter.name, filter.icon_name, JSON.stringify(filter.clauses), filter.enabled ? 1 : 0, filter.position],
      );
    }
  });
  tx();
  logger.info("db", `replace_notification_filters account_id=${account_id} count=${filters.length}`);
}
