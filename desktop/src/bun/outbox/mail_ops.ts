import { insert_email, update_email, get_email, bulk_update_email_labels } from "../db/emails";
import { bulk_insert_assignments } from "../db/auto_label_assignments";
import { getDb } from "../db/client";
import { emails } from "../db/schema/emails";
import { inArray } from "drizzle-orm";
import { get_or_create_thread, refresh_thread } from "../db/threads";
import { get_account } from "../db/accounts";
import { get_adapter } from "../providers/index";

import { get_draft, delete_draft, update_draft_gmail_id } from "../db/drafts";
import { logger } from "../utils/logger";
import { messages } from "../../shared/rpc_messages";
import { get_rpc } from "./rpc_ref";
import type { OutgoingMessage } from "../providers/types";

export type SendEmailPayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  quote_text?: string;
  attachments?: AttachmentPayload[];
  from_address?: string;
  from_name?: string;
  draft_id?: string;
  gmail_draft_id?: string;
  original_email_id?: string;
};

function resolve_threading(original_email_id?: string): Pick<OutgoingMessage, "in_reply_to" | "references" | "thread_id"> {
  if (!original_email_id) return {};
  const original = get_email(original_email_id);
  if (!original) return {};
  const threading: Pick<OutgoingMessage, "in_reply_to" | "references" | "thread_id"> = {};
  if (original.thread_id) threading.thread_id = original.thread_id;
  if (original.message_id) {
    threading.in_reply_to = original.message_id;
    threading.references = [original.reply_to, original.message_id].filter(Boolean).join(" ");
  }
  return threading;
}

async function insert_sent_email(result: { id: string; thread_id: string }, p: SendEmailPayload, account_id: string, from_address: string, from_name: string): Promise<void> {
  get_or_create_thread(result.thread_id, account_id, p.subject);
  insert_email({
    id: result.id,
    provider: "gmail",
    account_id,
    thread_id: result.thread_id,
    message_id: result.id,
    subject: p.subject,
    from_name,
    from_address,
    to: p.to,
    cc: p.cc,
    bcc: p.bcc,
    body_text: p.body_text,
    body_html: p.body_html,
    snippet: null,
    folder: "sent",
    is_read: 1,
    is_starred: 0,
    is_flagged: 0,
    received_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    mail_cached_at: null,
    synced_at: null,
  });

  if (p.draft_id) delete_draft(p.draft_id);
  refresh_thread(result.thread_id);
}

export async function handle_draft_send(item: OutboxItemRow): Promise<void> {
  const p = JSON.parse(item.payload || "{}") as SendEmailPayload;
  if (!p.to?.trim()) throw new Error("No recipient");
  if (!p.draft_id) throw new Error("Missing draft_id");

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  const draftRow = p.draft_id ? get_draft(p.draft_id) : null;
  let gmail_draft_id = draftRow?.gmail_draft_id ?? p.gmail_draft_id ?? null;

  if (!gmail_draft_id) {
    const msg: OutgoingMessage = {
      to: [p.to],
      cc: p.cc ? [p.cc] : undefined,
      bcc: p.bcc ? [p.bcc] : undefined,
      subject: p.subject || "",
      body_text: p.body_text || undefined,
      body_html: p.body_html || undefined,
      from: p.from_address || account.email,
      from_name: p.from_name || account.name || undefined,
      local_draft_id: p.draft_id,
      ...resolve_threading(p.original_email_id),
      attachments: p.attachments?.map((a) => ({
        filename: a.name,
        mime_type: a.mime_type,
        data: Buffer.from(a.data, "base64"),
      })),
    };
    const result = await adapter.createDraft!(msg);
    gmail_draft_id = result.id;
    update_draft_gmail_id(p.draft_id, gmail_draft_id, result.message_id);
  }

  const result = await adapter.sendDraft!(gmail_draft_id);
  await insert_sent_email(result, p, item.account_id, p.from_address || account.email, p.from_name || account.name || "");

  const rpc = get_rpc();
  rpc?.send(messages.sync_newfill_progress, {
    account_id: item.account_id,
    email: account.email,
    state: "done",
    hasChanges: true,
  });
  rpc?.send(messages.draft_email_sent, {
    draft_id: p.draft_id,
    sent_message_id: result.id,
    thread_id: result.thread_id,
  });

  logger.info("outbox", `sent ${item.id} via sendDraft -> gmail msgId=${result.id} thread_id=${result.thread_id}`);
}

export async function handle_send_email(item: OutboxItemRow): Promise<void> {
  const p = JSON.parse(item.payload || "{}") as SendEmailPayload;
  if (!p.to?.trim()) throw new Error("No recipient");

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  const msg: OutgoingMessage = {
    to: p.to.split(",").map((s) => s.trim()).filter(Boolean),
    cc: p.cc ? p.cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    bcc: p.bcc ? p.bcc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    subject: p.subject || "",
    body_text: p.body_text || undefined,
    body_html: p.body_html || undefined,
    from: p.from_address || account.email,
    from_name: p.from_name || account.name || undefined,
    ...resolve_threading(p.original_email_id),
    attachments: p.attachments?.map((a) => ({
      filename: a.name,
      mime_type: a.mime_type,
      data: Buffer.from(a.data, "base64"),
    })),
  };

  const result = await adapter.sendEmail(msg);
  await insert_sent_email(result, p, item.account_id, p.from_address || account.email, p.from_name || account.name || "");

  const rpc = get_rpc();
  rpc?.send(messages.sync_newfill_progress, {
    account_id: item.account_id,
    email: account.email,
    state: "done",
    hasChanges: true,
  });
  if (p.draft_id) {
    rpc?.send(messages.draft_email_sent, {
      draft_id: p.draft_id,
      sent_message_id: result.id,
      thread_id: result.thread_id,
    });
  }

  logger.info("outbox", `sent ${item.id} via sendEmail -> gmail msgId=${result.id} thread_id=${result.thread_id}`);
}

export async function handle_email_delete(item: OutboxItemRow): Promise<void> {
  const extras = JSON.parse(item.extras || "{}") as { providerMessageId?: string };
  if (!extras.providerMessageId) throw new Error("Missing providerMessageId");

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  await adapter.delete_email(extras.providerMessageId);
  logger.info("outbox", `delete ${item.id} -> gmail msgId=${extras.providerMessageId}`);
}

export async function handle_label_update(item: OutboxItemRow): Promise<void> {
  const extras = JSON.parse(item.extras || "{}") as { providerMessageId?: string; email_id?: string };
  if (!extras.providerMessageId) throw new Error("Missing providerMessageId");

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  const payload = JSON.parse(item.payload || "{}") as Record<string, unknown>;
  await adapter.modifyMessage(extras.providerMessageId, payload);

  // Re-apply local DB update after API succeeds to defend against sync race
  if (extras.email_id && item.payload) {
    const p = JSON.parse(item.payload) as { add_label_ids?: string[]; remove_label_ids?: string[] };
    const data: Record<string, unknown> = {};
    if (p.remove_label_ids?.includes("UNREAD")) data.is_read = 1;
    if (p.add_label_ids?.includes("UNREAD")) data.is_read = 0;
    if (p.remove_label_ids?.includes("STARRED")) data.is_starred = 0;
    if (p.add_label_ids?.includes("STARRED")) data.is_starred = 1;
    if (p.remove_label_ids?.includes("IMPORTANT")) data.is_flagged = 0;
    if (p.add_label_ids?.includes("IMPORTANT")) data.is_flagged = 1;
    if (p.add_label_ids?.includes("SPAM")) data.folder = "spam";
    if (p.remove_label_ids?.includes("INBOX") && !p.add_label_ids?.includes("SPAM") && !p.add_label_ids?.includes("TRASH")) data.folder = "all";
    if (Object.keys(data).length > 0) {
      update_email(extras.email_id, data);
      logger.file("outbox").info(`re-applied local update for ${extras.email_id}`);
    }
  }

  logger.info("outbox", `modify ${item.id} -> gmail msgId=${extras.providerMessageId}`);
}

export async function handle_label_batch(item: OutboxItemRow): Promise<void> {
  const extras = JSON.parse(item.extras || "{}") as { email_ids?: string[]; rule_id?: string; rule_version?: number };
  const email_ids = extras.email_ids ?? [];
  if (email_ids.length === 0) throw new Error("Missing email_ids");

  const payload = JSON.parse(item.payload || "{}") as { add_label_ids?: string[]; remove_label_ids?: string[] };
  const add_label_ids = payload.add_label_ids ?? [];
  const remove_label_ids = payload.remove_label_ids ?? [];

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  await adapter.batch_modify(email_ids, { add_label_ids, remove_label_ids });

  const rows = getDb()
    .select({ id: emails.id, labels: emails.labels })
    .from(emails)
    .where(inArray(emails.id, email_ids))
    .all();

  const remove_set = new Set(remove_label_ids);
  const local_rows = rows.map((r) => {
    let current: string[] = [];
    try {
      current = JSON.parse(r.labels ?? "[]");
    } catch { /* unparseable labels treated as empty */ }
    const filtered = current.filter((l) => !remove_set.has(l));
    const merged = [...new Set([...filtered, ...add_label_ids])];
    return {
      id: r.id,
      labels: JSON.stringify(merged),
      classification_labels: JSON.stringify(add_label_ids),
    };
  });
  bulk_update_email_labels(local_rows);

  if (extras.rule_id && extras.rule_version !== undefined) {
    bulk_insert_assignments(email_ids.map((email_id) => ({
      id: `ala_${email_id}_${extras.rule_id}_${extras.rule_version}`,
      account_id: item.account_id,
      email_id,
      rule_id: extras.rule_id!,
      rule_version: extras.rule_version!,
      label_ids: JSON.stringify(add_label_ids),
      created_at: Date.now(),
    })));
  }

  logger.info("outbox", `label_batch ${item.id} -> gmail ${email_ids.length} messages labels=${JSON.stringify(add_label_ids)}`);
}
