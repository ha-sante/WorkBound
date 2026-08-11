export interface GmailMessage {
  id: string;
  thread_id: string;
  label_ids: string[];
  snippet: string;
  history_id: string;
  internal_date: string;
  payload: GmailMessagePart;
  size_estimate?: number;
  classification_label_values?: { label_id: string; fields: { field_id: string; selection: string }[] }[];
}

export interface GmailMessagePart {
  part_id: string;
  mime_type: string;
  filename: string;
  headers: { name: string; value: string }[];
  body: { size: number; data?: string; attachment_id?: string };
  parts?: GmailMessagePart[];
}

export interface RawAttachment {
  filename: string;
  mime_type: string;
  size: number;
  attachment_id: string;
  cid: string | null;
  disposition: string | null;
  part_id: string | null;
  headers: { name: string; value: string }[] | null;
}

export interface ExtractedParts {
  text_plain: string | null;
  text_html: string | null;
  raw_attachments: RawAttachment[];
}

export interface GmailSendEmailResponse {
  id: string;
  threadId: string;
}

export interface BatchItem {
  id: string;
  method: string;
  path: string;
}

export interface BatchResult {
  id: string;
  status: number;
  body: any;
  headers: Record<string, string>;
}
