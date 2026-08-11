import { getDb, get_raw_db } from "./client";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger";

type FilteredViewRow = {
  id: string;
  account_id: string;
  name: string;
  icon_name: string | null;
  clauses: string;
  folder: string;
  visible: number;
  position: number;
  created_at: string | null;
  updated_at: string | null;
};

function row_to_wire(row: FilteredViewRow): FilteredViewWire {
  return {
    id: row.id,
    name: row.name,
    icon_name: row.icon_name ?? "ListFilter",
    clauses: (JSON.parse(row.clauses) ?? []) as ClientFilterClause[],
    folder: row.folder,
    visible: row.visible === 1,
    position: row.position,
  };
}

function upsert_statement(db: ReturnType<typeof getDb>, account_id: string, view: FilteredViewWire) {
  db.run(sql`
    INSERT INTO filtered_views (id, account_id, name, icon_name, clauses, folder, visible, position)
    VALUES (${view.id}, ${account_id}, ${view.name}, ${view.icon_name}, ${JSON.stringify(view.clauses)}, ${view.folder}, ${view.visible ? 1 : 0}, ${view.position})
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon_name = excluded.icon_name,
      clauses = excluded.clauses,
      folder = excluded.folder,
      visible = excluded.visible,
      position = excluded.position,
      updated_at = datetime('now')
  `);
}

export function list_filtered_views(account_id: string): FilteredViewWire[] {
  const rows = getDb().all(
    sql`SELECT * FROM filtered_views WHERE account_id = ${account_id} ORDER BY position ASC`,
  ) as FilteredViewRow[];
  return rows.map(row_to_wire);
}

export function save_filtered_view(account_id: string, view: FilteredViewWire): FilteredViewWire {
  upsert_statement(getDb(), account_id, view);
  logger.info("db", `save_filtered_view id=${view.id}`);
  return view;
}

export function delete_filtered_view(id: string): void {
  getDb().run(sql`DELETE FROM filtered_views WHERE id = ${id}`);
  logger.info("db", `delete_filtered_view id=${id}`);
}

export function replace_filtered_views(account_id: string, views: FilteredViewWire[]): void {
  const db = get_raw_db();
  const tx = db.transaction(() => {
    db.run("DELETE FROM filtered_views WHERE account_id = ?", [account_id]);
    for (const view of views) {
      db.run(
        "INSERT INTO filtered_views (id, account_id, name, icon_name, clauses, folder, visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          view.id,
          account_id,
          view.name,
          view.icon_name,
          JSON.stringify(view.clauses),
          view.folder,
          view.visible ? 1 : 0,
          view.position,
        ],
      );
    }
  });
  tx();
  logger.info("db", `replace_filtered_views account_id=${account_id} count=${views.length}`);
}
