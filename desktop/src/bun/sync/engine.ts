import { list_accounts } from "../db/accounts";
import { logger } from "../utils/logger";
import { get_config } from "../utils/config";
import { InvalidGrantError } from "../providers/gmail/utils";

import {
  set_engine_rpc,
  sync_past_emails,
  sync_latest_emails,
  cancel_past_sync,
} from "./mail_items_sync";

import { evict_caches } from "./caches/evictions";

export { set_engine_rpc, sync_past_emails, sync_latest_emails, cancel_past_sync, evict_caches };

const POLL_INTERVAL_MIN_MS = 5000;
const POLL_INTERVAL_DEFAULT_MS = 5000;

const polling_intervals = new Map<string, ReturnType<typeof setInterval>>();
const get_poll_interval_ms = (): number => Math.max(parseInt(get_config("GMAIL_MAIL_POLL_INTERVAL"), 10) || POLL_INTERVAL_DEFAULT_MS, POLL_INTERVAL_MIN_MS);

export async function sync_all_past() {
  const accounts = list_accounts();
  logger.info("sync", `sync_all_past: ${accounts.length} account(s)`);
  const results: { account_id: string; status: string; error?: string }[] = [];
  for (const account of accounts) {
    try {
      await sync_past_emails(account.id);
      results.push({ account_id: account.id, status: "ok" });
    } catch (err) {
      logger.error("sync", `sync_all_past error for ${account.id}:`, err);
      results.push({ account_id: account.id, status: "error", error: String(err) });
    }
  }
  return results;
}

export function start_latest_emails_polling(account_id: string, intervalMs: number = get_poll_interval_ms()) {
  logger.info("sync", `start polling: account=${account_id} intervalMs=${intervalMs}`);
  stop_latest_emails_polling(account_id);

  const poll = async () => {
    if (!polling_intervals.has(account_id)) return;

    try {
      await sync_latest_emails(account_id);
    } catch (err) {
      if (err instanceof InvalidGrantError) {
        return;
      }
      logger.error("sync", `poll sync failed for ${account_id}:`, err);
    }
    if (!polling_intervals.has(account_id)) return;
    const timer = setTimeout(poll, intervalMs);
    polling_intervals.set(account_id, timer);
  };

  const timer = setTimeout(poll, intervalMs);
    polling_intervals.set(account_id, timer);
}

export function stop_latest_emails_polling(account_id: string) {
  const timer = polling_intervals.get(account_id);
  if (timer) {
    logger.info("sync", `stop polling: account=${account_id}`);
    clearTimeout(timer);
    polling_intervals.delete(account_id);
  } else {
    logger.info("sync", `stop polling: no active timer for ${account_id}`);
  }
}
