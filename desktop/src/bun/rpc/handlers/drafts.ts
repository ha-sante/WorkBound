import { messages } from "../../../shared/rpc_messages";
import { outbox_commands } from "../../../shared/outbox_commands";
import { logger } from "../../utils/logger";
import { rpc_send } from "../index";
import { save_draft, get_draft, delete_draft, find_draft_by_original_email_id } from "../../db/drafts";
import { get_attachments_by_email, bulk_insert_attachments } from "../../db/attachments";
import { getDb } from "../../db/client";
import { emails, attachments } from "../../db/schema";
import { ATTACHMENT_SIZE_LIMIT } from "../../utils/constants";
import { eq, sql } from "drizzle-orm";
import { get_account } from "../../db/accounts";
import { get_adapter } from "../../providers/index";
import type { OutgoingMessage } from "../../providers/types";
import { insert_email, delete_email, list_emails, get_email, type EmailRow } from "../../db/emails";
import { fetch_email_by_id, parse_message_full } from "../../providers/gmail/api";
import { withGmailAuth } from "../../providers/gmail/auth";
import { insert_outbox } from "../../db/outbox";

function parse_draft_headers(headers: string | null): { draft_mode: string; original_email_id: string | null } {
  try {
    const parsed = JSON.parse(headers || "{}");
    if (Array.isArray(parsed)) {
      return { draft_mode: "new", original_email_id: null };
    }
    return {
      draft_mode: parsed.draft_mode || "new",
      original_email_id: parsed.original_email_id || null,
    };
  } catch {
    return { draft_mode: "new", original_email_id: null };
  }
}

function row_to_draft_wire(row: any): DraftWire {
  const hdrs = parse_draft_headers(row.headers);
  const atts = get_attachments_by_email(row.id);
  let quote_text = row.quote_text ?? null;
  if (!quote_text && row.headers && !Array.isArray(row.headers)) {
    try {
      quote_text = JSON.parse(row.headers).quote_text ?? null;
    } catch { logger.warn("rpc", "draft:get: failed to parse headers"); }
  }
  return {
    id: row.id,
    account_id: row.account_id,
    mode: (row.draft_mode as DraftMode) || hdrs.draft_mode || "new",
    to: row.to || "",
    cc: row.cc ?? null,
    bcc: row.bcc ?? null,
    subject: row.subject ?? null,
    body_html: row.body_html ?? null,
    body_text: row.body_text ?? null,
    from_address: row.from_address ?? null,
    from_name: row.from_name ?? null,
    original_email_id: row.original_email_id || hdrs.original_email_id,
    quote_text,
    snippet: row.snippet ?? null,
    gmail_draft_id: row.gmail_draft_id ?? null,
    gmail_message_id: row.message_id ?? null,
    attachments: atts.map((a: any) => ({
      id: a.id,
      email_id: a.email_id,
      filename: a.filename,
      mime_type: a.mime_type,
      size: a.size,
      local_path: a.local_path,
      cid: a.cid,
      disposition: a.disposition,
      part_id: a.part_id,
      headers: a.headers,
      data: a.data,
    })),
    updated_at: row.updated_at ?? null,
  };
}

export default {
  [messages.draft_save]: async (params: {
    id?: string;
    account_id: string;
    mode: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body_html: string;
    body_text: string;
    from_address?: string;
    from_name?: string;
    original_email_id?: string;
    quote_text?: string;
    lastGmailMessageId?: string;
    force?: boolean;
    attachments: AttachmentPayload[];
  }) => {
    const toTrimmed = params.to?.trim() || "";
    logger.file("gmail").info(`draft:save params=` + JSON.stringify({ ...params, lastGmailMessageId: params.lastGmailMessageId ?? null }));
    const snippet = (params.body_text || "").slice(0, 100);

    const proposedId = params.id || crypto.randomUUID();
    const { id: draft_id, conflict } = save_draft({
      id: proposedId,
      account_id: params.account_id,
      mode: (params.mode as DraftMode) || "new",
      to: toTrimmed,
      cc: params.cc?.trim() || null,
      bcc: params.bcc?.trim() || null,
      subject: params.subject ?? null,
      body_html: params.body_html ?? null,
      body_text: params.body_text ?? null,
      snippet,
      from_address: params.from_address || null,
      from_name: params.from_name || null,
      original_email_id: params.original_email_id || null,
      quote_text: params.quote_text || null,
      local_draft_id: proposedId,
      lastGmailMessageId: params.lastGmailMessageId ?? null,
      force: params.force,
    });

    const totalAttachSize = params.attachments.reduce((sum, a) => sum + a.size, 0);
    if (totalAttachSize > ATTACHMENT_SIZE_LIMIT) {
      throw new Error(`Total attachment size (${Math.round(totalAttachSize / (1024 * 1024))}MB) exceeds the 25MB limit`);
    }

    for (const a of params.attachments) {
      if (a.size > ATTACHMENT_SIZE_LIMIT) {
        throw new Error(`Attachment "${a.name}" exceeds the 25MB limit`);
      }
    }

    if (params.attachments.length > 0) {
      getDb().delete(attachments).where(eq(attachments.email_id, draft_id)).run();
      bulk_insert_attachments(
        params.attachments.map((a) => ({
          id: crypto.randomUUID(),
          email_id: draft_id,
          filename: a.name,
          mime_type: a.mime_type,
          size: a.size,
          local_path: a.local_path,
          data: a.data,
        })),
      );
    }

    if (!conflict) {
      const outboxId = crypto.randomUUID();
      insert_outbox({
        id: outboxId,
        account_id: params.account_id,
        command: outbox_commands.draft_save,
        payload: JSON.stringify({
          draft_id,
          mode: params.mode,
          to: toTrimmed,
          cc: params.cc?.trim() || null,
          bcc: params.bcc?.trim() || null,
          subject: params.subject ?? null,
          body_html: params.body_html ?? null,
          body_text: params.body_text ?? null,
          from_address: params.from_address ?? null,
          from_name: params.from_name ?? null,
          original_email_id: params.original_email_id ?? null,
          attachments: params.attachments.length > 0 ? params.attachments : null,
        }),
        status: "queued",
        created_at: Date.now(),
      });
      logger.info("rpc", `draft:save id=${draft_id} mode=${params.mode} outboxId=${outboxId}`);
    } else {
      logger.info("rpc", `draft:save conflict id=${draft_id} mode=${params.mode} — skipping outbox`);
    }
    return { id: draft_id, conflict: !!conflict };
  },

  [messages.draft_get]: async (params: EntityId) => {
    const row = get_draft(params.id);
    if (!row) {
      logger.info("rpc", `draft:get id=${params.id} not found`);
      return null;
    }

    const result = row_to_draft_wire(row);
    logger.info("rpc", `draft:get id=${params.id} mode=${result.mode}`);
    return result;
  },

  [messages.draft_delete]: async (params: EntityId) => {
    const row = get_draft(params.id);

    getDb().run(sql`BEGIN`);
    try {
      if (row) {
        const outboxId = crypto.randomUUID();
        insert_outbox({
          id: outboxId,
          account_id: row.account_id,
          command: outbox_commands.draft_delete,
          payload: JSON.stringify({ gmail_draft_id: row.gmail_draft_id ?? null }),
          status: "queued",
          created_at: Date.now(),
        });
      }

      delete_draft(params.id);
      getDb().run(sql`COMMIT`);
    } catch (e) {
      getDb().run(sql`ROLLBACK`);
      throw e;
    }

    logger.info("rpc", `draft:delete id=${params.id} hadGmailDraft=${!!row?.gmail_draft_id}`);
    if (row) {
      rpc_send(messages.email_command, {
        cmd: "draft-deleted",
        email_id: params.id,
      });
    }
    return { success: true };
  },

  [messages.draft_find_by_original]: async (params: { account_id: string; original_email_id: string }) => {
    const row = find_draft_by_original_email_id(params.account_id, params.original_email_id);
    if (!row) {
      logger.info("rpc", `draft:find_by_original original_email_id=${params.original_email_id} not found`);
      return null;
    }

    const result = row_to_draft_wire(row);
    logger.info("rpc", `draft:find_by_original id=${result.id} original_email_id=${params.original_email_id}`);
    return result;
  },

  [messages.draft_list]: async (params: AccountScope) => {
    const result = list_emails({ account_id: params.account_id, folder: "drafts" });
    logger.info("rpc", `draft:list account_id=${params.account_id} count=${result.length}`);
    return result;
  },

  [messages.draft_sync]: async (params: AccountScope) => {
    const account = get_account(params.account_id);
    if (!account) throw new Error(`Account not found: ${params.account_id}`);
    if (account.provider !== "gmail") return { synced: 0, removed: 0 };

    const adapter = get_adapter("gmail");
    await adapter.connect(account);

    let gmailDrafts: GmailDraftRef[];
    try {
      gmailDrafts = await adapter.listDrafts!();
    } catch (e) {
      logger.warn("rpc", `draft:sync: listDrafts failed for ${params.account_id}, aborting: ${e}`);
      return { synced: 0, removed: 0 };
    }

    const gmailByMessageId = new Map(gmailDrafts.map((d) => [d.message_id, d]));
    const gmailByDraftId = new Map(gmailDrafts.map((d) => [d.id, d]));

    // Fetch all local provider='gmail' drafts for this account
    const localGmailDrafts = getDb().select().from(emails)
      .where(sql`provider = 'gmail' AND folder = 'drafts' AND account_id = ${params.account_id}`)
      .all() as EmailRow[];

    let synced = 0;
    let removed = 0;

    // Remove local drafts that no longer exist in Gmail (only when response is healthy)
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
      .where(sql`provider = 'gmail' AND folder = 'drafts' AND account_id = ${params.account_id}`)
      .all() as EmailRow[];

    // Gmail → local: pull drafts from server
    for (const gd of gmailDrafts) {
      const existing = remainingLocal.find((l) =>
        l.message_id === gd.message_id || (l.gmail_draft_id && l.gmail_draft_id === gd.id)
      );
      if (existing && existing.gmail_draft_id === gd.id) {
        if (!existing.message_id || existing.message_id !== gd.message_id) {
          getDb().run(sql`UPDATE emails SET message_id = ${gd.message_id} WHERE id = ${existing.id}`);
        }
        continue;
      }

      try {
        const raw = await withGmailAuth(params.account_id, (token) =>
          fetch_email_by_id(token, gd.message_id, "full"),
        );
        const parsed = parse_message_full(raw, params.account_id);
        const emailData = {
          ...parsed.email,
          id: gd.message_id,
          provider: "gmail" as const,
          folder: "drafts",
          gmail_draft_id: gd.id,
          thread_id: gd.thread_id,
        };
        insert_email(emailData);

        // Replace attachments for this draft (delete old, insert new)
        getDb().delete(attachments).where(eq(attachments.email_id, gd.message_id)).run();
        if (parsed.attachments.length > 0) {
          bulk_insert_attachments(parsed.attachments);
        }

        synced++;
      } catch (e) {
        logger.warn("rpc", `draft:sync: failed to fetch/parse draft ${gd.message_id}: ${e}`);
      }
    }

    // Local → Gmail: push drafts created locally that haven't been synced yet
    const localUnsyncedDrafts = getDb().select().from(emails)
      .where(sql`provider = 'local' AND folder = 'drafts' AND account_id = ${params.account_id} AND gmail_draft_id IS NULL`)
      .all() as EmailRow[];

      for (const draft of localUnsyncedDrafts) {
        if (!draft.to?.trim()) {
          logger.info("rpc", `draft:sync: skipped local draft ${draft.id} (no recipient)`);
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
        logger.warn("rpc", `draft:sync: failed to push local draft ${draft.id}: ${e}`);
      }
    }

    logger.info("rpc", `draft:sync account_id=${params.account_id} synced=${synced} removed=${removed}`);
    return { synced, removed };
  },
};
