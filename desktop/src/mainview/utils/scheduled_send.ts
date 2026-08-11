import { parse_email_string } from "../components/compose/editor/contact_input";

export function is_scheduled_send(item: OutboxItemWire): boolean {
  return (
    item.command === "send_email" &&
    !!item.scheduled_at &&
    (item.status === "queued" || item.status === "sending" || item.status === "failed")
  );
}

export function parse_send_payload(payload: string | null): Record<string, any> {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

export function email_row_to_preview(row: EmailRowWire): EmailPreviewWire {
  return {
    id: row.id,
    account_id: row.account_id,
    thread_id: row.thread_id,
    thread_message_count: null,
    subject: row.subject,
    from_name: row.from_name,
    from_address: row.from_address,
    toAddr: row.to,
    cc: row.cc,
    bcc: row.bcc,
    snippet: row.snippet,
    labels: [],
    classification_labels: null,
    folder: row.folder,
    is_read: row.is_read,
    is_starred: row.is_starred,
    is_flagged: row.is_flagged,
    sent_at: row.sent_at,
    received_at: row.received_at,
    draft_mode: null,
    original_email_id: null,
  };
}

export function payload_to_contacts(payload: Record<string, any>, field: "to" | "cc" | "bcc") {
  return payload[field] ? parse_email_string(String(payload[field])) : [];
}
