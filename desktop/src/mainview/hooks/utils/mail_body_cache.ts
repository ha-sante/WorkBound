import { atom } from "jotai";

const DEFAULT_MAX_EMAIL_BYTES = 500 * 1024;
const DEFAULT_MAX_CACHE_BYTES = 32 * 1024 * 1024;
export const MAIL_BODY_CACHE_MAX_EMAIL_BYTES = Math.max(0, Number.parseInt(import.meta.env.VITE_MAIL_BODY_CACHE_MAX_EMAIL_BYTES ?? "", 10) || DEFAULT_MAX_EMAIL_BYTES);
export const MAIL_BODY_CACHE_MAX_BYTES = Math.max(0, Number.parseInt(import.meta.env.VITE_MAIL_BODY_CACHE_MAX_BYTES ?? "", 10) || DEFAULT_MAX_CACHE_BYTES);

type MailBodyCacheEntry = {
  email: EmailRowWire;
  attachments: AttachmentWire[];
  size_bytes: number;
  last_accessed_at: number;
};

type MailBodyCacheState = {
  entries: Record<string, MailBodyCacheEntry>;
  bytes: number;
};

type MailBodyCacheSize = {
  body_text_bytes: number;
  body_html_bytes: number;
  attachment_metadata_bytes: number;
  total_bytes: number;
};

export const mail_body_cache_atom = atom<MailBodyCacheState>({ entries: {}, bytes: 0 });

export const mail_body_cache_key = (account_id: string, email_id: string): string => `${account_id}:${email_id}`;

export function mail_body_cache_size(email: EmailRowWire, attachments: AttachmentWire[]): MailBodyCacheSize {
  const encoder = new TextEncoder();
  const body_text_bytes = encoder.encode(email.body_text ?? "").byteLength;
  const body_html_bytes = encoder.encode(email.body_html ?? "").byteLength;
  const attachment_metadata_bytes = encoder.encode(JSON.stringify(attachments)).byteLength;
  return {
    body_text_bytes,
    body_html_bytes,
    attachment_metadata_bytes,
    total_bytes: body_text_bytes + body_html_bytes + attachment_metadata_bytes,
  };
}

export function touch_mail_body_cache(state: MailBodyCacheState, key: string): MailBodyCacheState {
  const entry = state.entries[key];
  if (!entry) return state;
  return {
    ...state,
    entries: {
      ...state.entries,
      [key]: { ...entry, last_accessed_at: Date.now() },
    },
  };
}

export function cache_mail_body(state: MailBodyCacheState, account_id: string, email: EmailRowWire, attachments: AttachmentWire[]): MailBodyCacheState {
  const key = mail_body_cache_key(account_id, email.id);
  const size = mail_body_cache_size(email, attachments);
  if (size.total_bytes > MAIL_BODY_CACHE_MAX_EMAIL_BYTES) {
    console.info("[mail-cache] skipped oversized email", { email_id: email.id, ...size, limit_bytes: MAIL_BODY_CACHE_MAX_EMAIL_BYTES });
    return state;
  }
  const size_bytes = size.total_bytes;

  console.debug("[mail-cache] cached email", { email_id: email.id, ...size, limit_bytes: MAIL_BODY_CACHE_MAX_EMAIL_BYTES });

  const entries = { ...state.entries };
  const existing = entries[key];
  let bytes = state.bytes - (existing?.size_bytes ?? 0);
  delete entries[key];

  // LRU caching of the mail bodies - in a bounded memory usage state
  while (bytes + size_bytes > MAIL_BODY_CACHE_MAX_BYTES) {
    const oldest_entry = Object.entries(entries).sort(([, first], [, second]) => first.last_accessed_at - second.last_accessed_at,)[0];
    if (!oldest_entry) break;

    const [oldest_key, oldest_value] = oldest_entry;
    bytes -= oldest_value.size_bytes;
    delete entries[oldest_key];
  }

  entries[key] = {
    email,
    attachments,
    size_bytes,
    last_accessed_at: Date.now(),
  };
  return { entries, bytes: bytes + size_bytes };
}
