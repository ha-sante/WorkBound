import type { ProviderAdapter, SyncResult, OutgoingMessage } from "../types";
import type { AccountRow } from "../../db/accounts";
import type { EmailInput } from "../../db/emails";
import type { AttachmentRow } from "../../db/attachments";
import { delete_email } from "../../db/emails";
import { upsert_newfill_state } from "../../db/accounts";
import { withGmailAuth } from "./auth";
import { get_tokens } from "../../utils/token_store";
import { fetch_emails_by_page_token, fetch_new_emails_by_history_id, fetch_gmail_profile, SyncResetError, InvalidHistoryIdError, GmailAuthError, download_attachment, modify_message, batch_modify, trash_message, create_draft, update_draft, delete_draft, send_draft, list_drafts } from "./api";
import { build_mime_message } from "./mime";
import { logger } from "../../utils/logger";
import { error_message } from "../../../shared/errors";
import type { GmailSendEmailResponse } from "./types";
import { sync_labels } from "../../db/labels";
import { reconcile_removed_labels } from "../../intelligence/label_reconcile";
import { persist_draft_batch, persist_viewable_batch, sync_labels_for_emails, sync_contacts_for_emails } from "./store";
import { delete_captured_outbox_for_message } from "../../db/outbox";
import { rpc_send } from "../../rpc";
import { messages } from "../../../shared/rpc_messages";

export class GmailAdapter implements ProviderAdapter {
  private access_token = "";
  private account_id = "";
  private accountEmail = "";

  async connect(account: AccountRow): Promise<void> {
    this.access_token = "";
    this.account_id = account.id;
    this.accountEmail = account.email;
    if (account.has_credentials) {
      const tokens = await get_tokens(account.id);
      if (tokens?.access_token) {
        this.access_token = tokens.access_token;
        sync_labels(this.account_id, this.access_token)
          .then(({ removed, changed }) => {
            reconcile_removed_labels(this.account_id, removed);
            if (changed) rpc_send(messages.labels_changed, { account_id: this.account_id });
          })
          .catch((e) => logger.warn("labels", `initial label sync failed for ${this.account_id.slice(0, 8)}: ${error_message(e)}`));
      }
    }
  }

  async disconnect(): Promise<void> {
    this.access_token = "";
    this.account_id = "";
    this.accountEmail = "";
  }

  private async withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withGmailAuth(this.account_id, async (token) => {
      this.access_token = token;
      return await fn();
    });
  }

  private async persistBatch(emails: EmailInput[], attachments: AttachmentRow[]) {
    try {
      const draftEmails = emails.filter(e => e.folder === 'drafts');
      const viewableEmails = emails.filter(e => e.folder !== 'drafts');

      const draftResult = await persist_draft_batch({
        access_token: this.access_token,
        account_id: this.account_id,
        drafts: draftEmails,
        listDrafts: () => this.listDrafts(),
      });

      const remainingEmails = viewableEmails.filter(e => !draftResult.existingIds.has(e.id!));
      await persist_viewable_batch(this.access_token, this.account_id, remainingEmails);

      await sync_labels_for_emails(this.account_id, this.access_token, emails);
      const contactCount = await sync_contacts_for_emails(this.account_id, emails);

      logger.info("gmail", `persistBatch done: account=${this.account_id} draft_updates=${draftResult.updates} draft_creates=${draftResult.creates} dupesPurged=${draftResult.dupesPurged} viewables=${remainingEmails.length} contactsCreated=${contactCount}`);
    } catch (err) {
      logger.error("gmail", `persistBatch failed: account=${this.account_id} emails=${emails.length} attachments=${attachments.length} err=${err}`);
      throw err;
    }
  }

  async fetchPastEmails(cursor?: string, maxResults?: number): Promise<SyncResult> {
    try {
      logger.info("gmail", `fetchPastEmails: cursor=${cursor ?? "null"} maxResults=${maxResults ?? "null"}`);
      const { emails, attachments, nextCursor, hasMore, oldestReceivedAt, lastHistoryId } = await this.withAuthRetry(() =>
        fetch_emails_by_page_token(this.access_token, this.account_id, cursor, { maxResults }),
      );
      logger.info("gmail", `fetchPastEmails result: emails=${emails.length} nextCursor=${nextCursor ?? "null"} hasMore=${hasMore}`);

      await this.persistBatch(emails, attachments);

      return { fetched: emails.length, newCursor: nextCursor, done: !hasMore, oldestReceivedAt, lastHistoryId };
    } catch (err) {
      if (err instanceof SyncResetError) {
        logger.info("gmail", "SyncResetError: history too old, re-fetching from scratch");
        const { emails, attachments, nextCursor, hasMore, oldestReceivedAt, lastHistoryId } = await this.withAuthRetry(() =>
          fetch_emails_by_page_token(this.access_token, this.account_id, undefined, { maxResults }),
        );
        logger.info("gmail", `SyncResetError recovery: emails=${emails.length} nextCursor=${nextCursor ?? "null"}`);
        await this.persistBatch(emails, attachments);
        return { fetched: emails.length, newCursor: nextCursor, done: !hasMore, oldestReceivedAt, lastHistoryId };
      }
      throw err;
    }
  }

  async fetchNewEmails(history_id: string): Promise<SyncResult> {
    try {
      const { emails, attachments, newHistoryId, hasMore, deletedIds, newIds } = await this.withAuthRetry(() =>
        fetch_new_emails_by_history_id(this.access_token, this.account_id, history_id),
      );
      const email_ids = emails.map(e => e.id!);
      if (emails.length === 0 && deletedIds.length === 0) {
        return { fetched: 0, newHistoryId, done: true, email_ids: [], newIds: [] };
      }

      logger.info("gmail", `fetchNewEmails result: emails=${emails.length} deletedIds=${deletedIds.length} newHistoryId=${newHistoryId ?? "null"} hasMore=${hasMore}`);
      if (deletedIds.length) logger.file("gmail").info(`deletedIds=${JSON.stringify(deletedIds)}`);

      // Delete locally for messages permanently deleted from Gmail
      let cleanedCaptured = 0;
      for (const id of deletedIds) {
        try { delete_email(id); } catch { /* row may not exist */ }
        try {
          const cleaned = delete_captured_outbox_for_message(this.account_id, id);
          if (cleaned > 0) logger.info("gmail", `cleaned ${cleaned} captured card(s) for deleted message ${id}`);
          cleanedCaptured += cleaned;
        } catch { /* row may not exist */ }
      }
      if (cleanedCaptured > 0) {
        rpc_send(messages.outbox_changed, { account_id: this.account_id, thread_id: null });
      }

      await this.persistBatch(emails, attachments);
      return { fetched: emails.length, newHistoryId, done: !hasMore, email_ids, newIds: newIds ?? [], deletedIds };
    } catch (err) {
      if (err instanceof SyncResetError) {
        logger.info("gmail", `SyncResetError in fetchNewEmails: history ${history_id} stale, full sync to get fresh history_id`);

        const result = await this.withAuthRetry(() =>
          fetch_emails_by_page_token(this.access_token, this.account_id),
        );

        const email_ids = result.emails.map(e => e.id!);
        await this.persistBatch(result.emails, result.attachments);

        upsert_newfill_state({
          account_id: this.account_id,
          newfill_current_history_id: result.lastHistoryId ?? null,
          newfill_last_synced_at: new Date().toISOString(),
          newfill_status: "done",
        });

        return { fetched: result.emails.length, newHistoryId: result.lastHistoryId, done: !result.hasMore, email_ids, newIds: [] };
      }

      if (err instanceof InvalidHistoryIdError) {
        logger.info("gmail", `InvalidHistoryIdError in fetchNewEmails: history_id ${history_id} invalid, fetching fresh history_id`);

        const profile = await this.withAuthRetry(() =>
          fetch_gmail_profile(this.access_token),
        );

        upsert_newfill_state({
          account_id: this.account_id,
          newfill_current_history_id: profile.history_id,
          newfill_last_synced_at: new Date().toISOString(),
          newfill_status: "idle",
        });

        return { fetched: 0, newHistoryId: profile.history_id, done: true };
      }

      throw err;
    }
  }

  async sendEmail(msg: OutgoingMessage): Promise<{id: string; thread_id: string}> {
    return this.withAuthRetry(async () => {
      const to = msg.to.filter(Boolean);
      if (to.length === 0) throw new Error("Cannot send email: no recipients");

      const fromAddr = msg.from ?? this.accountEmail;
      const fromDisplay = msg.from_name ?? undefined;

      const encoded = build_mime_message({
        from: fromDisplay ? `${fromDisplay} <${fromAddr}>` : fromAddr,
        to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        body_text: msg.body_text,
        body_html: msg.body_html,
        in_reply_to: msg.in_reply_to,
        references: msg.references,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          data: a.data,
        })),
      });

      const body: Record<string, unknown> = { raw: encoded };
      if (msg.thread_id) body.threadId = msg.thread_id;

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401) throw new GmailAuthError();
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Gmail send failed (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as GmailSendEmailResponse;
      logger.info("gmail", `sendEmail: sent msgId=${data.id} thread_id=${data.threadId} to=${msg.to.join(",")}`);
      return { id: data.id, thread_id: data.threadId };
    });
  }

  async delete_email(providerMessageId: string): Promise<void> {
    await this.withAuthRetry(() =>
      trash_message(this.access_token, providerMessageId),
    );
  }

  async modifyMessage(providerMessageId: string, payload: Record<string, unknown>): Promise<void> {
    await this.withAuthRetry(() =>
      modify_message(this.access_token, providerMessageId, payload as { add_label_ids?: string[]; remove_label_ids?: string[] }),
    );
  }

  async batch_modify(ids: string[], payload: { add_label_ids?: string[]; remove_label_ids?: string[] }): Promise<void> {
    await this.withAuthRetry(() =>
      batch_modify(this.access_token, ids, payload),
    );
  }

  async get_attachment(_providerAttachmentUrl: string): Promise<Buffer> {
    const url = _providerAttachmentUrl;
    if (url.startsWith("gmail://")) {
      const parts = url.slice(8).split("/");
      if (parts.length === 2) {
        return this.withAuthRetry(() =>
          download_attachment(this.access_token, parts[0], parts[1]),
        );
      }
    }
    return Buffer.from("");
  }

  async createDraft(msg: OutgoingMessage): Promise<{ id: string; message_id: string }> {
    return this.withAuthRetry(async () => {
      const to = msg.to.filter(Boolean);
      const fromAddr = msg.from ?? this.accountEmail;
      const fromDisplay = msg.from_name ?? undefined;

      const extraHeaders: Record<string, string> = {};
      if (msg.local_draft_id) {
        extraHeaders["X-WorkBound-Local-Id"] = msg.local_draft_id;
      }

      logger.info("gmail", `createDraft: localId=${msg.local_draft_id}`);

      const encoded = build_mime_message({
        from: fromDisplay ? `${fromDisplay} <${fromAddr}>` : fromAddr,
        to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        body_text: msg.body_text,
        body_html: msg.body_html,
        in_reply_to: msg.in_reply_to,
        references: msg.references,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          data: a.data,
        })),
        extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
      });

      const result = await create_draft(this.access_token, encoded, msg.thread_id);
      return { id: result.id, message_id: result.message.id };
    });
  }

  async updateDraft(draft_id: string, msg: OutgoingMessage): Promise<{ message_id: string }> {
    return this.withAuthRetry(async () => {
      const to = msg.to.filter(Boolean);
      const fromAddr = msg.from ?? this.accountEmail;
      const fromDisplay = msg.from_name ?? undefined;

      const extraHeaders: Record<string, string> = {};
      if (msg.local_draft_id) {
        extraHeaders["X-WorkBound-Local-Id"] = msg.local_draft_id;
      }

      logger.info("gmail", `updateDraft: localId=${msg.local_draft_id}`);

      const encoded = build_mime_message({
        from: fromDisplay ? `${fromDisplay} <${fromAddr}>` : fromAddr,
        to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        body_text: msg.body_text,
        body_html: msg.body_html,
        in_reply_to: msg.in_reply_to,
        references: msg.references,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          data: a.data,
        })),
        extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
      });

      const result = await update_draft(this.access_token, draft_id, encoded);
      return { message_id: result.message.id };
    });
  }

  async deleteDraft(draft_id: string): Promise<void> {
    return this.withAuthRetry(async () => {
      await delete_draft(this.access_token, draft_id);
    });
  }

  async sendDraft(draft_id: string): Promise<{ id: string; thread_id: string }> {
    return this.withAuthRetry(async () => {
      const result = await send_draft(this.access_token, draft_id);
      return { id: result.id, thread_id: result.thread_id };
    });
  }

  async listDrafts(): Promise<GmailDraftRef[]> {
    return this.withAuthRetry(async () => {
      const drafts = await list_drafts(this.access_token);
      return drafts.map((d) => ({
        id: d.id,
        message_id: d.message.id,
        thread_id: d.message.thread_id,
      }));
    });
  }
}
