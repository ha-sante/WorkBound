import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../rpc";

const LIST_CHUNK_SIZE = 10000;

type EmailsByFolder = Record<string, EmailPreviewWire[]>;
type EmailPreviewUpdates = Record<string, any>;
type EmailDateBounds = { newest: string | null; oldest: string | null };

export function group_emails_by_folder(emails: EmailPreviewWire[]): Record<string, EmailPreviewWire[]> {
  // buckets emails into their folders.
  const grouped: Record<string, EmailPreviewWire[]> = {};
  for (const email of emails) {
    if (!grouped[email.folder]) grouped[email.folder] = [];
    grouped[email.folder].push(email);
  }
  return grouped;
}

export function get_emails_for_folder(emails_by_folder: Record<string, EmailPreviewWire[]>, folder: string): EmailPreviewWire[] {
  // gets one folder or all folder emails
  if (folder === "__all__") {
    return Object.values(emails_by_folder).flat().sort((a, b) => ((b.received_at ?? "") < (a.received_at ?? "") ? -1 : 1));
  }
  return emails_by_folder[folder] ?? [];
}

export function find_email_source_folder(emails_by_folder: Record<string, EmailPreviewWire[]>, folder: string, email_id: string): string {
  // finds the actual folder for an email selected from the all-mail view.
  if (folder !== "__all__") return folder;
  for (const [source_folder, list] of Object.entries(emails_by_folder)) {
    if (list.some((email) => email.id === email_id)) return source_folder;
  }
  return folder;
}

function deduplicate_draft_emails(rows: EmailPreviewWire[]): EmailPreviewWire[] {
  // keeps one most complete preview for each draft.
  const map = new Map<string, EmailPreviewWire>();
  for (const row of rows) {
    if (row.folder !== "drafts") {
      map.set(row.id, row);
      continue;
    }
    const key = row.gmail_draft_id || row.original_email_id || row.local_draft_id || row.message_id || row.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const score = (r: EmailPreviewWire) =>
      (r.subject ? 1 : 0) + (r.snippet ? 1 : 0) + (r.toAddr ? 1 : 0) + (r.cc ? 1 : 0) + (r.bcc ? 1 : 0);
    if (score(row) > score(existing)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

export async function load_all_email_previews(account_id: string, seed?: EmailPreviewWire[]): Promise<EmailPreviewWire[]> {
  // load all email previews in pages and remove duplicate drafts.
  const all: EmailPreviewWire[] = seed ? [...seed] : [];
  let before: { received_at: string; id: string } | null = null;
  if (seed) {
    for (let i = seed.length - 1; i >= 0; i--) {
      if (seed[i].received_at) {
        before = { received_at: seed[i].received_at as string, id: seed[i].id };
        break;
      }
    }
  }
  for (;;) {
    const params: { account_id: string; limit: number; offset?: number; before?: { received_at: string; id: string } } = before
      ? { account_id, limit: LIST_CHUNK_SIZE, before }
      : { account_id, limit: LIST_CHUNK_SIZE, offset: 0 };
    const { emails }: { emails: EmailPreviewWire[] } = await rpc.request(messages.mail_list_page, params);
    if (emails.length === 0) break;
    all.push(...emails);
    if (emails.length < LIST_CHUNK_SIZE) break;
    const last: EmailPreviewWire = emails[emails.length - 1];
    before = { received_at: last.received_at as string, id: last.id };
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return deduplicate_draft_emails(all);
}

export function get_email_date_bounds(emails_by_folder: Record<string, EmailPreviewWire[]>): EmailDateBounds {
  // calculate the newest and oldest dates available for pagination.
  let newest: string | null = null;
  let oldest: string | null = null;
  for (const list of Object.values(emails_by_folder)) {
    for (const email of list) {
      if (!email.received_at) continue;
      if (!newest || email.received_at > newest) newest = email.received_at;
      if (!oldest || email.received_at < oldest) oldest = email.received_at;
    }
  }
  return { newest, oldest };
}

const merge_sorted_email_list = (existing: EmailPreviewWire[], new_emails: EmailPreviewWire[]): EmailPreviewWire[] => {
  // replace changed emails and insert new emails without breaking sort order.
  if (new_emails.length === 0) return existing;
  const new_map = new Map(new_emails.map((email) => [email.id, email]));
  const existing_ids = new Set(existing.map((email) => email.id));
  let changed = false;
  const updated = existing.map((email) => {
    const replacement = new_map.get(email.id);
    if (replacement && replacement !== email) {
      changed = true;
      return replacement;
    }
    return email;
  });
  const truly_new = new_emails.filter((email) => !existing_ids.has(email.id));
  if (truly_new.length === 0) return changed ? updated : existing;

  const result: EmailPreviewWire[] = [];
  let i = 0, j = 0;
  while (i < updated.length && j < truly_new.length) {
    const a = updated[i].received_at || "";
    const b = truly_new[j].received_at || "";
    if (a >= b) {
      result.push(updated[i]);
      i++;
    } else {
      result.push(truly_new[j]);
      j++;
    }
  }
  result.push(...updated.slice(i), ...truly_new.slice(j));
  return result;
}

export const move_email_to_folder = (emails_by_folder: EmailsByFolder, email_id: string, source_folder: string, target_folder: string, updates?: EmailPreviewUpdates): EmailsByFolder => {
  // apply an optimistic email move and any related field updates.
  if (source_folder === target_folder) {
    const list = emails_by_folder[source_folder] ?? [];
    return {
      ...emails_by_folder,
      [source_folder]: list.map((email: any) =>
        email.id === email_id ? { ...email, ...updates } : email,
      ),
    };
  }

  const source_list = emails_by_folder[source_folder] ?? [];
  const email = source_list.find((candidate: any) => candidate.id === email_id);
  if (!email) return emails_by_folder;

  const moved = { ...email, ...updates, folder: target_folder } as EmailPreviewWire;
  const destination_list = emails_by_folder[target_folder] ?? [];
  const destination_index = destination_list.findIndex((candidate: any) => (candidate.received_at || "") < (moved.received_at || ""));
  return {
    ...emails_by_folder,
    [source_folder]: source_list.filter((candidate: any) => candidate.id !== email_id),
    [target_folder]: destination_index === -1
      ? [...destination_list, moved]
      : [...destination_list.slice(0, destination_index), moved, ...destination_list.slice(destination_index)],
  };
}

export const merge_emails_by_folder = (existing: Record<string, EmailPreviewWire[]>, new_emails: EmailPreviewWire[]): Record<string, EmailPreviewWire[]> => {
  // incoming email previews into their existing folder lists.
  const grouped = new Map<string, EmailPreviewWire[]>();
  for (const email of new_emails) {
    const folder = email.folder;
    if (!grouped.has(folder)) grouped.set(folder, []);
    grouped.get(folder)!.push(email);
  }

  const result: Record<string, EmailPreviewWire[]> = {};
  for (const [folder, list] of Object.entries(existing)) {
    if (grouped.has(folder)) {
      result[folder] = merge_sorted_email_list(list, grouped.get(folder)!);
    } else {
      result[folder] = list;
    }
  }
  for (const [folder, emails] of grouped) {
    if (!result[folder]) {
      result[folder] = merge_sorted_email_list([], emails);
    }
  }
  return result;
}
