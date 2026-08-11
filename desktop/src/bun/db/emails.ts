import { getDb } from "./client";
import { emails, email_headers } from "./schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { logger } from "../utils/logger";
import {
  insert_email_meta_fts,
  delete_email_meta_fts,
  delete_email_body_fts,
} from "./fts";

export type EmailRow = InferSelectModel<typeof emails>;

export type EmailInput = typeof emails.$inferInsert;

export type EmailWithHeaders = EmailInput & { headers?: string | null };

export type UncachedRecentEmail = {
  id: string;
  account_id: string;
};

const gmailMetadataFields = {
  snippet: sql`excluded.snippet`,
  folder: sql`excluded.folder`,
  is_read: sql`excluded.is_read`,
  is_starred: sql`excluded.is_starred`,
  is_flagged: sql`excluded.is_flagged`,
  is_phishing: sql`excluded.is_phishing`,
  thread_id: sql`excluded.thread_id`,
  received_at: sql`excluded.received_at`,
  sent_at: sql`excluded.sent_at`,
  synced_at: sql`excluded.synced_at`,
  reply_to_address: sql`excluded.reply_to_address`,
  draft_mode: sql`COALESCE(excluded.draft_mode, emails.draft_mode)`,
  labels: sql`excluded.labels`,
  classification_labels: sql`excluded.classification_labels`,
  history_id: sql`excluded.history_id`,
  size_estimate: sql`excluded.size_estimate`,
  internal_date: sql`excluded.internal_date`,
  subject: sql`excluded.subject`,
  from_name: sql`excluded.from_name`,
  from_address: sql`excluded.from_address`,
  to: sql`excluded."to"`,
  cc: sql`excluded.cc`,
  bcc: sql`excluded.bcc`,
  body_text: sql`excluded.body_text`,
  body_html: sql`excluded.body_html`,
  gmail_draft_id: sql`excluded.gmail_draft_id`,
  message_id: sql`excluded.message_id`,
  local_draft_id: sql`excluded.local_draft_id`,
  updated_at: sql`datetime('now')`,
} as const;

export function upsert_email_headers(email_id: string, headers: string): void {
  getDb().insert(email_headers).values({ email_id, headers })
    .onConflictDoUpdate({ target: email_headers.email_id, set: { headers } })
    .run();
}

export function bulk_upsert_email_headers(rows: { email_id: string; headers: string }[]): void {
  if (rows.length === 0) return;
  getDb().insert(email_headers).values(rows)
    .onConflictDoUpdate({ target: email_headers.email_id, set: { headers: sql`excluded.headers` } })
    .run();
}

export function get_email_headers(email_id: string): string | null {
  const row = getDb().select({ headers: email_headers.headers }).from(email_headers)
    .where(eq(email_headers.email_id, email_id))
    .get();
  return row?.headers ?? null;
}

export function insert_email(data: EmailWithHeaders) {
  const { headers, ...emailRow } = data;
  getDb().insert(emails).values(emailRow).onConflictDoUpdate({
    target: emails.id,
    set: gmailMetadataFields,
  }).run();
  if (headers && headers.length > 0) {
    upsert_email_headers(data.id, headers);
  }
  try {
    insert_email_meta_fts(emailRow as EmailInput & { id: string });
  } catch (e) {
    logger.error("db", `insert_email: FTS insert failed for ${data.id}: ${e}`);
  }
}

export function bulk_insert_emails(rows: EmailWithHeaders[]) {
  if (rows.length === 0) return;
  const headerRows: { email_id: string; headers: string }[] = [];
  const emailRows = rows.map(({ headers, ...rest }) => {
    if (headers && headers.length > 0) {
      headerRows.push({ email_id: rest.id, headers });
    }
    return rest;
  });
  getDb().insert(emails).values(emailRows).onConflictDoUpdate({
    target: emails.id,
    set: gmailMetadataFields,
  }).run();
  bulk_upsert_email_headers(headerRows);
  for (const row of rows) {
    try {
      insert_email_meta_fts(row as EmailInput & { id: string });
    } catch (e) {
      logger.error("db", `bulk_insert_emails: FTS insert failed for ${row.id}: ${e}`);
    }
  }
}

export function get_email(id: string): EmailRow | undefined {
  const t0 = performance.now();
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  const t1 = performance.now();
  const bodySize = row ? (row.body_html?.length ?? 0) + (row.body_text?.length ?? 0) : 0;
  logger.info("db", `get_email: id=${id} ${row ? "found" : "not found"} sqlite=${(t1-t0).toFixed(1)}ms bodySize=${bodySize}`);
  return row;
}

export type EmailPreview = {
  id: string;
  account_id: string;
  thread_id: string | null;
  thread_message_count: number | null;
  toAddr: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  labels: string[];
  classification_labels: string[] | null;
  folder: string;
  is_read: number | null;
  is_starred: number | null;
  is_flagged: number | null;
  has_attachments: boolean;
  sent_at: string | null;
  received_at: string | null;
  draft_mode: DraftMode | null;
  original_email_id: string | null;
  gmail_draft_id: string | null;
  local_draft_id: string | null;
  message_id: string | null;
  avatar_url?: string | null;
};

export function preview_base() {
  return getDb().select(emailPreviewSelect).from(emails);
}

export function list_all_emails(account_id: string): EmailPreview[] {
  const rows = preview_base()
    .where(eq(emails.account_id, account_id))
    .orderBy(desc(emails.received_at))
    .all();
  logger.info("db", `list_all_emails: account=${account_id} count=${rows.length}`);
  return attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview)));
}

export function list_emails_page(account_id: string, limit: number, offset: number): { emails: EmailPreview[]; total: number } {
  const total = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(eq(emails.account_id, account_id))
    .get();
  const rows = preview_base()
    .where(eq(emails.account_id, account_id))
    .orderBy(desc(emails.received_at))
    .limit(limit)
    .offset(offset)
    .all();
  logger.info("db", `list_emails_page: account=${account_id} offset=${offset} limit=${limit} count=${rows.length} total=${total?.count ?? 0}`);
  return { emails: attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview))), total: total?.count ?? 0 };
}

export function list_emails_page_after(
  account_id: string,
  limit: number,
  before_received_at: string,
  before_id: string,
): EmailPreview[] {
  const rows = preview_base()
    .where(and(
      eq(emails.account_id, account_id),
      sql`${emails.received_at} IS NOT NULL`,
      sql`(${emails.received_at}, ${emails.id}) < (${before_received_at}, ${before_id})`,
    ))
    .orderBy(desc(emails.received_at), desc(emails.id))
    .limit(limit)
    .all();
  logger.info("db", `list_emails_page_after: account=${account_id} before=${before_received_at} limit=${limit} count=${rows.length}`);
  return attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview)));
}

export function count_emails(account_id: string): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(eq(emails.account_id, account_id))
    .get();
  return row?.count ?? 0;
}

export function list_emails_up(account_id: string, since: string): EmailPreview[] {
  const rows = preview_base()
    .where(and(eq(emails.account_id, account_id), sql`(${emails.received_at} > ${since} OR ${emails.synced_at} > ${since})`))
    .orderBy(desc(emails.received_at))
    .all();
  logger.info("db", `list_emails_up: account=${account_id} since=${since} count=${rows.length}`);
  return attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview)));
}

export function list_emails_down(account_id: string, before: string): EmailPreview[] {
  const rows = preview_base()
    .where(and(eq(emails.account_id, account_id), sql`${emails.received_at} < ${before}`))
    .orderBy(desc(emails.received_at))
    .all();
  logger.info("db", `list_emails_down: account=${account_id} before=${before} count=${rows.length}`);
  return attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview)));
}

export const emailPreviewSelect = {
  id: emails.id,
  account_id: emails.account_id,
  thread_id: emails.thread_id,
  toAddr: emails.to,
  cc: emails.cc,
  bcc: emails.bcc,
  subject: emails.subject,
  from_name: emails.from_name,
  from_address: emails.from_address,
  snippet: emails.snippet,
  labels: emails.labels,
  classification_labels: emails.classification_labels,
  folder: emails.folder,
  is_read: emails.is_read,
  is_starred: emails.is_starred,
  is_flagged: emails.is_flagged,
  sent_at: emails.sent_at,
  received_at: emails.received_at,
  gmail_draft_id: emails.gmail_draft_id,
  local_draft_id: emails.local_draft_id,
  message_id: emails.message_id,
  has_attachments: sql<boolean>`EXISTS (SELECT 1 FROM email_has_attachments m WHERE m.email_id = ${emails.id})`,
  original_email_id: emails.original_email_id,
  draft_mode: emails.draft_mode,
  avatar_url: sql<string | null>`(SELECT c.avatar_url FROM contacts c WHERE c.account_id = ${emails.account_id} AND lower(c.email) = lower(${emails.from_address}))`,
};

function parse_labels_json(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parse_classification_labels_json(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function to_email_preview(row: any): EmailPreview {
  return {
    id: row.id,
    account_id: row.account_id,
    thread_id: row.thread_id,
    thread_message_count: row.thread_message_count ?? null,
    toAddr: row.toAddr ?? null,
    cc: row.cc ?? null,
    bcc: row.bcc ?? null,
    subject: row.subject,
    from_name: row.from_name,
    from_address: row.from_address,
    snippet: row.snippet,
    labels: parse_labels_json(row.labels),
    classification_labels: parse_classification_labels_json(row.classification_labels),
    folder: row.folder,
    is_read: row.is_read,
    is_starred: row.is_starred,
    is_flagged: row.is_flagged,
    sent_at: row.sent_at,
    received_at: row.received_at,
    draft_mode: (row.draft_mode as DraftMode | null) ?? null,
    original_email_id: row.original_email_id ?? null,
    gmail_draft_id: row.gmail_draft_id ?? null,
    local_draft_id: row.local_draft_id ?? null,
    message_id: row.message_id ?? null,
    has_attachments: !!row.has_attachments,
    avatar_url: row.avatar_url ?? null,
  };
}

function deduplicate_drafts(rows: EmailPreview[]): EmailPreview[] {
  const map = new Map<string, EmailPreview>();
  for (const row of rows) {
    if (row.folder !== "drafts") {
      map.set(row.id, row);
      continue;
    }
    const key = row.gmail_draft_id || row.original_email_id || row.local_draft_id || row.message_id || row.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const score = (r: EmailPreview) =>
      (r.subject ? 1 : 0) + (r.snippet ? 1 : 0) + (r.toAddr ? 1 : 0) + (r.cc ? 1 : 0) + (r.bcc ? 1 : 0);
    if (score(row) > score(existing)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

function attach_thread_counts(rows: EmailPreview[]): EmailPreview[] {
  const threadIds = [...new Set(rows.map((r) => r.thread_id).filter((t): t is string => !!t))];
  if (threadIds.length === 0) return rows;
  const counts = getDb()
    .select({ thread_id: emails.thread_id, count: sql<number>`count(*)` })
    .from(emails)
    .where(and(inArray(emails.thread_id, threadIds), sql`${emails.folder} NOT IN ('drafts', 'sent')`))
    .groupBy(emails.thread_id)
    .all();
  const map = new Map(counts.map((c) => [c.thread_id, c.count]));
  for (const r of rows) {
    r.thread_message_count = r.thread_id ? (map.get(r.thread_id) ?? 1) : null;
  }
  return rows;
}

export function list_emails(opts: {
  account_id: string;
  folder: string;
}): EmailPreview[] {
  const { account_id, folder } = opts;
  const conditions = [eq(emails.account_id, account_id)];

  if (folder === "__all__") {
    conditions.push(sql`${emails.folder} NOT IN ('spam', 'bin')`);
  } else {
    conditions.push(eq(emails.folder, folder));
  }

  const rows = preview_base()
    .where(and(...conditions))
    .orderBy(desc(emails.received_at))
    .all();
  logger.info("db", `list_emails: folder=${folder} count=${rows.length}`);
  return attach_thread_counts(deduplicate_drafts(rows.map(to_email_preview)));
}

export function list_threads(opts: {
  account_id: string;
  folder: string;
  cursor?: string;
  limit?: number;
}): EmailRow[] {
  const { account_id, folder, limit = 50 } = opts;
  const qb = getDb()
    .select()
    .from(emails)
    .where(and(eq(emails.account_id, account_id), eq(emails.folder, folder)))
    .orderBy(desc(emails.received_at))
    .limit(limit)
    .all();

  // Deduplicate by thread_id: keep the latest email per thread
  const seen = new Set<string | undefined>();
  return qb.filter((e) => {
    const key = e.thread_id ?? e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function update_email(
  id: string,
  data: Partial<Pick<EmailRow, "is_read" | "is_starred" | "is_flagged" | "is_phishing" | "folder" | "body_text" | "body_html" | "mail_cached_at" | "cid_refs_fetched" | "image_dimensions" | "images_measured" | "labels" | "classification_labels">>,
) {
  getDb()
    .update(emails)
    .set({ ...data, updated_at: sql`datetime('now')` })
    .where(eq(emails.id, id))
    .run();
}

export function bulk_update_email_labels(rows: { id: string; labels: string | null; classification_labels: string | null }[]): void {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  const label_cases = rows.map((r) => sql`WHEN ${emails.id} = ${r.id} THEN ${r.labels}`);
  const class_cases = rows.map((r) => sql`WHEN ${emails.id} = ${r.id} THEN ${r.classification_labels}`);
  getDb()
    .update(emails)
    .set({
      labels: sql`CASE ${sql.join(label_cases, sql` `)} ELSE ${emails.labels} END`,
      classification_labels: sql`CASE ${sql.join(class_cases, sql` `)} ELSE ${emails.classification_labels} END`,
      updated_at: sql`datetime('now')`,
    })
    .where(inArray(emails.id, ids))
    .run();
}

export function strip_label_ids_from_emails(account_id: string, removed_ids: string[]): void {
  if (removed_ids.length === 0) return;
  const remove_set = new Set(removed_ids);
  const rows = getDb()
    .select({ id: emails.id, labels: emails.labels, classification_labels: emails.classification_labels })
    .from(emails)
    .where(eq(emails.account_id, account_id))
    .all();
  const mapped = rows
    .map((r) => {
      const labels_json = filter_json_ids(r.labels, remove_set);
      const classification_json = filter_json_ids(r.classification_labels, remove_set);
      if (labels_json === r.labels && classification_json === r.classification_labels) return null;
      return { id: r.id, labels: labels_json, classification_labels: classification_json };
    })
    .filter((r): r is { id: string; labels: string | null; classification_labels: string | null } => r !== null);
  if (mapped.length > 0) bulk_update_email_labels(mapped);
}

function filter_json_ids(raw: string | null, remove_set: Set<string>): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(parsed)) return raw;
  const kept = parsed.filter((v): v is string => typeof v === "string" && !remove_set.has(v));
  const next = JSON.stringify(kept);
  return next === raw ? raw : next;
}

export function list_uncached_recent_emails(cutoff: string, account_id?: string): UncachedRecentEmail[] {
  const conditions: ReturnType<typeof sql>[] = [
    sql`${emails.mail_cached_at} IS NULL`,
    sql`${emails.received_at} >= ${cutoff}`,
  ];
  if (account_id) conditions.push(eq(emails.account_id, account_id));
  const rows = getDb()
    .select({ id: emails.id, account_id: emails.account_id })
    .from(emails)
    .where(and(...conditions))
    .all();
  return rows;
}

export function delete_email(id: string) {
  delete_email_meta_fts(id);
  delete_email_body_fts(id);
  getDb().delete(emails).where(eq(emails.id, id)).run();
}
