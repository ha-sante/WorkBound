import { Utils } from "electrobun/bun";
import { get_pref } from "../../db/preferences";
import { pref_keys } from "../../../shared/pref_keys";
import { messages } from "../../../shared/rpc_messages";
import { rpc_send } from "../../rpc";
import { logger } from "../../utils/logger";
import { getDb } from "../../db/client";
import { emails } from "../../db/schema/emails";
import { email_has_attachments } from "../../db/schema/email_has_attachments";
import { eq } from "drizzle-orm";
import { list_notification_filters } from "../../db/notification_filters";
import { filter_matches_email } from "../../../shared/filter_matcher";

type EmailNotificationRow = {
  id: string;
  account_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  snippet: string | null;
  labels: string | null;
  folder: string;
  is_read: number | null;
  is_flagged: number | null;
  received_at: string | null;
  has_attachments: number | null;
};

function get_email_notification_meta(id: string): EmailNotificationRow | undefined {
  const row = getDb()
    .select({
      id: emails.id,
      account_id: emails.account_id,
      subject: emails.subject,
      from_name: emails.from_name,
      from_address: emails.from_address,
      to: emails.to,
      cc: emails.cc,
      bcc: emails.bcc,
      snippet: emails.snippet,
      labels: emails.labels,
      folder: emails.folder,
      is_read: emails.is_read,
      is_flagged: emails.is_flagged,
      received_at: emails.received_at,
      has_attachments: email_has_attachments.email_id,
    })
    .from(emails)
    .leftJoin(email_has_attachments, eq(email_has_attachments.email_id, emails.id))
    .where(eq(emails.id, id))
    .get();
  if (!row) return undefined;
  return { ...row, has_attachments: row.has_attachments ? 1 : 0 };
}

function notification_matches(email: EmailNotificationRow, account_id: string): boolean {
  const important_only = get_pref(pref_keys.notifications_important_only) !== false;
  const important_match = important_only && email.is_flagged === 1;
  const labels = (() => {
    try { return email.labels ? JSON.parse(email.labels) as string[] : []; } catch { return []; }
  })();
  const preview = {
    id: email.id,
    account_id,
    thread_id: null,
    thread_message_count: null,
    subject: email.subject,
    from_name: email.from_name,
    from_address: email.from_address,
    toAddr: email.to,
    cc: email.cc,
    bcc: email.bcc,
    snippet: email.snippet,
    labels,
    folder: email.folder,
    is_read: email.is_read,
    is_flagged: email.is_flagged,
    received_at: email.received_at,
    sent_at: null,
    draft_mode: null,
    original_email_id: null,
    has_attachments: email.has_attachments === 1,
  } as EmailPreviewWire;
  const custom_match = list_notification_filters(account_id)
    .some((filter) => filter.enabled && filter_matches_email(preview, filter.clauses));
  return important_match || custom_match;
}

let _permission_requested = false;

export function request_notification_permission(): void {
  if (_permission_requested) return;
  _permission_requested = true;
  try {
    Utils.showNotification({ title: "WorkBound", body: "Notifications are ready", silent: true });
  } catch (e) {
    logger.warn("notifications", `permission request failed: ${e}`);
  }
}

export function show_notifications_for_new_emails(account_id: string, email_ids: string[]): void {
  if (email_ids.length === 0 || get_pref(pref_keys.notifications_enabled) === false) return;

  for (const email_id of email_ids) {
    try {
      const email = get_email_notification_meta(email_id);
      if (!email || email.folder !== "inbox" || !notification_matches(email, account_id)) continue;

      const subject = email.subject || "(no subject)";
      const from_display = email.from_name || email.from_address || "Unknown";
      Utils.showNotification({
        title: subject,
        body: `${from_display}\n${email.snippet || ""}`,
        subtitle: from_display,
        silent: false,
      });
      rpc_send(messages.notification_email, {
        account_id,
        email_id,
        subject,
        from: email.from_address || email.from_name || "Unknown",
      });
    } catch (e) {
      logger.error("notifications", `failed to show notification for email ${email_id}: ${e}`);
    }
  }
}
