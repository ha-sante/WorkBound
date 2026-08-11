import { list_accounts } from "../db/accounts";
import { get_adapter } from "../providers/index";
import { getDb } from "../db/client";
import { emails, attachments } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { insert_email, delete_email, get_email, type EmailRow } from "../db/emails";
import { bulk_insert_attachments, get_attachments_by_email } from "../db/attachments";
import { fetch_email_by_id, parse_message_full } from "../providers/gmail/api";
import { withGmailAuth } from "../providers/gmail/auth";
import type { OutgoingMessage } from "../providers/types";
import { logger } from "../utils/logger";
import { error_message } from "../../shared/errors";

export async function sync_account_drafts(account_id: string): Promise<void> {
  const account = list_accounts().find((a) => a.id === account_id);
  if (!account || account.provider !== "gmail") return;

  const adapter = get_adapter("gmail");
  await adapter.connect(account);

  let gmailDrafts: GmailDraftRef[];
  try {
    gmailDrafts = await adapter.listDrafts!();
  } catch (e) {
    logger.warn("draft_sync", `listDrafts failed for account ${account_id}, skipping sync: ${e}`);
    return;
  }

  const gmailByMessageId = new Map(gmailDrafts.map((d) => [d.message_id, d]));
  const gmailByDraftId = new Map(gmailDrafts.map((d) => [d.id, d]));

  const localGmailDrafts = getDb().select().from(emails)
    .where(sql`provider = 'gmail' AND folder = 'drafts' AND account_id = ${account_id}`)
    .all() as EmailRow[];

  let synced = 0;
  let removed = 0;

  // Only prune local drafts when Gmail returned a healthy response
  if (gmailDrafts.length > 0) {
    for (const local of localGmailDrafts) {
      const inGmail = local.message_id
        ? gmailByMessageId.has(local.message_id)
        : (local.gmail_draft_id && gmailByDraftId.has(local.gmail_draft_id));
      if (!inGmail) {
        delete_email(local.id);
        removed++;
      }
    }
  }

  // Re-query after pruning so the existing check below uses fresh data
  const remainingLocal = getDb().select().from(emails)
    .where(sql`provider = 'gmail' AND folder = 'drafts' AND account_id = ${account_id}`)
    .all() as EmailRow[];

  // Gmail → local: pull drafts from server
  for (const gd of gmailDrafts) {
    const existing = remainingLocal.find((l) =>
      l.message_id === gd.message_id || (l.gmail_draft_id && l.gmail_draft_id === gd.id)
    );

    if (existing && existing.gmail_draft_id === gd.id && existing.message_id === gd.message_id) {
      continue;
    }

    try {
      const raw = await withGmailAuth(account_id, (token) => fetch_email_by_id(token, gd.message_id, "full"));
      const parsed = parse_message_full(raw, account_id);

      const email_id = existing ? existing.id : gd.message_id;
      const emailData = {
        ...parsed.email,
        id: email_id,
        provider: "gmail" as const,
        folder: "drafts",
        gmail_draft_id: gd.id,
        thread_id: gd.thread_id,
      };
      insert_email(emailData);

      getDb().delete(attachments).where(eq(attachments.email_id, email_id)).run();
      if (parsed.attachments.length > 0) {
        const remapped = parsed.attachments.map(a => ({ ...a, email_id }));
        bulk_insert_attachments(remapped);
      }

      synced++;
    } catch (e) {
      logger.warn("draft_sync", `failed to fetch/parse draft ${gd.message_id}: ${e}`);
    }
  }

  // Local → Gmail: push drafts created locally that haven't been synced yet
  const localUnsyncedDrafts = getDb().select().from(emails)
    .where(sql`provider = 'local' AND folder = 'drafts' AND account_id = ${account_id} AND gmail_draft_id IS NULL`)
    .all() as EmailRow[];

  for (const draft of localUnsyncedDrafts) {
    if (!draft.to?.trim()) {
      logger.info("draft_sync", `skipped local draft ${draft.id} (no recipient)`);
      continue;
    }
    try {
      const draftAtts = get_attachments_by_email(draft.id);
      const threading: Pick<OutgoingMessage, "in_reply_to" | "references" | "thread_id"> = {};
      if (draft.draft_mode === "reply" && draft.original_email_id) {
        const original = get_email(draft.original_email_id);
        if (original) {
          if (original.thread_id) threading.thread_id = original.thread_id;
          if (original.message_id) {
            threading.in_reply_to = original.message_id;
            threading.references = [original.reply_to, original.message_id].filter(Boolean).join(" ");
          }
        }
      }
      const msg: OutgoingMessage = {
        to: (draft.to || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        cc: draft.cc ? draft.cc.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
        bcc: draft.bcc ? draft.bcc.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
        subject: draft.subject || "",
        body_text: draft.body_text || undefined,
        body_html: draft.body_html || undefined,
        from: draft.from_address || undefined,
        from_name: draft.from_name || undefined,
        local_draft_id: draft.local_draft_id || draft.id,
        ...threading,
        attachments: draftAtts.length > 0
          ? draftAtts.map((a: any) => ({
              filename: a.filename,
              mime_type: a.mime_type,
              data: Buffer.from(a.data || "", "base64"),
            })).filter((a: any) => a.data.length > 0)
          : undefined,
      };
      const result = await adapter.createDraft!(msg);
      getDb().run(sql`UPDATE emails SET gmail_draft_id = ${result.id}, provider = 'gmail' WHERE id = ${draft.id}`);
      synced++;
    } catch (e) {
      logger.warn("draft_sync", `failed to push local draft ${draft.id} to Gmail: ${e}`);
    }
  }

  logger.info("draft_sync", `account_id=${account_id} synced=${synced} removed=${removed}`);
}

export async function sync_all_accounts_drafts(): Promise<void> {
  const accounts = list_accounts();
  for (const account of accounts) {
    if (account.provider !== "gmail" || !account.has_credentials) continue;
    try {
      await sync_account_drafts(account.id);
    } catch (err) {
      logger.warn("draft_sync", `sync failed for account ${account.id}: ${error_message(err)}`);
    }
  }
}
