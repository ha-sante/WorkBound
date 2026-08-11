import { inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import { get_account } from "../../db/accounts";
import { email_has_attachments } from "../../db/schema";
import { withGmailAuth } from "../../providers/gmail/auth";
import { fetch_email_by_id, parse_message_full } from "../../providers/gmail/api";
import { upsert_attachment_metadatas } from "../../db/attachments";
import { get_config } from "../../utils/config";
import { logger } from "../../utils/logger";

export const is_attachments_metadata_cache_active = (): boolean => get_config("CACHE_MAIL_ATTACHMENTS_METADATA") !== "false";

function filter_ids_with_markers(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .select({ email_id: email_has_attachments.email_id })
    .from(email_has_attachments)
    .where(inArray(email_has_attachments.email_id, ids))
    .all() as { email_id: string }[];
  return rows.map((r) => r.email_id);
}

async function fetch_and_reconcile_attachment_details(account_id: string, email_ids: string[]): Promise<number> {
  let reconciled = 0;
  const account = get_account(account_id);
  if (!account?.has_credentials) return 0;

  try {
    await withGmailAuth(account_id, async (token) => {
      for (const email_id of email_ids) {
        try {
          const msg = await fetch_email_by_id(token, email_id, "full");
          const parsed = parse_message_full(msg, account_id);
          if (parsed.attachments.length > 0) {
            upsert_attachment_metadatas(parsed.attachments);
            reconciled += parsed.attachments.length;
          }
        } catch (e) {
          logger.warn("attachments_metadata_cache", `cache_email_attachment_metadatas: failed for ${email_id}: ${e}`);
        }
        await Bun.sleep(0);
      }
    });
  } catch (e) {
    logger.error("attachments_metadata_cache", `cache_email_attachment_metadatas: failed for account ${account_id}: ${e}`);
  }

  return reconciled;
}

export async function cache_email_attachment_metadatas(account_id: string, email_ids: string[]): Promise<void> {
  if (email_ids.length === 0 || !is_attachments_metadata_cache_active()) return;

  const marker_ids = filter_ids_with_markers(email_ids);
  if (marker_ids.length === 0) return;

  const reconciled = await fetch_and_reconcile_attachment_details(account_id, marker_ids);
  logger.info("attachments_metadata_cache", `cache_email_attachment_metadatas: account=${account_id} marked=${marker_ids.length} reconciled=${reconciled}`);
}