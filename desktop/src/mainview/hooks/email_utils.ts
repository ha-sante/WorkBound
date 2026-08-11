import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

export function group_emails_by_folder(emails: EmailPreviewWire[]): Record<string, EmailPreviewWire[]> {
  const grouped: Record<string, EmailPreviewWire[]> = {};
  for (const email of emails) {
    if (!grouped[email.folder]) grouped[email.folder] = [];
    grouped[email.folder].push(email);
  }
  return grouped;
}

export function emails_for_folder(emailsByFolder: Record<string, EmailPreviewWire[]>, folder: string): EmailPreviewWire[] {
  if (folder === "__all__") {
    return Object.values(emailsByFolder)
      .flat()
      .sort((a, b) => ((b.received_at ?? "") < (a.received_at ?? "") ? -1 : 1));
  }
  return emailsByFolder[folder] ?? [];
}

export function source_folder_for(emailsByFolder: Record<string, EmailPreviewWire[]>, folder: string, email_id: string): string {
  if (folder !== "__all__") return folder;
  for (const [f, list] of Object.entries(emailsByFolder)) {
    if (list.some((e) => e.id === email_id)) return f;
  }
  return folder;
}

export function fetch_all_local_emails(account_id: string): Promise<EmailPreviewWire[]> {
  return load_all_emails(account_id);
}

const LIST_CHUNK_SIZE = 20000;

function dedupe_drafts(rows: EmailPreviewWire[]): EmailPreviewWire[] {
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

export async function load_all_emails(account_id: string, seed?: EmailPreviewWire[]): Promise<EmailPreviewWire[]> {
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
  }
  return dedupe_drafts(all);
}

export function get_bounds(emails: Record<string, EmailPreviewWire[]>): { newest: string | null; oldest: string | null } {
  let newest: string | null = null;
  let oldest: string | null = null;
  for (const list of Object.values(emails)) {
    for (const e of list) {
      if (!e.received_at) continue;
      if (!newest || e.received_at > newest) newest = e.received_at;
      if (!oldest || e.received_at < oldest) oldest = e.received_at;
    }
  }
  return { newest, oldest };
}

const merge_into_list = (existing: EmailPreviewWire[], newEmails: EmailPreviewWire[]): EmailPreviewWire[] => {
  const newMap = new Map(newEmails.map((e) => [e.id, e]));
  const updated = existing.map((e) => newMap.get(e.id) ?? e);
  const trulyNew = newEmails.filter((e) => !existing.some((x) => x.id === e.id));
  if (trulyNew.length === 0) return updated;

  const result: EmailPreviewWire[] = [];
  let i = 0, j = 0;
  while (i < updated.length && j < trulyNew.length) {
    const a = updated[i].received_at || "";
    const b = trulyNew[j].received_at || "";
    if (a >= b) {
      result.push(updated[i]);
      i++;
    } else {
      result.push(trulyNew[j]);
      j++;
    }
  }
  result.push(...updated.slice(i), ...trulyNew.slice(j));
  return result;
}

type EmailsByFolder = Record<string, EmailPreviewWire[]>;
type Updates = Record<string, any>;
export const move_email_folder = (emailsByFolder: EmailsByFolder, email_id: string, sourceFolder: string, targetFolder: string, updates?: Updates): EmailsByFolder => {
  if (sourceFolder === targetFolder) {
    const list = emailsByFolder[sourceFolder] ?? [];
    return {
      ...emailsByFolder,
      [sourceFolder]: list.map((e: any) =>
        e.id === email_id ? { ...e, ...updates } : e,
      ),
    };
  }

  const srcList = emailsByFolder[sourceFolder] ?? [];
  const email = srcList.find((e: any) => e.id === email_id);
  if (!email) return emailsByFolder;

  const moved = { ...email, ...updates, folder: targetFolder } as EmailPreviewWire;
  const dstList = emailsByFolder[targetFolder] ?? [];
  const idx = dstList.findIndex((e: any) => (e.received_at || "") < (moved.received_at || ""));
  return {
    ...emailsByFolder,
    [sourceFolder]: srcList.filter((e: any) => e.id !== email_id),
    [targetFolder]: idx === -1 ? [...dstList, moved] : [...dstList.slice(0, idx), moved, ...dstList.slice(idx)],
  };
}

export const merge_emails = (existing: Record<string, EmailPreviewWire[]>, newEmails: EmailPreviewWire[]): Record<string, EmailPreviewWire[]> =>{
  const grouped = new Map<string, EmailPreviewWire[]>();
  for (const email of newEmails) {
    const f = email.folder;
    if (!grouped.has(f)) grouped.set(f, []);
    grouped.get(f)!.push(email);
  }

  const result: Record<string, EmailPreviewWire[]> = {};
  for (const [folder, list] of Object.entries(existing)) {
    if (grouped.has(folder)) {
      result[folder] = merge_into_list(list, grouped.get(folder)!);
    } else {
      result[folder] = list;
    }
  }
  for (const [folder, emails] of grouped) {
    if (!result[folder]) {
      result[folder] = merge_into_list([], emails);
    }
  }
  return result;
}
