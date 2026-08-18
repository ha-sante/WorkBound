import { claim_queued_outbox, delete_outbox, requeue_stale_outbox, update_outbox_retry, update_outbox_status } from "../db/outbox";
import { logger } from "../utils/logger";
import { handle_draft_send, handle_send_email, handle_email_delete, handle_label_update, handle_label_batch } from "./mail_ops";
import { handle_draft_save, handle_draft_delete } from "./draft_ops";
import { outbox_commands } from "../../shared/outbox_commands";
import { messages } from "../../shared/rpc_messages";
import { get_rpc } from "./rpc_ref";

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _processing = false;
let _lastOnlineCheck = 0;
let _isOnline = true;
const ONLINE_CHECK_URL = "https://clients3.google.com/generate_204";
const ONLINE_CHECK_TTL = 10_000;
const POLL_INTERVAL_MS = 1_000;
const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function emit_outbox_changed(item: OutboxItemRow) {
  get_rpc()?.send(messages.outbox_changed, { account_id: item.account_id, thread_id: item.thread_id ?? null });
}

function is_captured_gmail_row(item: OutboxItemRow): boolean {
  if (!item.extras) return false;
  try {
    const e = JSON.parse(item.extras);
    return e?.source === "gmail_capture";
  } catch {
    return false;
  }
}

async function check_online(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastOnlineCheck < ONLINE_CHECK_TTL) return _isOnline;
  _lastOnlineCheck = now;
  try {
    const resp = await fetch(ONLINE_CHECK_URL, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    _isOnline = resp.ok || resp.status === 204;
  } catch {
    _isOnline = false;
  }
  return _isOnline;
}

export async function process_single_item(item: OutboxItemRow): Promise<void> {
  switch (item.command) {
    case outbox_commands.draft_send:
      return await handle_draft_send(item);
    case outbox_commands.send_email:
      return await handle_send_email(item);
    case outbox_commands.draft_save:
      return await handle_draft_save(item);
    case outbox_commands.draft_delete:
      return await handle_draft_delete(item);
    case outbox_commands.delete_email:
      return await handle_email_delete(item);
    case outbox_commands.mark_as_read:
    case outbox_commands.mark_as_unread:
    case outbox_commands.mark_as_spam:
    case outbox_commands.mark_as_phishing:
    case outbox_commands.move_to_archive:
    case outbox_commands.move_to_inbox:
    case outbox_commands.untrash:
    case outbox_commands.block_sender:
    case outbox_commands.toggle_important:
    case outbox_commands.toggle_starred:
    case outbox_commands.label_update:
      return await handle_label_update(item);
    case outbox_commands.label_batch:
      return await handle_label_batch(item);
    default:
      throw new Error(`Unknown outbox command: ${item.command}`);
  }
}

async function process_outbox() {
  if (_processing) return;
  _processing = true;
  try {
    if (!(await check_online())) {
      logger.warn("outbox", "offline, skipping outbox processing");
      return;
    }

    const items = claim_queued_outbox();
    if (items.length === 0) return;

    for (const item of items) {
      if (is_captured_gmail_row(item)) {
        update_outbox_status(item.id, "queued");
        continue;
      }
      try {
        await process_single_item(item);
        delete_outbox(item.id);
        emit_outbox_changed(item);
      } catch (err) {
        const msg = (err as Error).message || "";
        const isNetworkError = err instanceof TypeError
          || msg.includes("fetch failed")
          || msg.includes("ECONNREFUSED")
          || msg.includes("ENOTFOUND")
          || msg.includes("ETIMEDOUT")
          || msg.includes("econnrefused")
          || msg.includes("enotfound")
          || msg.includes("network")
          || msg.includes("connect");

        if (isNetworkError && item.attempt_count < MAX_ATTEMPTS) {
          const backoff_ms = Math.min(60_000, 1_000 * (2 ** Math.max(0, item.attempt_count - 1)));
          const next_retry_at = Date.now() + backoff_ms + Math.floor(Math.random() * 250);
          update_outbox_retry(item.id, msg, next_retry_at);
          logger.warn("outbox", `${item.command} network error for ${item.id}, will retry`);
        } else {
          logger.error("outbox", `${item.command} failed ${item.id}:`, err);
          update_outbox_status(item.id, "failed", msg);
        }
        emit_outbox_changed(item);
      }
    }
  } catch (err) {
    logger.error("outbox", "process_outbox error:", err);
  } finally {
    _processing = false;
  }
}

export function start_outbox_processor() {
  if (_intervalId) return;
  requeue_stale_outbox(LEASE_MS);
  logger.info("outbox", "starting processor (1s interval)");
  void process_outbox();
  _intervalId = setInterval(process_outbox, POLL_INTERVAL_MS);
}

export function stop_outbox_processor() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    logger.info("outbox", "processor stopped");
  }
}
