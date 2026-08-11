import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { get_account, get_backfill_state } from "../db/accounts";
import { backfill_state, emails } from "../db/schema";
import { gmail_fetch } from "../providers/gmail/utils";
import { withGmailAuth } from "../providers/gmail/auth";
import { bulk_insert_email_has_attachments } from "../db/email_has_attachments";
import { logger } from "../utils/logger";
import { messages } from "../../shared/rpc_messages";
import { rpc_send } from "../rpc";
import { check_account } from "../utils/account";
import { cache_email_attachment_metadatas, is_attachments_metadata_cache_active } from "./caches/attachments_metadata_cache";

const LIST_MAX_RESULTS = 500;

async function wait_for_past_mail_backfill(account_id: string): Promise<void> {
  for (; ;) {
    const state = get_backfill_state(account_id);
    if (state?.backfill_done === 1) return;
    await Bun.sleep(2000);
  }
}

async function upsert_attachment_marker_cursor(account_id: string, next_page_token: string | null, status: string) {
  await getDb()
    .update(backfill_state)
    .set({
      attachments_marker_next_page_token: next_page_token,
      attachments_marker_backfill_status: status,
    })
    .where(eq(backfill_state.account_id, account_id))
    .run();
}

function filter_ids_missing_local_attachments(account_id: string, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.account_id, account_id),
        eq(emails.provider, "gmail"),
        inArray(emails.id, ids),
        // If real attachment metadata exists, we don't need a marker.
        sql`NOT EXISTS (SELECT 1 FROM attachments a WHERE a.email_id = ${emails.id})`,
        // If marker already exists, skip.
        sql`NOT EXISTS (SELECT 1 FROM email_has_attachments m WHERE m.email_id = ${emails.id})`,
      ),
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

async function fetch_attachment_message_ids_page(access_token: string, page_token?: string, q_extra?: string): Promise<{ ids: string[]; next_page_token?: string }> {
  const q = q_extra ? `has:attachment ${q_extra}` : "has:attachment";
  let url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages` +
    `?q=${encodeURIComponent(q)}&maxResults=${LIST_MAX_RESULTS}&includeSpamTrash=true`;
  if (page_token) url += `&pageToken=${encodeURIComponent(page_token)}`;

  // Include Spam/Trash: Gmail message IDs are stable across label moves, so a
  // marker set while a message sits in Spam/Trash stays valid if it's later
  // moved to Inbox. Discriminating here would miss those markers.
  const resp = await gmail_fetch(url, access_token);
  const data = (await resp.json()) as {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
  };
  const ids = (data.messages ?? []).map((m) => m.id).filter(Boolean);
  return { ids, next_page_token: data.nextPageToken };
}

export async function sync_past_email_attachments(account_id: string): Promise<void> {
  const account = get_account(account_id);
  if (!account) return;

  if (account.provider !== "gmail") return;
  if (!check_account("attachments_backfill", account, ["is_active", "has_credentials"])) return;

  const state = get_backfill_state(account_id);
  if (state?.attachments_marker_backfill_done === 1) {
    logger.info("attachments_backfill", `already done for ${account_id}`);
    return;
  }

  logger.info("attachments_backfill", `waiting for past mail backfill: account=${account_id}`);
  await wait_for_past_mail_backfill(account_id);

  const state_after_wait = get_backfill_state(account_id);
  if (state_after_wait?.attachments_marker_backfill_done === 1) return;

  let processed_message_ids = 0;
  let pages = 0;

  let page_token: string | undefined = state_after_wait?.attachments_marker_next_page_token ?? undefined;
  logger.info("attachments_backfill", `starting past email attachment markers: account=${account_id}`);

  await withGmailAuth(account_id, async (token) => {
    for (; ;) {
      pages++;

      const { ids, next_page_token } = await fetch_attachment_message_ids_page(token, page_token);
      page_token = next_page_token;

      if (ids.length === 0) {
        if (!page_token) break;
        await upsert_attachment_marker_cursor(account_id, page_token, "running");
        continue;
      }

      const missing_ids = filter_ids_missing_local_attachments(account_id, ids);
      if (missing_ids.length > 0) {
        bulk_insert_email_has_attachments(missing_ids);
        processed_message_ids += missing_ids.length;
      }

      logger.info("attachments_backfill", `page=${pages}: marked=${missing_ids.length} processed=${processed_message_ids}`);
      await upsert_attachment_marker_cursor(account_id, page_token ?? null, "running");

      if (!page_token) break;
    }
  });

  await getDb()
    .update(backfill_state)
    .set({
      attachments_marker_backfill_done: 1,
      attachments_marker_next_page_token: null,
      attachments_marker_backfill_status: "idle",
    })
     .where(eq(backfill_state.account_id, account_id))
     .run();

  logger.info("attachments_backfill", `done: account=${account_id} processed=${processed_message_ids} pages=${pages}`);
  rpc_send(messages.sync_attachments_meta_backfill_done, { account_id });
}

function filter_ids_existing_local(account_id: string, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.account_id, account_id),
        eq(emails.provider, "gmail"),
        inArray(emails.id, ids),
      ),
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

export async function sync_new_email_attachments(account_id: string, gmail_email_ids: string[]): Promise<void> {
  if (gmail_email_ids.length === 0) return;

  try {
    const local_ids = filter_ids_existing_local(account_id, gmail_email_ids);
    if (local_ids.length === 0) return;

    const local_id_set = new Set(local_ids);
    const attachment_ids = await withGmailAuth(account_id, async (token) => {
      const matched = new Set<string>();
      let page_token: string | undefined;

      for (; ;) {
        const { ids, next_page_token } = await fetch_attachment_message_ids_page(
          token,
          page_token,
          // Bound the search so this stays cheap per poll. Gmail's search index
          // can lag brand-new messages by seconds, so a marker may land on a
          // later poll — monotonic, so this is safe.
          "newer_than:1d",
        );

        for (const id of ids) {
          if (local_id_set.has(id)) matched.add(id);
        }

        if (matched.size === local_id_set.size) break;
        page_token = next_page_token;
        if (!page_token) break;
      }

      return [...matched];
    });

    if (attachment_ids.length === 0) return;

    bulk_insert_email_has_attachments(attachment_ids);
    logger.info("attachments_sync", `sync_new_email_attachments: account=${account_id} matched_attachment_ids=${attachment_ids.length}`);

    if (is_attachments_metadata_cache_active()) {
      await cache_email_attachment_metadatas(account_id, attachment_ids);
    }
  } catch (e) {
    logger.error("attachments_sync", `sync_new_email_attachments: failed for account ${account_id}: ${e}`);
  }
}
