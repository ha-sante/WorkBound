import { get_account } from "../db/accounts";
import { get_adapter } from "../providers/index";
import { get_draft, update_draft_gmail_id } from "../db/drafts";
import { get_email } from "../db/emails";
import { logger } from "../utils/logger";
import { messages } from "../../shared/rpc_messages";
import { get_rpc } from "./rpc_ref";
import type { OutgoingMessage } from "../providers/types";

export type DraftSavePayload = {
  draft_id: string;
  mode?: DraftMode;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  from_address: string | null;
  from_name: string | null;
  original_email_id: string | null;
  attachments: AttachmentPayload[] | null;
};

export async function handle_draft_save(item: OutboxItemRow): Promise<void> {
  const p = JSON.parse(item.payload || "{}") as DraftSavePayload;
  if (!p.to?.trim()) {
    logger.info("outbox", `draft_save skipped (no recipient) id=${p.draft_id}`);
    return;
  }

  const account = get_account(item.account_id);
  if (!account) throw new Error("Account not found");

  const adapter = get_adapter(account.provider);
  await adapter.connect(account);

  const existing = get_draft(p.draft_id);
  let gmail_draft_id = existing?.gmail_draft_id ?? null;

  const threading: Pick<OutgoingMessage, "in_reply_to" | "references" | "thread_id"> = {};
  if (p.mode === "reply" && p.original_email_id) {
    const original = get_email(p.original_email_id);
    if (original) {
      if (original.thread_id) threading.thread_id = original.thread_id;
      if (original.message_id) {
        threading.in_reply_to = original.message_id;
        threading.references = [original.reply_to, original.message_id].filter(Boolean).join(" ");
      }
    }
  }

  const msg: OutgoingMessage = {
    to: p.to ? p.to.split(",").map((s) => s.trim()).filter(Boolean) : [],
    cc: p.cc ? p.cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    bcc: p.bcc ? p.bcc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    subject: p.subject || "",
    body_text: p.body_text || undefined,
    body_html: p.body_html || undefined,
    from: p.from_address || undefined,
    from_name: p.from_name || undefined,
    local_draft_id: p.draft_id,
    ...threading,
    attachments: p.attachments && p.attachments.length > 0
      ? p.attachments.map((a) => ({
          filename: a.name,
          mime_type: a.mime_type,
          data: Buffer.from(a.data, "base64"),
        }))
      : undefined,
  };

  let gmail_message_id = "";
  if (gmail_draft_id) {
    const result = await adapter.updateDraft!(gmail_draft_id, msg);
    gmail_message_id = result.message_id || gmail_message_id;
    update_draft_gmail_id(p.draft_id, gmail_draft_id, gmail_message_id);
    logger.info("outbox", `draft_save updated Gmail draft id=${p.draft_id} gmail_draft_id=${gmail_draft_id} message_id=${gmail_message_id}`);
  } else {
    const result = await adapter.createDraft!(msg);
    gmail_draft_id = result.id;
    gmail_message_id = result.message_id || "";
    update_draft_gmail_id(p.draft_id, gmail_draft_id, gmail_message_id);
    logger.info("outbox", `draft_save created Gmail draft id=${p.draft_id} gmail_draft_id=${gmail_draft_id} message_id=${gmail_message_id}`);
  }

  const rpc = get_rpc();
  rpc?.send(messages.draft_email_saved, {
    draft_id: p.draft_id,
    gmail_draft_id,
    gmail_message_id,
    original_email_id: p.original_email_id ?? undefined,
  });
}

export async function handle_draft_delete(item: OutboxItemRow): Promise<void> {
  const p = JSON.parse(item.payload || "{}") as { gmail_draft_id: string | null };
  if (p.gmail_draft_id) {
    const account = get_account(item.account_id);
    if (!account) throw new Error("Account not found");
    const adapter = get_adapter(account.provider);
    await adapter.connect(account);
    try {
      await adapter.deleteDraft!(p.gmail_draft_id);
    } catch (err) {
      logger.warn("outbox", `draft_delete gmail_draft_id=${p.gmail_draft_id} failed (ignored): ${err}`);
    }
    logger.info("outbox", `draft_delete gmail_draft_id=${p.gmail_draft_id}`);
  } else {
    logger.info("outbox", `draft_delete skipped (no gmail_draft_id)`);
  }
}


