import { getDb } from "./client";
import { emails } from "./schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { parse_query, build_fts_query, matched_fields_from_parsed, resolve_date_value } from "./sparser";
import { resolve_label_id } from "./labels";

const email_preview_cols = sql`
  e.id as "id", e.account_id as "account_id", e.thread_id as "thread_id", e.subject as "subject",
  e.from_name as "from_name", e.from_address as "from_address",
  e."to" as "toAddr", e.cc as "cc", e.bcc as "bcc",
  e.snippet as "snippet", e.folder as "folder", e.is_read as "is_read",
  e.is_starred as "is_starred", e.is_flagged as "is_flagged",
  e.sent_at as "sent_at", e.received_at as "received_at",
  e.mail_cached_at as "mail_cached_at"
`;

const body_snippet_col = sql`snippet(email_body_fts, 1, '', '', '...', 40) as "snippet_hl"`;

function build_extra_conditions(parsed: ReturnType<typeof parse_query>, account_id?: string): SQL[] {
  const conditions: SQL[] = [];

  if (parsed.hasFilters.includes("attachments") || parsed.hasFilters.includes("attachment")) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM email_has_attachments m WHERE m.email_id = e.id)`,
    );
  }
  if (parsed.hasFilters.includes("star") || parsed.hasFilters.includes("starred")) {
    conditions.push(sql`e.is_starred = 1`);
  }
  if (parsed.hasFilters.includes("flag") || parsed.hasFilters.includes("flagged")) {
    conditions.push(sql`e.is_flagged = 1`);
  }

  if (parsed.beforeDate) {
    const r = resolve_date_value(parsed.beforeDate, "before");
    if (r) {
      conditions.push(r.op === "<"
        ? sql`e.received_at < ${r.sql}`
        : sql`e.received_at >= ${r.sql}`);
    } else {
      conditions.push(sql`e.received_at < ${parsed.beforeDate}`);
    }
  }

  if (parsed.afterDate) {
    const r = resolve_date_value(parsed.afterDate, "after");
    if (r) {
      conditions.push(r.op === "<"
        ? sql`e.received_at < ${r.sql}`
        : sql`e.received_at >= ${r.sql}`);
    } else {
      conditions.push(sql`e.received_at > ${parsed.afterDate}`);
    }
  }

  if (parsed.label) {
    const label_id = resolve_label_id(parsed.label.toLowerCase(), account_id);
    if (label_id) {
      conditions.push(sql`e.labels LIKE ${'%"' + label_id + '"%'}`);
    } else {
      conditions.push(sql`1=0`);
    }
  }

  return conditions;
}

function build_drizzle_conditions(parsed: ReturnType<typeof parse_query>, account_id?: string): SQL[] {
  const conditions: SQL[] = [];

  if (parsed.hasFilters.includes("attachments") || parsed.hasFilters.includes("attachment")) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM email_has_attachments m WHERE m.email_id = ${emails.id})`,
    );
  }
  if (parsed.hasFilters.includes("star") || parsed.hasFilters.includes("starred")) {
    conditions.push(eq(emails.is_starred, 1));
  }
  if (parsed.hasFilters.includes("flag") || parsed.hasFilters.includes("flagged")) {
    conditions.push(eq(emails.is_flagged, 1));
  }

  if (parsed.beforeDate) {
    const r = resolve_date_value(parsed.beforeDate, "before");
    if (r) {
      conditions.push(r.op === "<"
        ? sql`${emails.received_at} < ${r.sql}`
        : sql`${emails.received_at} >= ${r.sql}`);
    } else {
      conditions.push(sql`${emails.received_at} < ${parsed.beforeDate}`);
    }
  }

  if (parsed.afterDate) {
    const r = resolve_date_value(parsed.afterDate, "after");
    if (r) {
      conditions.push(r.op === "<"
        ? sql`${emails.received_at} < ${r.sql}`
        : sql`${emails.received_at} >= ${r.sql}`);
    } else {
      conditions.push(sql`${emails.received_at} > ${parsed.afterDate}`);
    }
  }

  if (parsed.label) {
    const label_id = resolve_label_id(parsed.label.toLowerCase(), account_id);
    if (label_id) {
      conditions.push(sql`${emails.labels} LIKE ${'%"' + label_id + '"%'}`);
    } else {
      conditions.push(sql`1=0`);
    }
  }

  return conditions;
}

function build_folder_condition(folder?: string): SQL[] {
  if (!folder) return [];
  if (folder === "__all__") {
    return [sql`e.folder NOT IN ('spam', 'bin')`];
  }
  return [sql`e.folder = ${folder}`];
}

function build_folder_condition_drizzle(folder?: string): SQL[] {
  if (!folder) return [];
  if (folder === "__all__") {
    return [sql`${emails.folder} NOT IN ('spam', 'bin')`];
  }
  return [eq(emails.folder, folder)];
}

export function search_emails_meta(query: string, limit = 50, account_id?: string, folder?: string): EmailPreviewWire[] {
  const parsed = parse_query(query);
  const ftsQuery = build_fts_query(parsed);
  const extraConditions = build_extra_conditions(parsed, account_id);
  const folderCondition = build_folder_condition(folder);

  if (!ftsQuery && extraConditions.length === 0 && folderCondition.length === 0) return [];

  let rows: EmailPreviewWire[];

  if (!ftsQuery) {
    const drizzleConditions = build_drizzle_conditions(parsed, account_id);
    drizzleConditions.push(...build_folder_condition_drizzle(folder));
    rows = getDb().select({
      id: emails.id,
      account_id: emails.account_id,
      thread_id: emails.thread_id,
      subject: emails.subject,
      from_name: emails.from_name,
      from_address: emails.from_address,
      toAddr: emails.to,
      cc: emails.cc,
      bcc: emails.bcc,
      snippet: emails.snippet,
      folder: emails.folder,
      is_read: emails.is_read,
      is_starred: emails.is_starred,
      is_flagged: emails.is_flagged,
      sent_at: emails.sent_at,
      received_at: emails.received_at,
      mail_cached_at: emails.mail_cached_at,
    }).from(emails).where(and(...drizzleConditions)).orderBy(desc(emails.received_at)).limit(limit).all() as unknown as EmailPreviewWire[];
  } else {
    rows = getDb().all(sql`
      SELECT ${email_preview_cols}
      FROM emails e
      JOIN email_meta_fts f ON e.id = f.email_id
      WHERE email_meta_fts MATCH ${ftsQuery}
        ${folderCondition.length > 0 ? sql` AND ${and(...folderCondition)}` : sql``}
        ${extraConditions.length > 0 ? sql` AND ${and(...extraConditions)}` : sql``}
      ORDER BY rank
      LIMIT ${limit}
    `) as EmailPreviewWire[];
  }

  return rows.map((row) => ({
    ...row,
    matchedFields: matched_fields_from_parsed(parsed),
  }));
}

export function search_emails_body(query: string, limit = 50, account_id?: string, folder?: string): EmailPreviewWire[] {
  const parsed = parse_query(query);
  const ftsQuery = build_fts_query(parsed);
  const extraConditions = build_extra_conditions(parsed, account_id);
  const folderCondition = build_folder_condition(folder);

  if (!ftsQuery && extraConditions.length === 0 && folderCondition.length === 0) return [];

  let rows: Record<string, unknown>[];

  if (!ftsQuery) {
    const drizzleConditions = build_drizzle_conditions(parsed, account_id);
    drizzleConditions.push(...build_folder_condition_drizzle(folder));
    rows = getDb().select({
      id: emails.id,
      account_id: emails.account_id,
      thread_id: emails.thread_id,
      subject: emails.subject,
      from_name: emails.from_name,
      from_address: emails.from_address,
      toAddr: emails.to,
      cc: emails.cc,
      bcc: emails.bcc,
      snippet: emails.snippet,
      folder: emails.folder,
      is_read: emails.is_read,
      is_starred: emails.is_starred,
      is_flagged: emails.is_flagged,
      sent_at: emails.sent_at,
      received_at: emails.received_at,
      mail_cached_at: emails.mail_cached_at,
    }).from(emails).where(and(...drizzleConditions)).orderBy(desc(emails.received_at)).limit(limit).all() as unknown as Record<string, unknown>[];
  } else {
    rows = getDb().all(sql`
      SELECT ${email_preview_cols}, ${body_snippet_col}
      FROM emails e
      JOIN email_body_fts f ON e.id = f.email_id
      WHERE email_body_fts MATCH ${ftsQuery}
        ${folderCondition.length > 0 ? sql` AND ${and(...folderCondition)}` : sql``}
        ${extraConditions.length > 0 ? sql` AND ${and(...extraConditions)}` : sql``}
      ORDER BY rank
      LIMIT ${limit}
    `) as Record<string, unknown>[];
  }

  return rows.map((row) => {
    const fields = new Set<string>(parsed.fieldOps.map((o) => o.field));
    fields.add("body");
    const snippet_hl = row.snippet_hl as string | null;
    delete row.snippet_hl;
    return { ...row, matchedFields: Array.from(fields), snippet_hl } as EmailPreviewWire;
  });
}

export function search_emails_local(query: string, limit = 50, account_id?: string, folder?: string): EmailPreviewWire[] {
  const metaResults = search_emails_meta(query, limit, account_id, folder);
  if (metaResults.length >= limit) return metaResults.slice(0, limit);

  const bodyLimit = limit - metaResults.length;
  const bodyResults = search_emails_body(query, bodyLimit, account_id, folder);

  const seen = new Set<string>(metaResults.map((e) => e.id));
  const merged = [...metaResults];
  for (const r of bodyResults) {
    if (!seen.has(r.id)) {
      merged.push(r);
      seen.add(r.id);
    }
  }
  return merged;
}
