import { Utils } from "electrobun/bun";
import { get_pref } from "../../db/preferences";
import { messages } from "../../../shared/rpc_messages";
import { pref_keys } from "../../../shared/pref_keys";
import { rpc_send } from "../../rpc";
import { logger } from "../../utils/logger";
import { getDb } from "../../db/client";
import { emails } from "../../db/schema";
import { eq } from "drizzle-orm";

type EmailNotificationMeta = {
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  is_flagged: number | null;
  folder: string;
};

function get_email_notification_meta(id: string): EmailNotificationMeta | undefined {
  const row = getDb()
    .select({
      subject: emails.subject,
      from_name: emails.from_name,
      from_address: emails.from_address,
      snippet: emails.snippet,
      is_flagged: emails.is_flagged,
      folder: emails.folder,
    })
    .from(emails)
    .where(eq(emails.id, id))
    .get();
  return row ?? undefined;
}

function sender_matches(email: EmailNotificationMeta, allowed_senders: string[]): boolean {
  const addr = email.from_address?.toLowerCase() || "";
  const name = email.from_name?.toLowerCase() || "";
  for (const s of allowed_senders) {
    const pattern = s.toLowerCase().trim();
    if (!pattern) continue;
    if (pattern.includes("@")) {
      if (addr === pattern) return true;
    } else {
      const domain = pattern.startsWith(".") ? pattern : `.${pattern}`;
      if (addr.endsWith(`@${pattern}`) || addr.endsWith(domain)) return true;
    }
    if (name.includes(pattern)) return true;
  }
  return false;
}

function should_notify(email: EmailNotificationMeta, important_only: boolean, allowed_senders: string[]): boolean {
  if (allowed_senders.length > 0 && sender_matches(email, allowed_senders)) return true;
  if (important_only) return email.is_flagged === 1;
  return true;
}

let _permission_requested = false;

export function request_notification_permission(): void {
  if (_permission_requested) return;
  _permission_requested = true;
  try {
    Utils.showNotification({
      title: "WorkBound",
      body: "Notifications are ready",
      silent: true,
    });
  } catch (e) {
    logger.warn("notifications", `permission request failed: ${e}`);
  }
}

export function show_notifications_for_new_emails(account_id: string, email_ids: string[]): void {
  if (email_ids.length === 0) return;

  const enabled = get_pref(pref_keys.notifications_enabled);
  if (enabled === false) return;

  const important_only = get_pref(pref_keys.notifications_important_only) === true;
  const allowed_senders = (get_pref(pref_keys.notifications_allowed_senders) as string[] | null) ?? [];

  for (const email_id of email_ids) {
    try {
      const email = get_email_notification_meta(email_id);
      if (!email) continue;

       // Only notify for inbox messages; ignore spam and other non-inbox folders.
       if (email.folder !== "inbox") continue;

      if (!should_notify(email, important_only, allowed_senders)) continue;

      const subject = email.subject || "(no subject)";
      const fromDisplay = email.from_name || email.from_address || "Unknown";
      const snippet = email.snippet || "";

      Utils.showNotification({
        title: subject,
        body: `${fromDisplay}\n${snippet}`,
        subtitle: fromDisplay,
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
