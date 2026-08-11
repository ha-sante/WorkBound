import { list_accounts, get_account } from "../db/accounts";
import { get_contacts_needing_photo_refresh, update_contact_avatar, update_contacts_photo_fetched_at } from "../db/contacts";
import { withGmailAuth } from "../providers/gmail/auth";
import { batch_fetch_contact_photos } from "../providers/gmail/people";
import { check_account } from "../utils/account";
import { logger } from "../utils/logger";
import { get_config } from "../utils/config";
import { error_message } from "../../shared/errors";
import { messages } from "../../shared/rpc_messages";
import { rpc_send } from "../rpc";

export const DEFAULT_SYNC_INTERVAL_MS = 60 * 1000;
const PAGE_SIZE = 100;
const get_sync_interval_ms = (): number => parseInt(get_config("GMAIL_CONTACTS_POLL_INTERVAL"), 10) || DEFAULT_SYNC_INTERVAL_MS;

let interval_id: ReturnType<typeof setInterval> | null = null;

export async function backfill_missing_contact_photos(account_id: string): Promise<void> {
  const account = get_account(account_id);
  if (!account) return;
  if (!check_account("contacts_photo_sync", account, ["provider_gmail", "is_active", "has_credentials"])) return;

  for (; ;) {
    const page = get_contacts_needing_photo_refresh(account_id, PAGE_SIZE);
    if (page.length === 0) break;
    logger.info("contacts_sync", `sweep page: account=${account_id} targets=${page.length}`);
    await fetch_and_store_contact_photos(account_id, page);
    if (page.length < PAGE_SIZE) break;
  }
}

async function fetch_and_store_contact_photos(account_id: string, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  try {
    const avatar_urls = await withGmailAuth(account_id, (token) =>
      batch_fetch_contact_photos(token, emails),
    );
    update_contacts_photo_fetched_at(account_id, emails);
    if (avatar_urls.size > 0) {
      for (const [email, url] of avatar_urls) {
        update_contact_avatar(account_id, email, url);
      }
      rpc_send(messages.contacts_changed, { account_id });
    }
    if (avatar_urls.size > 0) {
      logger.info("contacts_sync", `fetched ${avatar_urls.size} avatars for account=${account_id}`);
    }
  } catch (err) {
    logger.warn("contacts_sync", `photo fetch failed: account=${account_id} emails=${emails.length} err=${error_message(err)}`);
    update_contacts_photo_fetched_at(account_id, emails);
  }
}

async function backfill_missing_photos_for_all_accounts() {
  const accounts = list_accounts();
  for (const account of accounts) {
    try {
      await backfill_missing_contact_photos(account.id);
    } catch (err) {
      logger.warn("contacts_sync", `sweep failed for account ${account.id}: ${error_message(err)}`);
    }
  }
}

export function start_contacts_photo_sync() {
  if (interval_id) return;
  logger.info("contacts_sync", `starting periodic photo sync (interval=${get_sync_interval_ms()}ms)`);
  backfill_missing_photos_for_all_accounts().catch((e) => logger.warn("contacts_sync", `initial photo sync failed: ${error_message(e)}`));
  interval_id = setInterval(backfill_missing_photos_for_all_accounts, get_sync_interval_ms());
}

export function stop_contacts_photo_sync() {
  if (interval_id) {
    clearInterval(interval_id);
    interval_id = null;
    logger.info("contacts_sync", "periodic photo sync stopped");
  }
}

export { get_sync_interval_ms };