import { getDb } from "../../db/client";
import { emails as emailsSchema, attachments as attachmentsSchema, outbox as outboxSchema } from "../../db/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { bulk_insert_emails, update_email, delete_email, type EmailRow } from "../../db/emails";
import { merge_draft_from_gmail } from "../../db/drafts";
import { insert_outbox, delete_outbox } from "../../db/outbox";
import { get_or_create_thread, refresh_thread } from "../../db/threads";
import { sync_contacts_for_emails as sync_contacts } from "../../db/contacts";
import { get_account } from "../../db/accounts";
import { has_unknown_label_ids, sync_labels } from "../../db/labels";
import { reconcile_removed_labels } from "../../intelligence/label_reconcile";
import { rpc_send } from "../../rpc";
import { messages } from "../../../shared/rpc_messages";
import { outbox_commands } from "../../../shared/outbox_commands";
import { fetch_email_by_id, parse_message_full, resolve_inline_cids } from "./api";
import { gmail_scheduled_at_ms } from "./utils";
import { bulk_insert_attachments } from "../../db/attachments";
import { logger } from "../../utils/logger";
import type { EmailInput, EmailWithHeaders } from "../../db/emails";

type PersistDraftBatchParams = {
  access_token: string;
  account_id: string;
  drafts: EmailInput[];
  listDrafts: () => Promise<GmailDraftRef[]>;
};

type PersistDraftBatchResult = {
  updates: number;
  creates: number;
  dupesPurged: number;
  existingIds: Set<string>;
};

function try_parse_json(text: string | null): Record<string, any> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function hydrate_capture_body(access_token: string, account_id: string, email: EmailInput): Promise<EmailInput> {
  if (email.body_html || email.body_text) return email;
  try {
    const full = await fetch_email_by_id(access_token, email.id!, "full");
    const parsed = parse_message_full(full, account_id);
    return { ...email, body_html: parsed.email.body_html, body_text: parsed.email.body_text };
  } catch {
    logger.warn("store", `failed to fetch full body for scheduled send ${email.id}`);
    return email;
  }
}

async function capture_scheduled_send(params: {
  account_id: string;
  email: EmailInput;
  scheduled_at_ms: number;
  resolve_gmail_draft_id: () => Promise<string | null>;
}): Promise<void> {
  const { account_id, email, scheduled_at_ms, resolve_gmail_draft_id } = params;
  const gmail_message_id = email.id;
  if (!gmail_message_id) return;

  try { delete_email(gmail_message_id); } catch { /* email row may not exist */ }

  const to = email.to ?? "";
  const existing = getDb().select().from(outboxSchema)
    .where(eq(outboxSchema.account_id, account_id))
    .all()
    .find((r) => r.command === "send_email"
      && try_parse_json(r.extras).source === "gmail_capture"
      && try_parse_json(r.extras).gmail_message_id === gmail_message_id);

  const gmail_draft_id = existing
    ? (email.gmail_draft_id ?? try_parse_json(existing.extras).gmail_draft_id ?? await resolve_gmail_draft_id())
    : (email.gmail_draft_id ?? await resolve_gmail_draft_id());

  const payload = JSON.stringify({
    to,
    cc: email.cc ?? null,
    bcc: email.bcc ?? null,
    subject: email.subject ?? null,
    body_html: email.body_html ?? null,
    body_text: email.body_text ?? null,
    from_address: email.from_address ?? null,
    from_name: email.from_name ?? null,
    gmail_draft_id,
    gmail_message_id,
  });
  const extras = JSON.stringify({ source: "gmail_capture", gmail_message_id, gmail_draft_id });

  if (existing) {
    getDb().update(outboxSchema).set({
      payload,
      extras,
      to_addr: to || null,
      subject: email.subject ?? null,
      thread_id: email.thread_id ?? null,
      scheduled_at: scheduled_at_ms,
    }).where(eq(outboxSchema.id, existing.id)).run();
    logger.info("gmail", `updated captured scheduled send: message_id=${gmail_message_id} scheduled_at=${new Date(scheduled_at_ms).toISOString()}`);
    return;
  }

  insert_outbox({
    id: crypto.randomUUID(),
    account_id,
    command: outbox_commands.send_email,
    payload,
    extras,
    to_addr: to || null,
    subject: email.subject ?? null,
    thread_id: email.thread_id ?? null,
    status: "queued",
    created_at: Date.now(),
    scheduled_at: scheduled_at_ms,
  });
  rpc_send(messages.outbox_changed, { account_id, thread_id: email.thread_id ?? null });
  logger.info("gmail", `captured scheduled send: message_id=${gmail_message_id} scheduled_at=${new Date(scheduled_at_ms).toISOString()}`);
}

function reconcile_captured_sends(account_id: string, emails: EmailInput[]) {
  const terminal_folders = new Set(["sent", "bin", "spam"]);
  const message_ids = new Set(emails.filter((e) => e.folder && terminal_folders.has(e.folder) && e.id).map((e) => e.id!));
  if (message_ids.size === 0) return;

  const captured = getDb().select().from(outboxSchema)
    .where(sql`${outboxSchema.status} = 'queued'`)
    .all()
    .filter((r) => r.account_id === account_id && r.command === "send_email" && try_parse_json(r.extras).source === "gmail_capture");

  let changed = false;
  for (const row of captured) {
    const msg_id = try_parse_json(row.extras).gmail_message_id;
    if (msg_id && message_ids.has(msg_id)) {
      delete_outbox(row.id);
      changed = true;
      logger.info("gmail", `reconciled captured scheduled send ${row.id} (message ${msg_id} now sent)`);
    }
  }
  if (changed) rpc_send(messages.outbox_changed, { account_id, thread_id: null });
}

export async function cache_editable_mail_bodies(access_token: string, account_id: string, localId: string, gmailId: string): Promise<void> {
  try {
    const fullMsg = await fetch_email_by_id(access_token, gmailId, "full");
    const parsed = parse_message_full(fullMsg, account_id);

    const remappedAttachments = parsed.attachments.map(a => ({ ...a, email_id: localId }));
    getDb().delete(attachmentsSchema).where(eq(attachmentsSchema.email_id, localId)).run();
    if (remappedAttachments.length > 0) {
      bulk_insert_attachments(remappedAttachments);
    }

    if (parsed.email.body_html || parsed.email.body_text) {
      let body_html = parsed.email.body_html ?? null;
      if (body_html) {
        body_html = await resolve_inline_cids(access_token, gmailId, body_html, remappedAttachments);
      }
      update_email(localId, {
        body_html: body_html ?? null,
        body_text: parsed.email.body_text ?? null,
        mail_cached_at: new Date().toISOString(),
        cid_refs_fetched: 1,
      });
    }
  } catch { /* leave existing data */ }
}

export async function persist_draft_batch(params: PersistDraftBatchParams): Promise<PersistDraftBatchResult> {
  let draftMessageMap: Map<string, string> | null = null;
  let draftCreates = 0;
  let draftUpdates = 0;
  let draftDupesDeleted = 0;
  const existingDraftIds = new Set<string>();
  const draftThreadIds = new Set<string>();

  const { access_token, account_id, drafts, listDrafts } = params;

  const ensure_draft_map = async () => {
    if (!draftMessageMap) {
      draftMessageMap = new Map();
      try {
        const refs = await listDrafts();
        for (const d of refs) {
          draftMessageMap.set(d.message_id, d.id);
        }
      } catch {
        logger.warn("store", "persist_draft_batch: listDrafts failed, skipping draft map fallback");
      }
    }
  };

  for (const email of drafts) {
    const scheduled_at_ms = gmail_scheduled_at_ms((email as EmailWithHeaders).headers ?? null, email.received_at ?? null);
    if (scheduled_at_ms !== null) {
      const email_for_capture = await hydrate_capture_body(access_token, account_id, email);
      await capture_scheduled_send({
        account_id,
        email: email_for_capture,
        scheduled_at_ms,
        resolve_gmail_draft_id: async () => {
          await ensure_draft_map();
          return draftMessageMap!.get(email.id!) ?? null;
        },
      });
      continue;
    }

    let existing: EmailRow | undefined;

    if (email.local_draft_id) {
      existing = getDb().select().from(emailsSchema)
        .where(sql`local_draft_id = ${email.local_draft_id}`)
        .get() as EmailRow | undefined;
    }

    if (!existing && email.id) {
      existing = getDb().select().from(emailsSchema)
        .where(and(eq(emailsSchema.message_id, email.id), eq(emailsSchema.folder, 'drafts')))
        .get() as EmailRow | undefined;
    }

    if (!existing && email.id) {
      await ensure_draft_map();
      const gmail_draft_id = draftMessageMap!.get(email.id);
      if (gmail_draft_id) {
        existing = getDb().select().from(emailsSchema)
          .where(eq(emailsSchema.gmail_draft_id, gmail_draft_id))
          .get() as EmailRow | undefined;
        if (existing) {
          getDb().update(emailsSchema)
            .set({ message_id: email.id })
            .where(eq(emailsSchema.id, existing.id))
            .run();
        }
      }
    }

    if (existing) {
      draftUpdates++;
      const gmailId = email.id;
      email.id = existing.id;
      if (existing.gmail_draft_id && !email.gmail_draft_id) {
        email.gmail_draft_id = existing.gmail_draft_id;
      }

      if (email.message_id || existing.gmail_draft_id) {
        const dupes = getDb().select({ id: emailsSchema.id }).from(emailsSchema).where(
          and(
            eq(emailsSchema.folder, 'drafts'),
            ne(emailsSchema.id, existing.id),
            or(
              ...(email.message_id ? [eq(emailsSchema.message_id, email.message_id)] : []),
              ...(existing.gmail_draft_id ? [eq(emailsSchema.gmail_draft_id, existing.gmail_draft_id)] : []),
            )
          )
        ).all() as { id: string }[];
        draftDupesDeleted += dupes.length;
        if (dupes.length > 0) {
          getDb().delete(emailsSchema).where(
            and(
              eq(emailsSchema.folder, 'drafts'),
              ne(emailsSchema.id, existing.id),
              or(
                ...(email.message_id ? [eq(emailsSchema.message_id, email.message_id)] : []),
                ...(existing.gmail_draft_id ? [eq(emailsSchema.gmail_draft_id, existing.gmail_draft_id)] : []),
              )
            )
          ).run();
        }
      }

      if (email.thread_id) {
        get_or_create_thread(email.thread_id, account_id, email.subject);
        draftThreadIds.add(email.thread_id);
      }
      existingDraftIds.add(existing.id);
      if (email.local_draft_id && existing.local_draft_id === email.local_draft_id) {
        getDb().update(emailsSchema).set({
          message_id: email.message_id ?? existing.message_id,
          gmail_draft_id: email.gmail_draft_id ?? existing.gmail_draft_id,
          thread_id: email.thread_id ?? existing.thread_id,
          history_id: email.history_id ?? existing.history_id,
          synced_at: email.synced_at ?? existing.synced_at,
        }).where(eq(emailsSchema.id, existing.id)).run();
      } else {
        merge_draft_from_gmail(existing, email);
        await cache_editable_mail_bodies(access_token, account_id, existing.id, gmailId!);
        rpc_send(messages.draft_externally_modified, { id: existing.id });
      }
    } else {
      draftCreates++;
    }
  }

  for (const tid of draftThreadIds) {
    refresh_thread(tid);
  }

  return { updates: draftUpdates, creates: draftCreates, dupesPurged: draftDupesDeleted, existingIds: existingDraftIds };
}

export async function persist_viewable_batch(access_token: string, account_id: string, emails: EmailInput[]): Promise<void> {
  const thread_ids = new Set<string>();
  for (const email of emails) {
    if (email.thread_id) {
      get_or_create_thread(email.thread_id, account_id, email.subject);
      thread_ids.add(email.thread_id);
    }
  }

  const normal: EmailInput[] = [];
  for (const email of emails) {
    const scheduled_at_ms = gmail_scheduled_at_ms((email as EmailWithHeaders).headers ?? null, email.received_at ?? null);
    if (scheduled_at_ms !== null && (email.folder === "inbox" || email.folder === "sent")) {
      const hydrated = await hydrate_capture_body(access_token, account_id, email);
      await capture_scheduled_send({
        account_id,
        email: hydrated,
        scheduled_at_ms,
        resolve_gmail_draft_id: async () => null,
      });
      continue;
    }
    normal.push(email);
  }

  reconcile_captured_sends(account_id, normal);
  bulk_insert_emails(normal);
  for (const tid of thread_ids) {
    refresh_thread(tid);
  }
}

export async function sync_labels_for_emails(account_id: string, access_token: string, emails: EmailInput[]): Promise<void> {
  const label_ids: string[] = [];
  for (const email of emails) {
    if (email.labels) {
      try {
        const parsed = JSON.parse(email.labels);
        if (Array.isArray(parsed)) label_ids.push(...parsed);
      } catch { /* skip unparseable labels */ }
    }
  }
  if (label_ids.length > 0 && has_unknown_label_ids(account_id, label_ids)) {
    const { removed, changed } = await sync_labels(account_id, access_token);
    reconcile_removed_labels(account_id, removed);
    if (changed) rpc_send(messages.labels_changed, { account_id });
  }
}

export async function sync_contacts_for_emails(account_id: string, emails: EmailInput[]): Promise<number> {
  const account = get_account(account_id);
  if (!account) return 0;

  const created = sync_contacts(account_id, account.email, emails);
  if (created > 0) rpc_send(messages.contacts_changed, { account_id });

  return created;
}
