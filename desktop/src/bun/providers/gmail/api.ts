import { gmail_fetch, parse_message_full, parse_message_metadata, SyncResetError, InvalidHistoryIdError, GmailAuthError, chunkArray, sleep, send_batch_with_retry } from "./utils";
export { SyncResetError, InvalidHistoryIdError, GmailAuthError, parse_message_full };
import { logger } from "../../utils/logger";
import { html_decode_url } from "../../utils/html";
import { error_message } from "../../../shared/errors";
import { Tel } from "../../utils/tel";
import type { EmailInput } from "../../db/emails";
import type { AttachmentRow } from "../../db/attachments";
import type { GmailMessage, GmailMessagePart } from "./types";

const tel = new Tel("gmail_api");

const BATCH_SIZE = 10;
const BATCH_SLEEP_MS = 2000;
const LIST_MAX_RESULTS = 500;

// Adaptive pacing — module-level state, persists across a backfill session
let _adaptive_sleep_ms = BATCH_SLEEP_MS;
let _clean_batches_since_rate_limit = 0;

function _get_adaptive_sleep_ms(): number {
  return _adaptive_sleep_ms;
}

function _record_batch_outcome(hasFailures: boolean): void {
  if (hasFailures) {
    _clean_batches_since_rate_limit = 0;
    const next = Math.min(_adaptive_sleep_ms * 2, 10000);
    if (next !== _adaptive_sleep_ms) {
      _adaptive_sleep_ms = next;
      logger.warn("gmail", `adaptive pacing: increased sleep to ${_adaptive_sleep_ms}ms`);
    }
  } else {
    _clean_batches_since_rate_limit++;
    if (_clean_batches_since_rate_limit >= 5) {
      _clean_batches_since_rate_limit = 0;
      const next = Math.max(Math.floor(_adaptive_sleep_ms / 2), 500);
      if (next !== _adaptive_sleep_ms) {
        _adaptive_sleep_ms = next;
        logger.info("gmail", `adaptive pacing: decreased sleep to ${_adaptive_sleep_ms}ms`);
      }
    }
  }
}

export function reset_adaptive_pacing(): void {
  _adaptive_sleep_ms = BATCH_SLEEP_MS;
  _clean_batches_since_rate_limit = 0;
}

type FetchedEmails = Promise<{
  emails: EmailInput[];
  attachments: AttachmentRow[];
  newHistoryId?: string;
  hasMore: boolean;
  deletedIds: string[];
  newIds: string[];
}>;
type FetchedEmailsByPage = Promise<{
  emails: EmailInput[];
  attachments: AttachmentRow[];
  nextCursor?: string;
  lastHistoryId?: string;
  hasMore: boolean;
  oldestReceivedAt?: string;
}>;

export type GmailProfile = { email_address: string; messages_total: number; threads_total: number; history_id: string };

export const fetch_gmail_profile = async (access_token: string): Promise<GmailProfile> => {
  const resp = await gmail_fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", access_token);
  const raw = await resp.json() as any;
  return {
    email_address: raw.emailAddress,
    messages_total: raw.messagesTotal,
    threads_total: raw.threadsTotal,
    history_id: raw.historyId,
  };
};

function map_gmail_part(raw: Record<string, any>): GmailMessagePart {
  const body: GmailMessagePart["body"] = {
    size: raw.body?.size,
    data: raw.body?.data,
    attachment_id: raw.body?.attachmentId,
  };
  return {
    part_id: raw.partId,
    mime_type: raw.mimeType,
    filename: raw.filename,
    headers: raw.headers ?? [],
    body,
    parts: raw.parts ? raw.parts.map(map_gmail_part) : undefined,
  };
}

function map_gmail_message(raw: Record<string, any>): GmailMessage {
  return {
    id: raw.id,
    thread_id: raw.threadId,
    label_ids: raw.labelIds ?? [],
    snippet: raw.snippet,
    history_id: raw.historyId,
    internal_date: raw.internalDate,
    payload: map_gmail_part(raw.payload),
    size_estimate: raw.sizeEstimate,
  };
}

export const fetch_email_by_id = async (access_token: string, id: string, format?: string): Promise<any> => {
  const t = tel.start("fetch_email_by_id", id);
  try {
    const fmt = format ?? "full";
    const resp = await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=${fmt}`, access_token,);
    t.mark("http");
    const raw = await resp.json();
    t.mark("json");
    if (fmt === "raw") return raw;
    const mapped = map_gmail_message(raw);
    t.mark("map");
    return mapped;
  } finally {
    t.done();
  }
};

export async function fetch_bodies_batch(access_token: string, account_id: string, ids: string[]): Promise<{ email: EmailInput; attachments: any[] }[]> {
  let skipped = 0;
  const results: { email: EmailInput; attachments: any[] }[] = [];
  for (const chunk of chunkArray(ids, 10)) {
    for (const id of chunk) {
      let msg: any;
      try {
        msg = await fetch_email_by_id(access_token, id, "full");
      } catch (e) {
        skipped++;
        continue;
      }
      try {
        const parsed = parse_message_full(msg, account_id);
        const resolvedHtml = await resolve_inline_cids(
          access_token,
          msg.id,
          parsed.email.body_html ?? null,
          parsed.attachments,
        );
        if (resolvedHtml) parsed.email.body_html = resolvedHtml;
        results.push({ email: parsed.email, attachments: parsed.attachments });
      } catch (e) {
        logger.warn("gmail", `fetch_bodies_batch: parse failed for ${msg.id}: ${e}`);
      }
    }
    await sleep(_get_adaptive_sleep_ms());
  }
  logger.info("gmail", `fetch_bodies_batch: cached=${results.length} skipped=${skipped} total=${ids.length}`);
  return results;
}

export const fetch_new_emails_by_history_id = async (access_token: string, account_id: string, history_id: string, pageToken?: string): FetchedEmails => {
  const historyTypes = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"];
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${history_id}&${historyTypes.map(t => `historyTypes=${t}`).join("&")}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  if (resp.status === 401) throw new GmailAuthError();

  if (resp.status === 404) {
    logger.info("gmail", "fetch_new_emails_by_history_id: got 404, throwing SyncResetError");
    throw new SyncResetError(history_id);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    if (resp.status === 400 && body.includes("Missing/invalid parameter: startHistoryId")) {
      logger.info("gmail", "fetch_new_emails_by_history_id: got 400 with invalid startHistoryId, throwing InvalidHistoryIdError");
      throw new InvalidHistoryIdError(history_id);
    }
    throw new Error(`Gmail API error ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as {
    history?: {
      id: string;
      messagesAdded?: { message: { id: string; thread_id: string } }[];
      messagesDeleted?: { message: { id: string; thread_id: string } }[];
      labelsAdded?: { message: { id: string; thread_id: string }; label_ids: string[] }[];
      labelsRemoved?: { message: { id: string; thread_id: string }; label_ids: string[] }[];
    }[];
    historyId?: string;
    nextPageToken?: string;
  };

  const historyRecords = data.history || [];
  const emails: EmailInput[] = [];
  const attachments: AttachmentRow[] = [];
  const deletedIds: string[] = [];

  // Collect message IDs from all event types
  const addedMessages = historyRecords.flatMap((r) => r.messagesAdded || []).map((e) => e.message);
  const labelAddedMessages = historyRecords.flatMap((r) => r.labelsAdded || []).map((e) => e.message);
  const labelRemovedMessages = historyRecords.flatMap((r) => r.labelsRemoved || []).map((e) => e.message);
  const deletedMessages = historyRecords.flatMap((r) => r.messagesDeleted || []).map((e) => e.message);

  // Deduplicate message IDs that need re-fetching
  const seen = new Set<string>();
  const allChanged = [...addedMessages, ...labelAddedMessages, ...labelRemovedMessages];
  const uniqueChanged = allChanged.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Only messagesAdded events represent genuinely new mail — label/read/star
  // changes (labelAdded/labelRemoved) are updates to existing threads and must
  // never surface as new-message notifications.
  const newSeen = new Set<string>();
  const newIds = addedMessages
    .filter((m) => {
      if (newSeen.has(m.id)) return false;
      newSeen.add(m.id);
      return true;
    })
    .map((m) => m.id);

  // Collect permanently deleted IDs
  for (const m of deletedMessages) {
    if (!seen.has(m.id)) {
      deletedIds.push(m.id);
      seen.add(m.id);
    }
  }
  if (deletedIds.length) logger.file("gmail").info(`deletedIds=${JSON.stringify(deletedIds)}`);

  // Batch-fetch metadata for changed messages
  const chunks = chunkArray(uniqueChanged, BATCH_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const items = chunk.map((m) => ({
      id: m.id,
      method: "GET" as const,
      path: `/gmail/v1/users/me/messages/${m.id}?format=metadata`,
    }));

    const results = await send_batch_with_retry(access_token, items, `history batch ${i}`);

    const hasFailures = results.some((r) => r.status !== 200);
    _record_batch_outcome(hasFailures);

    const idMap = new Map(results.filter((r) => r.status === 200 && r.body).map((r) => [r.id, r.body]));
    for (const m of chunk) {
      const msg = idMap.get(m.id);
      if (!msg) continue;
      try {
        const mapped = map_gmail_message(msg);
        const parsed = parse_message_metadata(mapped, account_id);
        emails.push(parsed.email);
        logger.file("gmail").info(`parsed=${JSON.stringify(parsed)}`);
      } catch {
        // Skip messages that fail to parse
      }
    }

    if (i < chunks.length - 1) await sleep(_get_adaptive_sleep_ms());
  }

  const newHistoryId = data.historyId || history_id;
  const nextPageToken = data.nextPageToken;

  if (nextPageToken) {
    const rest = await fetch_new_emails_by_history_id(access_token, account_id, history_id, nextPageToken);
    return {
      emails: [...emails, ...rest.emails],
      attachments: [...attachments, ...rest.attachments],
      deletedIds: [...deletedIds, ...rest.deletedIds],
      newIds: [...newIds, ...rest.newIds],
      newHistoryId: rest.newHistoryId,
      hasMore: false,
    };
  }

  return {
    emails,
    attachments,
    deletedIds,
    newIds,
    newHistoryId: newHistoryId,
    hasMore: false,
  };
};

type FetchEmailsByPageTokenOptions = { maxResults?: number; beforeDate?: string };
export const fetch_emails_by_page_token = async (access_token: string, account_id: string, pageToken?: string, opts?: FetchEmailsByPageTokenOptions): FetchedEmailsByPage => {
  const maxResults = opts?.maxResults ?? LIST_MAX_RESULTS;
  let listUrl =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages` +
    `?maxResults=${maxResults}&includeSpamTrash=true`;
  if (pageToken) listUrl += `&pageToken=${pageToken}`;
  if (opts?.beforeDate) listUrl += `&q=before:${opts.beforeDate}`;

  logger.info("gmail", `fetch_emails_by_page_token: pageToken=${pageToken ?? "null"} maxResults=${maxResults} beforeDate=${opts?.beforeDate ?? "null"}`);
  const listResp = await gmail_fetch(listUrl, access_token);
  const listData = (await listResp.json()) as {
    messages?: { id: string; thread_id: string }[];
    nextPageToken?: string;
    resultSizeEstimate: number;
  };

  const message_ids = (listData.messages || []).map((m) => m.id);
  const nextPageToken = listData.nextPageToken;
  logger.info("gmail", `fetch_emails_by_page_token: got ${message_ids.length} message ids, nextPageToken=${nextPageToken ?? "null"}`);

  const chunks = chunkArray(message_ids, BATCH_SIZE);
  const rawMessages: (any | null)[] = new Array(message_ids.length).fill(null);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const items = chunk.map((id) => ({
      id,
      method: "GET" as const,
      path: `/gmail/v1/users/me/messages/${id}?format=metadata`,
    }));

    const results = await send_batch_with_retry(access_token, items, `metadata batch ${i}`);

    const hasFailures = results.some((r) => r.status !== 200);
    _record_batch_outcome(hasFailures);

    const idMap = new Map(results.filter((r) => r.status === 200 && r.body).map((r) => [r.id, r.body]));
    for (let j = 0; j < chunk.length; j++) {
      const globalIdx = i * BATCH_SIZE + j;
      rawMessages[globalIdx] = idMap.get(chunk[j]) ?? null;
    }

    if (i < chunks.length - 1) await sleep(_get_adaptive_sleep_ms());
  }

  const emails: EmailInput[] = [];
  const attachments: AttachmentRow[] = [];
  let lastHistoryId: string | undefined;
  let oldestReceivedAt: string | undefined;

  for (const msg of rawMessages) {
    if (!msg) continue;
    const mapped = map_gmail_message(msg);
    const parsed = parse_message_metadata(mapped, account_id);
    emails.push(parsed.email);
    lastHistoryId = mapped.history_id || lastHistoryId;
    if (parsed.email.received_at && (!oldestReceivedAt || parsed.email.received_at < oldestReceivedAt)) {
      oldestReceivedAt = parsed.email.received_at;
    }
  }

  const nextCursor = nextPageToken ?? lastHistoryId;
  logger.info("gmail", `fetch_emails_by_page_token complete: fetched ${emails.length} emails oldestReceivedAt=${oldestReceivedAt ?? "null"}`);

  return { emails, attachments, nextCursor, lastHistoryId, hasMore: !!nextPageToken, oldestReceivedAt };
};

type AttachmentForCids = { cid: string | null; remote_url: string | null; mime_type: string | null };

export async function resolve_inline_cids(access_token: string, message_id: string, body_html: string | null, attachments: AttachmentForCids[]): Promise<string | null> {
  if (!body_html) return body_html;

  const srcPattern = /src=(["'])cid:([^"']+)\1/gi;
  const cids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = srcPattern.exec(body_html)) !== null) {
    cids.add(match[2]);
  }

  if (cids.size === 0) return body_html;

  const cidToAttachment = new Map(
    attachments.filter((a) => a.cid && a.remote_url).map((a) => [a.cid!, a]),
  );

  const cidToDataUri = new Map<string, string>();
  const fetches: Promise<void>[] = [];

  for (const cid of cids) {
    const attachment = cidToAttachment.get(cid);
    if (!attachment) continue;

    const attachment_idMatch = attachment.remote_url!.match(/gmail:\/\/[^/]+\/(.+)/);
    if (!attachment_idMatch) continue;
    const attachment_id = attachment_idMatch[1];

    fetches.push(
      download_attachment(access_token, message_id, attachment_id)
        .then((buf) => {
          const base64 = buf.toString("base64");
          cidToDataUri.set(cid, `data:${attachment.mime_type ?? "application/octet-stream"};base64,${base64}`);
        })
        .catch((err) => {
          logger.warn("gmail", `failed to fetch inline image cid=${cid}: ${error_message(err)}`);
        }),
    );
  }

  await Promise.all(fetches);

  if (cidToDataUri.size === 0) return body_html;

  srcPattern.lastIndex = 0;
  return body_html.replace(srcPattern, (_full, quote, cid) => {
    const dataUri = cidToDataUri.get(cid);
    return dataUri ? `src=${quote}${dataUri}${quote}` : _full;
  });
}

export function resolve_external_image_urls(body_html: string, proxy_base: string, proxy_key: string): string {
  if (!body_html || !proxy_base || !proxy_key) return body_html;

  const to_proxy = (url: string): string => {
    if (!/^https?:\/\//i.test(url)) return url;
    if (url.startsWith(proxy_base) || /\/image_proxy\?/i.test(url)) return url;
    return `${proxy_base}/image_proxy?url=${encodeURIComponent(html_decode_url(url))}&k=${encodeURIComponent(proxy_key)}`;
  };

  const rewrite_srcset = (value: string): string =>
    value
      .split(",")
      .map((part) => {
        const m = part.trim().match(/^(\S+)(\s+.*)?$/);
        if (!m) return part;
        return `${to_proxy(m[1])}${m[2] ?? ""}`;
      })
      .join(",");

  let result = body_html;
  result = result.replace(/(srcset\s*=\s*)(["'])([^"']+)\2/gi, (_full, pre, quote, value) => `${pre}${quote}${rewrite_srcset(value)}${quote}`);
  result = result.replace(/((?:^|\s)(?:src|poster|background)\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi, (_full, pre, quote, url) => `${pre}${quote}${to_proxy(url)}${quote}`);
  result = result.replace(/((?:^|\s)(?:src|poster|background)\s*=\s*)([^\s"'`>]+)/gi, (_full, pre, url) => /^https?:\/\//i.test(url) ? `${pre}${to_proxy(url)}` : _full);
  result = result.replace(/(url\(\s*)(["']?)(https?:\/\/[^)"']+)\2(\s*\))/gi, (_full, pre, quote, url, post) => `${pre}${quote}${to_proxy(url)}${quote}${post}`);
  return result;
}

export const download_attachment = async (access_token: string, message_id: string, attachment_id: string): Promise<Buffer> => {
  const resp = await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/attachments/${attachment_id}`,
    access_token,
  );
  const data = (await resp.json()) as { size: number; data: string };
  return Buffer.from(data.data, "base64url");
};

export const modify_message = async (access_token: string, message_id: string, body: { add_label_ids?: string[]; remove_label_ids?: string[] }): Promise<void> => {
  await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/modify`,
    access_token,
    {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: body.add_label_ids,
        removeLabelIds: body.remove_label_ids,
      }),
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const batch_modify = async (access_token: string, ids: string[], body: { add_label_ids?: string[]; remove_label_ids?: string[] }): Promise<void> => {
  await gmail_fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
    access_token,
    {
      method: "POST",
      body: JSON.stringify({
        ids,
        addLabelIds: body.add_label_ids,
        removeLabelIds: body.remove_label_ids,
      }),
      headers: { "Content-Type": "application/json" },
    },
  );
};

export type SendAsAlias = {
  send_as_email: string;
  display_name?: string;
  reply_to_address?: string;
  signature?: string;
  is_primary: boolean;
  is_default: boolean;
  treat_as_alias: boolean;
  verification_status: string;
};

function map_gmail_send_as(raw: Record<string, unknown>): SendAsAlias {
  return {
    send_as_email: raw.sendAsEmail as string,
    display_name: raw.displayName as string | undefined,
    reply_to_address: raw.replyToAddress as string | undefined,
    signature: raw.signature as string | undefined,
    is_primary: raw.isPrimary as boolean,
    is_default: raw.isDefault as boolean,
    treat_as_alias: raw.treatAsAlias as boolean,
    verification_status: raw.verificationStatus as string,
  };
}

export const fetch_send_as_list = async (access_token: string): Promise<SendAsAlias[]> => {
  const resp = await gmail_fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs",
    access_token,
  );
  const data = (await resp.json()) as { sendAs: Record<string, unknown>[] };
  return (data.sendAs || []).map(map_gmail_send_as);
};

export const update_send_as = async (
  access_token: string,
  send_as_email: string,
  body: { signature?: string; display_name?: string; reply_to_address?: string },
): Promise<void> => {
  const raw: Record<string, string | undefined> = {};
  if (body.signature !== undefined) raw.signature = body.signature;
  if (body.display_name !== undefined) raw.displayName = body.display_name;
  if (body.reply_to_address !== undefined) raw.replyToAddress = body.reply_to_address;
  const encoded = encodeURIComponent(send_as_email);
  const resp = await gmail_fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encoded}`,
    access_token,
    {
      method: "PUT",
      body: JSON.stringify(raw),
      headers: { "Content-Type": "application/json" },
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail update sendAs failed (${resp.status}): ${errText}`);
  }
};

export const trash_message = async (access_token: string, message_id: string): Promise<void> => {
  await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/trash`,
    access_token,
    { method: "POST" },
  );
};

// drafts

export const create_draft = async (access_token: string, raw: string, thread_id?: string): Promise<{ id: string; message: { id: string; thread_id: string } }> => {
  const body: Record<string, unknown> = { message: { raw } };
  if (thread_id) body.threadId = thread_id;
  const resp = await gmail_fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    access_token,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail create draft failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json() as { id: string; message: { id: string; threadId: string } };
  return { id: data.id, message: { id: data.message.id, thread_id: data.message.threadId } };
};

export const update_draft = async (access_token: string, draft_id: string, raw: string): Promise<{ id: string; message: { id: string; thread_id: string } }> => {
  const resp = await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draft_id}`,
    access_token,
    {
      method: "PUT",
      body: JSON.stringify({ message: { raw } }),
      headers: { "Content-Type": "application/json" },
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail update draft failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json() as { id: string; message: { id: string; threadId: string } };
  return { id: data.id, message: { id: data.message.id, thread_id: data.message.threadId } };
};

export const delete_draft = async (access_token: string, draft_id: string): Promise<void> => {
  const resp = await gmail_fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draft_id}`,
    access_token,
    { method: "DELETE" },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail delete draft failed (${resp.status}): ${errText}`);
  }
};

export const send_draft = async (access_token: string, draft_id: string): Promise<{ id: string; thread_id: string }> => {
  const resp = await gmail_fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
    access_token,
    {
      method: "POST",
      body: JSON.stringify({ id: draft_id }),
      headers: { "Content-Type": "application/json" },
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail send draft failed (${resp.status}): ${errText}`);
  }
  const raw = await resp.json() as { id: string; threadId: string };
  return { id: raw.id, thread_id: raw.threadId };
};

export const list_drafts = async (access_token: string): Promise<{ id: string; message: { id: string; thread_id: string } }[]> => {
  const all: { id: string; message: { id: string; thread_id: string } }[] = [];
  let pageToken: string | undefined;
  do {
    let url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=500";
    if (pageToken) url += `&pageToken=${pageToken}`;
    const resp = await gmail_fetch(url, access_token);
    if (resp.status === 401) throw new GmailAuthError();
    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      throw new Error(`Gmail list drafts failed (${resp.status}): ${errText}`);
    }
    const data = await resp.json() as { drafts?: { id: string; message: { id: string; threadId: string } }[]; nextPageToken?: string };
    if (data.drafts) {
      for (const d of data.drafts) {
        all.push({ id: d.id, message: { id: d.message.id, thread_id: d.message.threadId } });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
};

export async function fetch_filters(access_token: string): Promise<FilterWire[]> {
  const resp = await gmail_fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/filters", access_token);
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail list filters failed (${resp.status}): ${errText}`);
  }
  const data = (await resp.json()) as { filter?: { id: string; criteria?: Record<string, unknown>; action?: Record<string, unknown> }[] };
  return (data.filter ?? []).map((f) => {
    const action = f.action as Record<string, unknown> | undefined;
    return {
      id: f.id,
      account_id: "",
      criteria: f.criteria as FilterCriteriaWire ?? {},
      action: {
        add_label_ids: (action?.addLabelIds ?? action?.add_label_ids) as string[] | undefined,
        remove_label_ids: (action?.removeLabelIds ?? action?.remove_label_ids) as string[] | undefined,
        forward: action?.forward as string | undefined,
      },
    };
  });
}

export async function create_filter(
  access_token: string,
  criteria: FilterCriteriaWire,
  action: FilterActionWire,
): Promise<{ id: string }> {
  const body = JSON.stringify({
    criteria,
    action: {
      ...action,
      addLabelIds: action.add_label_ids,
      removeLabelIds: action.remove_label_ids,
      add_label_ids: undefined,
      remove_label_ids: undefined,
    },
  });
  const resp = await gmail_fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/settings/filters",
    access_token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail create filter failed (${resp.status}): ${errText}`);
  }
  return (await resp.json()) as { id: string };
}

// labels

export async function create_label(access_token: string, name: string): Promise<{ id: string; name: string; type: string }> {
  const resp = await gmail_fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    access_token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show", type: "user" }),
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail create label failed (${resp.status}): ${errText}`);
  }
  return resp.json();
}

export async function update_label(access_token: string, label_id: string, name: string): Promise<void> {
  const resp = await gmail_fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/${label_id}`,
    access_token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: label_id, name, labelListVisibility: "labelShow", messageListVisibility: "show", type: "user" }),
    },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail update label failed (${resp.status}): ${errText}`);
  }
}

export async function delete_label(access_token: string, label_id: string): Promise<void> {
  const resp = await gmail_fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/${label_id}`,
    access_token,
    { method: "DELETE" },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail delete label failed (${resp.status}): ${errText}`);
  }
}

export async function delete_filter(access_token: string, filterId: string): Promise<void> {
  const resp = await gmail_fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/filters/${filterId}`,
    access_token,
    { method: "DELETE" },
  );
  if (resp.status === 401) throw new GmailAuthError();
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gmail delete filter failed (${resp.status}): ${errText}`);
  }
};
