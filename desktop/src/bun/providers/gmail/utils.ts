import type { EmailWithHeaders } from "../../db/emails";
import type { AttachmentRow } from "../../db/attachments";
import type { GmailMessage, GmailMessagePart, RawAttachment, ExtractedParts, BatchItem, BatchResult } from "./types";
import { logger } from "../../utils/logger";
import { sleep, backoff_delay_ms } from "../../utils/retry";
export { sleep };

export class GmailAuthError extends Error {
  constructor() {
    super("Gmail API authentication failed");
    this.name = "GmailAuthError";
  }
}

export class InvalidGrantError extends Error {
  constructor() {
    super("Refresh token has been revoked or expired");
    this.name = "InvalidGrantError";
  }
}

export class SyncResetError extends Error {
  constructor(public staleHistoryId: string) {
    super(`History ID ${staleHistoryId} is too old, full re-sync required`);
    this.name = "SyncResetError";
  }
}

export class InvalidHistoryIdError extends Error {
  constructor(public badHistoryId: string) {
    super(`History ID ${badHistoryId} is not a valid history_id`);
    this.name = "InvalidHistoryIdError";
  }
}

export async function gmail_fetch(url: string, access_token: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${access_token}`,
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    throw new Error(`Gmail API error ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  }
  return resp;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildBatchBody(items: BatchItem[], boundary: string): string {
  let body = "";
  for (const item of items) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: application/http\r\n`;
    body += `Content-ID: <${item.id}>\r\n`;
    body += `\r\n`;
    body += `${item.method} ${item.path} HTTP/1.1\r\n`;
    body += `\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return body;
}

function parse_batch_response(respText: string, boundary: string): BatchResult[] {
  const parts = respText.split(`--${boundary}`);
  const results: BatchResult[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "--" || trimmed === "--\r\n") continue;

    const cidMatch = part.match(/Content-ID:\s*<(.+?)>/i);
    const id = cidMatch ? cidMatch[1].replace(/^response-/, "") : "";

    const statusMatch = part.match(/HTTP\/\d+\.\d+\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    const httpIdx = part.indexOf("HTTP/");
    if (httpIdx === -1) { results.push({ id, status, body: null, headers: {} }); continue; }

    // Find the blank line separating headers from body
    const afterStatusLine = part.indexOf("\r\n", httpIdx);
    if (afterStatusLine === -1) { results.push({ id, status, body: null, headers: {} }); continue; }

    const headersEnd = part.indexOf("\r\n\r\n", afterStatusLine);
    if (headersEnd === -1) { results.push({ id, status, body: null, headers: {} }); continue; }

    // Parse headers between status line and blank line
    const headerLines = part.slice(afterStatusLine + 2, headersEnd).split("\r\n");
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim().toLowerCase();
      const value = line.slice(sep + 1).trim();
      headers[key] = value;
    }

    const bodyStr = part.slice(headersEnd + 4).trim();
    let body: any = null;
    try { body = JSON.parse(bodyStr); } catch {}
    results.push({ id, status, body, headers });
  }

  return results;
}
export async function send_batch(access_token: string, items: BatchItem[]): Promise<BatchResult[]> {
  if (items.length === 0) return [];

  const boundary = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const body = buildBatchBody(items, boundary);

  const resp = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/mixed; boundary="${boundary}"`,
      Authorization: `Bearer ${access_token}`,
    },
    body,
  });

  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail batch API error ${resp.status}: ${errText}`);
  }

  const respText = await resp.text();
  const respContentType = resp.headers.get("content-type") || "";
  const respBoundaryMatch = respContentType.match(/boundary="?([^";]+)"?/);
  const respBoundary = respBoundaryMatch?.[1] ?? boundary;

  return parse_batch_response(respText, respBoundary);
}

export async function send_batch_with_retry(
  access_token: string,
  items: BatchItem[],
  batchLabel: string,
): Promise<BatchResult[]> {
  let results = await send_batch(access_token, items);

  const rateLimited = results.filter((r) => {
    if (r.status === 429) return true;
    if (r.status === 403 && r.body?.error) {
      const reason = r.body.error.reason || r.body.error.errors?.[0]?.reason || "";
      return reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
    }
    return false;
  });
  if (rateLimited.length === 0) return results;

  const rateInfo = rateLimited.map((r) => {
    const reason = r.body?.error?.reason || r.body?.error?.errors?.[0]?.reason || "unknown";
    return `id=${r.id} reason=${reason}`;
  }).join(" | ");
  logger.warn("gmail", `${batchLabel}: ${rateLimited.length} rate-limited (${rateInfo})`);

  // Exponential backoff: min(2^n * 1000 + rand(1000), 32000)
  // n=1 for first retry → 2000-3000ms
  const backoffMs = backoff_delay_ms(0, 2000, 32000) + Math.floor(Math.random() * 1000);
  logger.warn("gmail", `${batchLabel}: retrying ${rateLimited.length} items after ${backoffMs}ms`);
  await sleep(backoffMs);

  const retryPaths = new Map(items.map((i) => [i.id, i.path]));
  const retryItems = rateLimited.map((r) => ({
    id: r.id,
    method: "GET" as const,
    path: retryPaths.get(r.id) ?? "",
  })).filter((i) => i.path);

  if (retryItems.length > 0) {
    const retryResults = await send_batch(access_token, retryItems);
    const retryMap = new Map(retryResults.map((r) => [r.id, r]));
    results = results.map((r) => (rateLimited.some((rl) => rl.id === r.id) && retryMap.has(r.id) ? retryMap.get(r.id)! : r));
  }

  const stillFailed = results.filter((r) => r.status !== 200);
  if (stillFailed.length > 0) {
    const summary = stillFailed.map((r) => {
      const reason = r.body?.error?.reason || r.body?.error?.errors?.[0]?.reason || "unknown";
      return `id=${r.id} status=${r.status} reason=${reason}`;
    }).join(" | ");
    logger.warn("gmail", `${batchLabel}: ${stillFailed.length} still failed after retry (${summary})`);
  }

  return results;
}

function decode_base64_url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function get_header(part: GmailMessagePart, name: string): string | null {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}


function parse_from(value: string): { name: string | null; address: string } {
  const match = value.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  return { name: null, address: value.trim() };
}

function parse_labels(label_ids: string[]): ParsedLabels {
  // Gmail message “location” is effectively its set of labels.
  // Our DB `emails.folder` is derived from system labels.
  // In particular, archived mail often has no INBOX/SENT and should map to "all".
  let folder = "all";
  if (label_ids.includes("SPAM")) folder = "spam";
  else if (label_ids.includes("TRASH")) folder = "bin";
  else if (label_ids.includes("DRAFT")) folder = "drafts";
  else if (label_ids.includes("SENT")) folder = "sent";
  else if (label_ids.includes("INBOX")) folder = "inbox";

  return {
    folder,
    is_read: label_ids.includes("UNREAD") ? 0 : 1,
    is_starred: label_ids.includes("STARRED") ? 1 : 0,
    is_flagged: label_ids.includes("IMPORTANT") ? 1 : 0,
  };
}

function build_attachment_rows(raw_attachments: RawAttachment[], email_id: string): AttachmentRow[] {
  return raw_attachments.map((ra) => ({
    id: crypto.randomUUID(),
    email_id,
    filename: ra.filename,
    mime_type: ra.mime_type || null,
    size: ra.size || null,
    disposition: ra.disposition ?? null,
    part_id: ra.part_id ?? null,
    headers: ra.headers ? JSON.stringify(ra.headers) : null,
    local_path: null,
    cache_path: null,
    remote_url: `gmail://${email_id}/${ra.attachment_id}`,
    cid: ra.cid,
    data: null,
  }));
}

function extract_parts(part: GmailMessagePart): ExtractedParts {
  let text_plain: string | null = null;
  let text_html: string | null = null;
  const raw_attachments: RawAttachment[] = [];

  function walk(p: GmailMessagePart) {
    if (p.parts && p.parts.length > 0) {
      for (const child of p.parts) walk(child);
      return;
    }

    const mime_type = (p.mime_type ?? "").toLowerCase().split(";")[0].trim();
    const isAttachment = !!p.filename && !!p.body?.attachment_id;

    if (isAttachment) {
      const cidHeader = get_header(p, "content-id");
      const dispositionHeader = get_header(p, "content-disposition");
      raw_attachments.push({
        filename: p.filename,
        mime_type: (p.mime_type ?? "").toLowerCase(),
        size: p.body?.size ?? 0,
        attachment_id: p.body.attachment_id!,
        cid: cidHeader?.replace(/[<>]/g, "") ?? null,
        disposition: dispositionHeader ? dispositionHeader.split(";")[0].trim().toLowerCase() : null,
        part_id: p.part_id ?? null,
        headers: p.headers ?? null,
      });
      return;
    }

    if (p.body?.data) {
      const decoded = decode_base64_url(p.body.data);
      if (mime_type === "text/plain" && !text_plain) {
        text_plain = decoded;
      } else if (mime_type === "text/html" && !text_html) {
        text_html = decoded;
      }
    }
  }

  walk(part);
  return { text_plain, text_html, raw_attachments };
}

function safe_parse_date(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function header_to_ms(value: string | null): number {
  if (!value) return NaN;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  return Date.parse(trimmed);
}

export function gmail_scheduled_at_ms(headers_json: string | null, received_at: string | null): number | null {
  const now = Date.now();

  if (headers_json) {
    try {
      const parsed = JSON.parse(headers_json);
      if (Array.isArray(parsed)) {
        const get = (name: string) => {
          const hit = parsed.find((h) => typeof h?.name === "string" && h.name.toLowerCase() === name.toLowerCase());
          return hit?.value ?? null;
        };

        const scheduled = header_to_ms(get("X-GMail-Scheduled-Time"));
        if (!isNaN(scheduled) && scheduled > now) return scheduled;

        const dateTs = header_to_ms(get("Date"));
        if (!isNaN(dateTs) && dateTs > now) return dateTs;
      }
    } catch {
      // fall through to received_at
    }
  }

  if (received_at) {
    const ts = Date.parse(received_at);
    if (!isNaN(ts) && ts > now) return ts;
  }

  return null;
}

export function parse_addresses(raw: string | null): { name: string | null; email: string }[] {
  if (!raw) return [];
  const results: { name: string | null; email: string }[] = [];
  let i = 0;
  let current = "";
  let inQuote = false;

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"' && (i === 0 || raw[i - 1] !== '\\')) {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === ',' && !inQuote) {
      const trimmed = current.trim();
      if (trimmed) {
        const parsed = parse_single_address(trimmed);
        if (parsed) results.push(parsed);
      }
      current = "";
    } else {
      current += ch;
    }
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) {
    const parsed = parse_single_address(trimmed);
    if (parsed) results.push(parsed);
  }

  return results;
}

function parse_single_address(raw: string): { name: string | null; email: string } | null {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch) {
    const email = angleMatch[1].trim();
    const before = raw.slice(0, raw.indexOf("<")).trim();
    const name = before ? before.replace(/^["']|["']$/g, "").trim() : null;
    return { name, email };
  }

  const cleaned = raw.trim();
  if (cleaned.includes("@") && !cleaned.includes(" ")) {
    return { name: null, email: cleaned };
  }

  return null;
}

export const parse_message = (msg: GmailMessage, account_id: string): { email: EmailWithHeaders } => {
  const labels = parse_labels(msg.label_ids || []);
  const from = parse_from(get_header(msg.payload, "From") || "");
  const dateStr = get_header(msg.payload, "Date");

  const email: EmailWithHeaders = {
    id: msg.id,
    provider: "gmail",
    account_id,
    thread_id: msg.thread_id,
    message_id: get_header(msg.payload, "Message-ID"),
    subject: get_header(msg.payload, "Subject"),
    from_name: from.name,
    from_address: from.address,
    to: get_header(msg.payload, "To"),
    cc: get_header(msg.payload, "Cc"),
    bcc: get_header(msg.payload, "Bcc"),
    reply_to: get_header(msg.payload, "In-Reply-To"),
    reply_to_address: get_header(msg.payload, "Reply-To"),
    headers: JSON.stringify(msg.payload.headers ?? []),
    labels: JSON.stringify(msg.label_ids ?? []),
    classification_labels: msg.classification_label_values ? JSON.stringify(msg.classification_label_values) : null,
    history_id: msg.history_id ?? null,
    size_estimate: msg.size_estimate ?? null,
    internal_date: msg.internal_date ? new Date(parseInt(msg.internal_date, 10)).toISOString() : null,
    cid_refs_fetched: 0,
    snippet: msg.snippet ?? null,
    folder: labels.folder,
    is_read: labels.is_read,
    is_starred: labels.is_starred,
    is_flagged: labels.is_flagged,
    received_at: dateStr ? safe_parse_date(dateStr) : null,
    sent_at: msg.internal_date ? new Date(parseInt(msg.internal_date, 10)).toISOString() : null,
    synced_at: new Date().toISOString(),
    local_draft_id: get_header(msg.payload, "X-WorkBound-Local-Id") ?? undefined,
  };

  return { email };
}

export const parse_message_full = (msg: GmailMessage, account_id: string): { email: EmailWithHeaders; attachments: AttachmentRow[] } => {
  const { email } = parse_message(msg, account_id);
  const { text_plain, text_html, raw_attachments } = extract_parts(msg.payload);
  email.body_text = text_plain;
  email.body_html = text_html;
  email.mail_cached_at = new Date().toISOString();
  const attachments = build_attachment_rows(raw_attachments, msg.id);
  return { email, attachments };
}

export const parse_message_metadata = (msg: GmailMessage, account_id: string): { email: EmailWithHeaders } => {
  const { email } = parse_message(msg, account_id);
  email.body_text = null;
  email.body_html = null;
  return { email };
}
