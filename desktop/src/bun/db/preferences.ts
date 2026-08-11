import { get_raw_db } from "./client";

export type PrefValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export function get_pref(key: string): PrefValue | null {
  const db = get_raw_db();
  const row = db.prepare("SELECT value FROM app_preferences WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as PrefValue;
  } catch {
    return row.value;
  }
}

export function set_pref(key: string, value: PrefValue): void {
  const db = get_raw_db();
  db.prepare(
    "INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

export function delete_pref(key: string): void {
  const db = get_raw_db();
  db.prepare("DELETE FROM app_preferences WHERE key = ?").run(key);
}

export function get_all_prefs(): Record<string, PrefValue> {
  const db = get_raw_db();
  const rows = db.prepare("SELECT key, value FROM app_preferences").all() as { key: string; value: string }[];
  const result: Record<string, PrefValue> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value) as PrefValue;
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}
