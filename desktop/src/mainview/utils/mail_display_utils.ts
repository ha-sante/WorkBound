import { format_date_compact } from "@/shared/datetime";
import { parse_email_string } from "../components/compose/editor/contact_input";
import { parse_send_payload } from "./scheduled_send";

export function format_file_size(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function first_display_name(raw: string | null | undefined, fallback: string): string {
  const parsed = raw ? parse_email_string(String(raw)) : [];
  if (parsed.length === 0) return fallback;
  return parsed[0].name || parsed[0].email;
}

export function display_name_for(email: EmailPreviewWire): string {
  if (email.folder === "drafts") return first_display_name(email.toAddr, "No Recipients");
  if (email.folder === "sent") return `To: ${first_display_name(email.toAddr, "Unknown")}`;
  return email.from_name || email.from_address || "Unknown";
}

const first_recipient = (item: OutboxItemWire, payload: Record<string, any>): string => first_display_name(item.to_addr ?? payload.to, "No Recipients");

export function build_reminder_rows(items: ReminderWire[], emails_by_folder: Record<string, EmailPreviewWire[]>): ReminderListRow[] {
  const by_id = new Map<string, EmailPreviewWire>();
  for (const list of Object.values(emails_by_folder)) {
    for (const email of list) {
      if (!by_id.has(email.id)) by_id.set(email.id, email);
    }
  }
  const rows: ReminderListRow[] = [];
  for (const item of items) {
    const email = by_id.get(item.email_id);
    if (!email) continue;
    rows.push({
      kind: "reminder",
      id: email.id,
      folder: email.folder,
      account_id: email.account_id,
      name: display_name_for(email),
      subject: email.subject ?? "",
      snippet: email.snippet ?? "",
      time_label: format_date_compact(item.remind_at ? new Date(item.remind_at).toISOString() : null),
      reminder: item,
    });
  }
  return rows;
}

export function build_scheduled_rows(items: OutboxItemWire[]): ScheduledListRow[] {
  return items.map((item) => {
    const payload = parse_send_payload(item.payload);
    return {
      kind: "scheduled",
      id: item.id,
      account_id: item.account_id,
      name: first_recipient(item, payload),
      subject: String(payload.subject ?? item.subject ?? ""),
      snippet: String(payload.body_text ?? ""),
      time_label: format_date_compact(item.scheduled_at ? new Date(item.scheduled_at).toISOString() : null),
      status: item.status === "failed" ? "failed" : item.status === "sending" ? "sending" : "queued",
      item,
    };
  });
}

export function row_email(row: MailListRow, emails_by_folder: Record<string, EmailPreviewWire[]>): EmailPreviewWire | null {
  if (!("kind" in row)) return row;
  if (row.kind === "reminder") {
    return emails_by_folder[row.folder]?.find((email) => email.id === row.id) ?? null;
  }
  return null;
}
