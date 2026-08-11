import { logger } from "../utils/logger";
import { getDb } from "./client";
import { labels } from "./schema/labels";
import { eq, and, inArray } from "drizzle-orm";

const SYSTEM_LABEL_IDS = new Set([
  "INBOX",
  "SENT",
  "DRAFT",
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "TRASH",
  "SPAM",
  "CATEGORY_PRIMARY",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
]);

export function resolve_label_id(
  name: string,
  account_id?: string,
): string | undefined {
  if (account_id) {
    const row = getDb()
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.account_id, account_id), eq(labels.name, name)))
      .get();
    return row?.id;
  }
  const row = getDb()
    .select({ id: labels.id })
    .from(labels)
    .where(eq(labels.name, name))
    .get();
  return row?.id;
}

export function has_unknown_label_ids(
  account_id: string,
  ids: string[],
): boolean {
  const known = new Set<string>(SYSTEM_LABEL_IDS);
  const rows = getDb()
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.account_id, account_id), inArray(labels.id, ids)))
    .all();
  for (const r of rows) known.add(r.id);
  return ids.some((id) => !known.has(id));
}

export type RemovedLabel = { id: string; name: string };

export type SyncLabelsResult = {
  removed: RemovedLabel[];
  changed: boolean;
};

export async function sync_labels(
  account_id: string,
  access_token: string,
): Promise<SyncLabelsResult> {
  try {
    const before = new Map(
      getDb()
        .select({ id: labels.id, name: labels.name })
        .from(labels)
        .where(and(eq(labels.account_id, account_id), eq(labels.type, "user")))
        .all()
        .map((r) => [r.id, r.name]),
    );

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!res.ok) return { removed: [], changed: false };
    const data = (await res.json()) as {
      labels: { id: string; name: string; type?: string }[];
    };
    for (const label of data.labels) {
      getDb()
        .insert(labels)
        .values({
          id: label.id,
          account_id,
          name: label.name,
          type: label.type ?? "user",
        })
        .onConflictDoUpdate({
          target: labels.id,
          set: {
            name: label.name,
            type: label.type ?? "user",
          },
        })
        .run();
    }

    const returned_ids = new Set(data.labels.map((l) => l.id));
    const local_rows = getDb()
      .select({ id: labels.id, name: labels.name, type: labels.type })
      .from(labels)
      .where(and(eq(labels.account_id, account_id), eq(labels.type, "user")))
      .all();
    const removed: RemovedLabel[] = local_rows.filter(
      (r) => !returned_ids.has(r.id),
    );
    if (removed.length > 0) {
      getDb()
        .delete(labels)
        .where(
          and(
            eq(labels.account_id, account_id),
            inArray(
              labels.id,
              removed.map((r) => r.id),
            ),
          ),
        )
        .run();
      logger.info(
        "labels",
        `pruned ${removed.length} label(s) deleted in gmail account=${account_id.slice(0, 8)}`,
      );
    }

    const after = new Map(local_rows.map((r) => [r.id, r.name]));
    let changed = removed.length > 0;
    if (!changed) {
      for (const [id, name] of after) {
        const prev = before.get(id);
        if (prev === undefined || prev !== name) {
          changed = true;
          break;
        }
      }
      if (!changed && after.size !== before.size) changed = true;
    }

    return { removed, changed };
  } catch {
    logger.warn("labels", "sync labels failed - will be refetched later.");
    return { removed: [], changed: false };
  }
}
