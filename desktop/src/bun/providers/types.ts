import type { AccountRow } from "../db/accounts";

export type OutgoingMessage = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  reply_to_email_id?: string;
  in_reply_to?: string;
  references?: string;
  thread_id?: string;
  from?: string;
  from_name?: string;
  attachments?: { filename: string; mime_type: string; data: Buffer }[];
  local_draft_id?: string;
};

export type SyncResult = {
  fetched: number;
  newCursor?: string;
  newHistoryId?: string;
  done: boolean;
  oldestReceivedAt?: string;
  lastHistoryId?: string;
  email_ids?: string[];
  newIds?: string[];
  deletedIds?: string[];
};

export interface ProviderAdapter {
  connect(account: AccountRow): Promise<void>;
  disconnect(): Promise<void>;
  fetchPastEmails(cursor?: string, maxResults?: number): Promise<SyncResult>;
  fetchNewEmails(history_id: string): Promise<SyncResult>;
  sendEmail(msg: OutgoingMessage): Promise<{id: string; thread_id: string}>;
  delete_email(providerMessageId: string): Promise<void>;
  modifyMessage(providerMessageId: string, payload: Record<string, unknown>): Promise<void>;
  // When present, remove_label_ids should remove the given label IDs from the messages.
  batch_modify(ids: string[], payload: { add_label_ids?: string[]; remove_label_ids?: string[] }): Promise<void>;
  get_attachment(providerAttachmentUrl: string): Promise<Buffer>;

  // Drafts (optional — providers that don't support drafts omit them)
  createDraft?(msg: OutgoingMessage): Promise<{ id: string; message_id: string }>;
  updateDraft?(draft_id: string, msg: OutgoingMessage): Promise<{ message_id: string }>;
  deleteDraft?(draft_id: string): Promise<void>;
  sendDraft?(draft_id: string): Promise<{ id: string; thread_id: string }>;
  listDrafts?(): Promise<GmailDraftRef[]>;
}
