import { getDb } from "./client";
import { emails, attachments } from "./schema";
import { eq, sql } from "drizzle-orm";
import { upsert_email_headers, get_email_headers, type EmailRow, type EmailInput } from "./emails";
import { logger } from "../utils/logger";

export function save_draft(data: {
  id: string;
  account_id: string;
  mode: DraftMode;
  to: string;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  snippet: string | null;
  from_address: string | null;
  from_name: string | null;
  original_email_id: string | null;
  quote_text: string | null;
  gmail_draft_id?: string | null;
  local_draft_id?: string | null;
  lastGmailMessageId?: string | null;
  force?: boolean;
}): { id: string; conflict?: boolean } {
  const headers = JSON.stringify({
    draft_mode: data.mode,
    original_email_id: data.original_email_id,
  });
  const now = new Date().toISOString();

  let draft_id = data.id;

  if (data.original_email_id) {
    const existing = find_draft_by_original_email_id(data.account_id, data.original_email_id);
    if (existing && existing.id !== data.id) {
      logger.info("db", `save_draft: redirecting from id=${data.id} to existing draft id=${existing.id} for original_email_id=${data.original_email_id}`);
      draft_id = existing.id;
    }

    getDb().run(sql`
      DELETE FROM emails
      WHERE folder = 'drafts'
        AND account_id = ${data.account_id}
        AND original_email_id = ${data.original_email_id}
        AND id != ${draft_id}
    `);
  }

  // Conflict check: if the Gmail message_id changed since the client loaded it,
  // Gmail edited the draft externally — reject the save.
  if (!data.force && data.lastGmailMessageId) {
    const current = getDb().select({ message_id: emails.message_id }).from(emails).where(eq(emails.id, draft_id)).get() as { message_id: string | null } | undefined;
    if (current?.message_id && current.message_id !== data.lastGmailMessageId) {
      logger.info("db", `save_draft: conflict id=${draft_id} rowMessageId=${current.message_id} clientMessageId=${data.lastGmailMessageId}`);
      return { id: draft_id, conflict: true };
    }
  }

  try {
    getDb().run(sql`
      INSERT INTO emails (id, provider, account_id, subject, from_name, from_address, "to", cc, bcc, body_html, body_text, snippet, folder, is_read, received_at, synced_at, original_email_id, draft_mode, gmail_draft_id, local_draft_id, quote_text)
      VALUES (${draft_id}, ${"local"}, ${data.account_id}, ${data.subject}, ${data.from_name}, ${data.from_address}, ${data.to}, ${data.cc}, ${data.bcc}, ${data.body_html}, ${data.body_text}, ${data.snippet}, ${"drafts"}, ${1}, ${now}, ${now}, ${data.original_email_id}, ${data.mode}, ${data.gmail_draft_id ?? null}, ${data.local_draft_id ?? null}, ${data.quote_text})
      ON CONFLICT (id) DO UPDATE SET
        subject = excluded.subject,
        from_name = excluded.from_name,
        from_address = excluded.from_address,
        "to" = excluded."to",
        cc = excluded.cc,
        bcc = excluded.bcc,
        body_html = excluded.body_html,
        body_text = excluded.body_text,
        snippet = excluded.snippet,
        received_at = excluded.received_at,
        updated_at = datetime('now'),
        synced_at = excluded.synced_at,
        original_email_id = excluded.original_email_id,
        draft_mode = excluded.draft_mode,
        gmail_draft_id = COALESCE(excluded.gmail_draft_id, emails.gmail_draft_id),
        local_draft_id = COALESCE(excluded.local_draft_id, emails.local_draft_id),
        quote_text = excluded.quote_text
    `);
    upsert_email_headers(draft_id, headers);
    logger.info("db", `save_draft: id=${draft_id} mode=${data.mode}`);
  } catch (e: any) {
    logger.error("db", `save_draft failed for id=${draft_id}: ${e.message}`);
    throw e;
  }

  return { id: draft_id };
}

export function update_draft_gmail_id(id: string, gmail_draft_id: string, message_id?: string): void {
  getDb().run(sql`
    UPDATE emails SET gmail_draft_id = ${gmail_draft_id}, message_id = ${message_id ?? null} WHERE id = ${id}
  `);
  logger.info("db", `update_draft_gmail_id: id=${id} gmail_draft_id=${gmail_draft_id} message_id=${message_id ?? "null"}`);
}

export function get_draft(id: string) {
  const row = getDb().select().from(emails).where(eq(emails.id, id)).get();
  if (!row || row.folder !== "drafts") return null;
  return { ...row, headers: get_email_headers(row.id) };
}

export function find_draft_by_original_email_id(account_id: string, original_email_id: string) {
  const row = getDb().select().from(emails)
    .where(sql`folder = 'drafts' AND account_id = ${account_id} AND original_email_id = ${original_email_id}`)
    .orderBy(sql`updated_at DESC`)
    .get();
  return row ? { ...row, headers: get_email_headers(row.id) } : null;
}

const BUCKET_II_FIELDS = ['subject', 'to', 'cc', 'bcc', 'body_text', 'body_html', 'from_name', 'from_address', 'snippet'] as const;

export function merge_draft_from_gmail(existing: EmailRow, incoming: EmailInput): boolean {
  const setFields: Record<string, unknown> = {
    folder: incoming.folder,
    labels: incoming.labels,
    classification_labels: incoming.classification_labels,
    history_id: incoming.history_id,
    thread_id: incoming.thread_id,
    message_id: incoming.message_id,
    gmail_draft_id: incoming.gmail_draft_id,
    is_read: incoming.is_read,
    is_starred: incoming.is_starred,
    is_flagged: incoming.is_flagged,
    is_phishing: incoming.is_phishing,
    received_at: incoming.received_at,
    sent_at: incoming.sent_at,
    synced_at: incoming.synced_at,
    size_estimate: incoming.size_estimate,
    internal_date: incoming.internal_date,
    reply_to_address: incoming.reply_to_address,
    cid_refs_fetched: incoming.cid_refs_fetched,
    provider: incoming.provider,
  };

  for (const key of BUCKET_II_FIELDS) {
    if (incoming[key] == null) {
      setFields[key] = existing[key];
    } else {
      setFields[key] = incoming[key];
    }
  }

  let contentChanged = false;
  for (const key of BUCKET_II_FIELDS) {
    if (setFields[key] !== existing[key]) {
      contentChanged = true;
      break;
    }
  }

  getDb().update(emails).set(setFields).where(eq(emails.id, existing.id)).run();
  return contentChanged;
}

export function delete_draft(id: string) {
  getDb().delete(attachments).where(eq(attachments.email_id, id)).run();
  getDb().delete(emails).where(eq(emails.id, id)).run();
  logger.info("db", `delete_draft: id=${id}`);
}
