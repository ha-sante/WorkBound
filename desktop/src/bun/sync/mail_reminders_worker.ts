import { Utils } from "electrobun/bun";
import { messages } from "../../shared/rpc_messages";
import { claim_due_reminder, list_unnotified_due_reminders, reset_due_reminder_notification } from "../db/reminders";
import { rpc_send } from "../rpc";
import { logger } from "../utils/logger";
import { get_pref } from "../db/preferences";
import { pref_keys } from "../../shared/pref_keys";

const REMINDER_POLL_INTERVAL = 30_000;
let reminder_timer: ReturnType<typeof setInterval> | null = null;

const reminder_body = (subject: string | null | undefined, from_name: string | null | undefined, from_address: string | null | undefined) => {
  const email_title = subject || "Untitled email";
  const sender = from_name || from_address || "unknown sender";
  return `Email: ${email_title} - from ${sender}`;
};

export function check_due_reminders(): void {
  if (get_pref(pref_keys.notifications_enabled) === false) return;

  const now = Date.now();
  const due_reminders = list_unnotified_due_reminders(now);
  const changed_accounts = new Set<string>();

  for (const reminder of due_reminders) {
    if (!claim_due_reminder(reminder.id, now)) continue;

    try {
      Utils.showNotification({
        title: "Your reminder is up",
        body: reminder_body(reminder.subject, reminder.from_name, reminder.from_address),
        silent: false,
      });
      changed_accounts.add(reminder.account_id);
      logger.info("reminders", `due notification sent reminder_id=${reminder.id}`);
    } catch (error) {
      reset_due_reminder_notification(reminder.id, now);
      logger.warn("reminders", `due notification failed reminder_id=${reminder.id} error=${error}`);
    }
  }

  for (const account_id of changed_accounts) {
    try {
      rpc_send(messages.reminders_changed, { account_id });
    } catch (error) {
      logger.warn("reminders", `change broadcast skipped account_id=${account_id} error=${error}`);
    }
  }
}

export function start_reminder_worker(): void {
  if (reminder_timer) return;
  check_due_reminders();
  reminder_timer = setInterval(check_due_reminders, REMINDER_POLL_INTERVAL);
}

export function stop_reminder_worker(): void {
  if (!reminder_timer) return;
  clearInterval(reminder_timer);
  reminder_timer = null;
}
