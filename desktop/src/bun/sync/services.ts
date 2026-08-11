import { start_outbox_processor, stop_outbox_processor } from "../outbox/processor";
import { start_send_as_sync, stop_send_as_sync } from "./mail_alias_sync";
import { start_cache_eviction, stop_cache_eviction } from "./caches/evictions";
import { start_auto_label_job_runner, stop_auto_label_job_runner } from "../intelligence/job_runner";
import { start_contacts_photo_sync, stop_contacts_photo_sync } from "./mail_contacts_sync";
import { sync_past_emails, start_latest_emails_polling, stop_latest_emails_polling, cancel_past_sync } from "./engine";
import { sync_past_email_attachments } from "./mail_attachments_sync";
import { list_accounts } from "../db/accounts";
import { logger } from "../utils/logger";
import { clear_all_retries } from "../utils/retry";

let started = false;

function start_all_backfills() {
  const accounts = list_accounts();
  for (const a of accounts) {
    sync_past_emails(a.id)
      .then(() => sync_past_email_attachments(a.id))
      .catch((e) => logger.error("services", "backfill failed:", e));
  }
}

export function start_all_services() {
  if (started) return;
  started = true;
  logger.info("services", "starting all background services");

  start_outbox_processor();
  start_send_as_sync();
  start_cache_eviction();
  start_auto_label_job_runner();
  start_contacts_photo_sync();

  const accounts = list_accounts();
  for (const a of accounts) {
    start_latest_emails_polling(a.id);
  }

  start_all_backfills();
}

export function stop_all_services() {
  logger.info("services", "stopping all background services");

  stop_outbox_processor();
  stop_send_as_sync();
  stop_cache_eviction();
  stop_auto_label_job_runner();
  stop_contacts_photo_sync();

  const accounts = list_accounts();
  for (const a of accounts) {
    stop_latest_emails_polling(a.id);
    cancel_past_sync(a.id);
  }
  clear_all_retries();
  started = false;
}
