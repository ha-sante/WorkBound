import { get_adapter } from "../providers/index";
import { get_account, upsert_backfill_state, update_backfill_total_messages, get_backfill_state, upsert_newfill_state, get_newfill_state } from "../db/accounts";
import { messages } from "../../shared/rpc_messages";
import { logger } from "../utils/logger";
import { schedule_retry, cancel_retry } from "../utils/retry";
import { InvalidGrantError } from "../providers/gmail/utils";
import { show_notifications_for_new_emails } from "../providers/gmail/notifications";
import { is_body_cache_active, cache_email_bodies } from "./caches/body_cache";
import { sync_new_email_attachments } from "./mail_attachments_sync";
import { apply_auto_labels_to_new_emails } from "../intelligence/new_mail";
import { check_account } from "../utils/account";

type MessageSend = (msg: string, payload?: unknown) => void;

let engine_rpc: { send: MessageSend } | null = null;

export function set_engine_rpc(rpc: { send: (msg: string, payload?: unknown) => void }) {
  engine_rpc = rpc;
}

let backfill_total_messages_for_account: Record<string, number | null> = {};

function push_backfill_progress(account_id: string, total: number) {
  const totalMessages = backfill_total_messages_for_account[account_id] ?? null;
  engine_rpc?.send(messages.sync_backfill_progress, { account_id, total, totalMessages });
}

function push_backfill_done(account_id: string, total: number) {
  const totalMessages = backfill_total_messages_for_account[account_id] ?? null;
  engine_rpc?.send(messages.sync_backfill_done, { account_id, total, totalMessages });
  delete backfill_total_messages_for_account[account_id];
}

const push_newfill_progress = (payload: NewfillProgressWire) => {
  engine_rpc?.send(messages.sync_newfill_progress, payload);
}

const abort_controllers = new Map<string, AbortController>();
const BACKFILL_RETRY_BASE_MS = 60_000;
const BACKFILL_RETRY_MAX_MS = 8 * 60_000;

export async function sync_past_emails(account_id: string) {
  if (abort_controllers.has(account_id)) {
    logger.info("sync", `syncPastEmails: backfill already running for ${account_id}, skipping`);
    return;
  }

  const account = get_account(account_id);
  if (!account) {
    logger.info("sync", `syncPastEmails: account ${account_id} not found`);
    throw new Error(`Account not found: ${account_id}`);
  }

  if (!check_account("sync", account, ["is_active", "has_credentials"])) return;

  const state = get_backfill_state(account_id);
  if (state?.backfill_done) {
    logger.info("sync", `syncPastEmails: account ${account_id} backfill already done, skipping`);
    return;
  }

  const resumeCursor = state?.backfill_next_page_token ?? undefined;
  logger.info("sync", `syncPastEmails start: account=${account_id} resumeCursor=${resumeCursor ?? "null"}`);

  cancel_retry(account_id);

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  if (!state?.backfill_initial_total_messages) {
    try {
      const { fetch_gmail_profile } = await import("../providers/gmail/api");
      const { withGmailAuth } = await import("../providers/gmail/auth");
      const profile = await withGmailAuth(account_id, (token) =>
        fetch_gmail_profile(token),
      );
      backfill_total_messages_for_account[account_id] = profile.messages_total;
      update_backfill_total_messages(account_id, profile.messages_total);
    } catch (e) {
      logger.warn("sync", `failed to fetch Gmail profile for total messages: ${e}`);
    }
  } else {
    backfill_total_messages_for_account[account_id] = state.backfill_initial_total_messages;
  }

  let totalFetched = state?.backfill_fetched_total ?? 0;

  upsert_backfill_state({
    account_id,
    backfill_done: 0,
    backfill_next_page_token: null,
    backfill_oldest_synced_at: null,
    backfill_status: "syncing",
    backfill_fetched_total: totalFetched,
  });

  engine_rpc?.send(messages.sync_backfill_start, {
    account_id,
    total: totalFetched,
    totalMessages: backfill_total_messages_for_account[account_id] ?? null,
    resume: !!resumeCursor,
  });

  let batch = 0;
  const abortController = new AbortController();
  abort_controllers.set(account_id, abortController);

  let cursor: string | undefined = resumeCursor;
  let oldestSeen: string | undefined;

  try {
    let done = false;
    let emptyPages = 0;
    while (!done) {
      if (abortController.signal.aborted) {
        logger.info("sync", `past sync cancelled for ${account_id}`);
        return { fetched: totalFetched, done: true };
      }

      const result = await adapter.fetchPastEmails(cursor);
      totalFetched += result.fetched;
      cursor = result.newCursor;
      done = result.done;
      batch++;

      if (result.fetched === 0 && !done) {
        emptyPages++;
        logger.warn("sync", `[backfill] empty page #${emptyPages} for ${account_id} (cursor=${cursor ?? "null"})`);
        if (emptyPages >= 3) {
          logger.error("sync", `[backfill] aborting — 3 consecutive empty pages for ${account_id}`);
          throw new Error("Backfill stuck: 3 consecutive pages returned 0 emails");
        }
      } else {
        emptyPages = 0;
      }

      if (result.oldestReceivedAt && (!oldestSeen || result.oldestReceivedAt < oldestSeen)) {
        oldestSeen = result.oldestReceivedAt;
      }

      if (!done) {
        upsert_backfill_state({
          account_id,
          backfill_done: 0,
          backfill_next_page_token: result.newCursor,
          backfill_oldest_synced_at: oldestSeen ?? null,
          backfill_status: "syncing",
          backfill_fetched_total: totalFetched,
        });
      }

      push_backfill_progress(account_id, totalFetched);
    }

    abort_controllers.delete(account_id);

    upsert_backfill_state({
      account_id,
      backfill_done: 1,
      backfill_next_page_token: null,
      backfill_oldest_synced_at: oldestSeen ?? null,
      backfill_status: "idle",
      backfill_fetched_total: totalFetched,
    });

    push_backfill_done(account_id, totalFetched);

    return { fetched: totalFetched, done: true };
  } catch (err) {
    abort_controllers.delete(account_id);

    engine_rpc?.send(messages.sync_backfill_error, {
      account_id,
      error: err instanceof Error ? err.message : String(err),
    });

    try {
      upsert_backfill_state({
        account_id,
        backfill_done: 0,
        backfill_next_page_token: cursor ?? state?.backfill_next_page_token ?? null,
        backfill_oldest_synced_at: oldestSeen ?? state?.backfill_oldest_synced_at ?? null,
        backfill_status: "error",
        backfill_fetched_total: totalFetched,
      });
    } catch (e) {
      logger.error("sync", "failed to update backfill_state on error:", e);
    }

    logger.info("sync", `[backfill] scheduling resume for ${account_id}`);
    schedule_retry(account_id, async () => { await sync_past_emails(account_id); }, {
      base_ms: BACKFILL_RETRY_BASE_MS,
      max_ms: BACKFILL_RETRY_MAX_MS,
      is_permanent: (e) => e instanceof InvalidGrantError,
    });

    throw err;
  }
}

export async function sync_latest_emails(account_id: string) {
  const account = get_account(account_id);
  if (!account) {
      logger.info("sync", `sync_latest_emails: account ${account_id} not found`);
    throw new Error(`Account not found: ${account_id}`);
  }
  if (!account.is_active) {
    logger.info("sync", `syncLatestEmails: account ${account_id} not active, skipping`);
    return;
  }
  if (!account.has_credentials) {
    logger.info("sync", `syncLatestEmails: account ${account_id} has no stored credentials`);
    push_newfill_progress({
      account_id,
      email: account.email,
      state: "error",
      error: "No stored credentials. Reconnect in Settings → Profile.",
    });
    return;
  }

  const state = get_newfill_state(account_id);
  if (!state?.newfill_current_history_id) {
    logger.info("sync", `syncLatestEmails: no newfill_current_history_id yet for ${account_id}, skipping`);
    return;
  }
  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  try {
    const result = await adapter.fetchNewEmails(state.newfill_current_history_id);
    const hasChanges = result.fetched > 0 || (result.deletedIds?.length ?? 0) > 0;

    if (result.newHistoryId && result.newHistoryId !== state.newfill_current_history_id) {
      upsert_newfill_state({
        account_id,
        newfill_current_history_id: result.newHistoryId,
        newfill_last_synced_at: new Date().toISOString(),
        newfill_status: "done",
      });
    }

    if (hasChanges) {
      push_newfill_progress({
        account_id,
        email: account.email,
        state: "done",
        hasChanges: true,
        deletedIds: result.deletedIds,
      });
    }

    if (result.email_ids && result.email_ids.length > 0) {
      if (is_body_cache_active()) {
        void cache_email_bodies(account_id, result.email_ids);
      }
      const newIds = result.newIds ?? [];
      if (newIds.length > 0) {
        void sync_new_email_attachments(account_id, newIds);
        apply_auto_labels_to_new_emails(account_id, newIds);
        show_notifications_for_new_emails(account_id, newIds);
      }
    }

    return result;
  } catch (err) {
    logger.error("sync", `syncLatestEmails error: account=${account_id} err=${err}`);
    const error_msg = err instanceof InvalidGrantError
      ? "Token expired. Reconnect in Settings → Profile."
      : String(err);
    push_newfill_progress({
      account_id,
      email: account.email,
      state: "error",
      error: error_msg,
    });
    throw err;
  }
}

export function cancel_past_sync(account_id: string) {
    logger.info("sync", `cancel_past_sync: account=${account_id}`);
  const ctrl = abort_controllers.get(account_id);
  if (ctrl) {
    ctrl.abort();
    abort_controllers.delete(account_id);
  } else {
    logger.info("sync", `cancel_past_sync: no active abort controller for ${account_id}`);
  }
  cancel_retry(account_id);
}
