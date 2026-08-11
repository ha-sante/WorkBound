import { getDb, get_raw_db } from "./client";
import { contacts } from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { insert_contact_fts, delete_contact_fts } from "./fts";
import { logger } from "../utils/logger";
import type { EmailInput } from "./emails";

type ContactEmailFields = {
  from_address?: string | null;
  from_name?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
};

type UpsertContactInput = {
  account_id: string;
  name: string | null;
  email: string;
  avatar_url?: string | null;
  emails_received?: number;
  emails_sent?: number;
};

type ContactCreateInput = {
  name?: string;
  email: string;
};

type ContactUpdateInput = {
  name?: string;
  email?: string;
};

function split_addresses(raw: string | null): { name: string | null; email: string }[] {
  if (!raw) return [];
  const results: { name: string | null; email: string }[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/<([^>]+)>/);
    if (match) {
      const name = trimmed.replace(/<[^>]+>/, '').trim().replace(/^"(.*)"$/, '$1').trim() || null;
      results.push({ email: match[1].trim(), name });
    } else {
      results.push({ email: trimmed, name: null });
    }
  }
  return results;
}

export function extract_contact_interactions(
  accountEmail: string,
  email: ContactEmailFields
): ContactInteraction[] {
  const results: ContactInteraction[] = [];
  const seen = new Set<string>();

  const add = (addr: string, name: string | null, type: 'received' | 'sent') => {
    const key = addr.toLowerCase();
    if (!addr || key === accountEmail.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    results.push({ email: addr, name, type });
  };

  if (email.from_address && email.from_address.toLowerCase() !== accountEmail.toLowerCase()) {
    add(email.from_address, email.from_name ?? null, 'received');
  }

  if (email.from_address && email.from_address.toLowerCase() === accountEmail.toLowerCase()) {
    for (const addr of split_addresses(email.to ?? null)) add(addr.email, addr.name, 'sent');
    for (const addr of split_addresses(email.cc ?? null)) add(addr.email, addr.name, 'sent');
    for (const addr of split_addresses(email.bcc ?? null)) add(addr.email, addr.name, 'sent');
  }

  return results;
}

export function upsert_contact(data: UpsertContactInput): boolean {
  const existing = getDb()
    .select({ id: contacts.id, times_contacted: contacts.times_contacted, emails_received: contacts.emails_received, 
      emails_sent: contacts.emails_sent, name: contacts.name, avatar_url: contacts.avatar_url })
    .from(contacts)
    .where(and(eq(contacts.account_id, data.account_id), eq(contacts.email, data.email)))
    .get();

  const addReceived = data.emails_received ?? 0;
  const addSent = data.emails_sent ?? 0;

  if (existing) {
    const name = data.name ?? existing.name;
    getDb().update(contacts).set({
      name,
      avatar_url: data.avatar_url ?? existing.avatar_url,
      times_contacted: existing.times_contacted + addReceived + addSent,
      emails_received: existing.emails_received + addReceived,
      emails_sent: existing.emails_sent + addSent,
      last_contacted_at: new Date().toISOString(),
      updated_at: sql`datetime('now')`,
    }).where(eq(contacts.id, existing.id)).run();
  } else {
    const id = crypto.randomUUID();
    getDb().insert(contacts).values({
      id,
      account_id: data.account_id,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url ?? null,
      last_contacted_at: new Date().toISOString(),
      times_contacted: addReceived + addSent,
      emails_received: addReceived,
      emails_sent: addSent,
    }).run();
    const rowid = (getDb().get(sql`SELECT rowid FROM contacts WHERE id = ${id}`) as { rowid: number } | undefined)?.rowid;
    if (rowid) {
      try {
        insert_contact_fts(rowid, data.name, data.email);
      } catch (e) {
        logger.error("db", `contacts FTS insert failed: ${e}`);
      }
    }
    return true;
  }
  return false;
}

export function update_contact_avatar(account_id: string, email: string, avatar_url: string): void {
  getDb().update(contacts).set({
    avatar_url,
    photo_fetched_at: sql`datetime('now')`,
    updated_at: sql`datetime('now')`,
  }).where(and(eq(contacts.account_id, account_id), eq(contacts.email, email))).run();
}

export function update_contacts_photo_fetched_at(account_id: string, emails: string[]): void {
  if (emails.length === 0) return;
  const placeholders = emails.map(() => "?").join(", ");
  const query =
    `UPDATE contacts SET photo_fetched_at = datetime('now'), updated_at = datetime('now') ` +
    `WHERE account_id = ? AND lower(email) IN (${placeholders})`;
  get_raw_db().query(query).run(account_id, ...emails.map((e) => e.toLowerCase()));
}

export function get_contacts_needing_photo_refresh(account_id: string, limit?: number): string[] {
  const args: (string | number)[] = [account_id];

  const conds = [
    "account_id = ?",
    `(
      (avatar_url IS NULL OR avatar_url = '')
      OR julianday(last_contacted_at) >= julianday('now', '-24 hours')
    )`,
    `(photo_fetched_at IS NULL OR photo_fetched_at <= datetime('now', '-24 hours'))`,
  ];

  let query = `SELECT email FROM contacts WHERE ${conds.join(" AND ")} ORDER BY last_contacted_at DESC`;
  if (limit) query += ` LIMIT ${limit}`;

  const rows = get_raw_db().query(query).all(...args) as { email: string }[];
  return rows.map((r) => r.email);
}

export function sync_contacts_for_emails(account_id: string, accountEmail: string, emails: EmailInput[], avatar_urls?: Map<string, string>): number {
  const contactMap = new Map<string, { name: string | null; email: string; received: number; sent: number }>();
  const add = (addr: string, name: string | null, type: 'received' | 'sent') => {
    const existing = contactMap.get(addr);
    if (existing) {
      if (type === 'received') existing.received++;
      else existing.sent++;
      if (name && !existing.name) existing.name = name;
    } else {
      contactMap.set(addr, { email: addr, name, received: type === 'received' ? 1 : 0, sent: type === 'sent' ? 1 : 0 });
    }
  };

  for (const email of emails) {
    for (const ix of extract_contact_interactions(accountEmail, {
      from_address: email.from_address,
      from_name: email.from_name,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
    })) {
      add(ix.email, ix.name, ix.type);
    }
  }

  let created = 0;
  for (const c of contactMap.values()) {
    if (
      upsert_contact({
        account_id,
        name: c.name,
        email: c.email,
        avatar_url: avatar_urls?.get(c.email) ?? null,
        emails_received: c.received,
        emails_sent: c.sent,
      })
    ) {
      created++;
    }
  }

  return created;
}

export function list_contacts(account_id: string): ContactRow[] {
  return getDb().all(sql`SELECT * FROM contacts WHERE account_id = ${account_id} ORDER BY times_contacted DESC`) as ContactRow[];
}

export function search_contacts(account_id: string, q: string, limit = 10): ContactRow[] {
  if (!q.trim()) return [];
  const sanitized = q.trim().replace(/[^\w@.+_-]/g, " ").replace(/\s+/g, " ").trim();
  if (!sanitized) return [];

  const ftsQuery = sanitized.split(/\s+/).map((t) => `${t}*`).join(" ");

  const rows = getDb().all(sql`
    SELECT c.* FROM contacts c
    INNER JOIN contacts_fts f ON c.rowid = f.rowid
    WHERE c.account_id = ${account_id} AND contacts_fts MATCH ${ftsQuery}
    ORDER BY c.times_contacted DESC
    LIMIT ${limit}
  `) as ContactRow[];

  logger.info("contacts", `search_contacts account_id=${account_id} q="${q}" sanitized="${sanitized}" ftsQuery="${ftsQuery}" count=${rows.length}`);
  return rows;
}

export function create_contact(account_id: string, data: ContactCreateInput): ContactRow {
  const id = crypto.randomUUID();
  getDb().run(sql`INSERT INTO contacts (id, account_id, name, email, last_contacted_at, times_contacted, emails_received, emails_sent) VALUES (${id}, ${account_id}, ${data.name ?? null}, ${data.email}, NULL, 0, 0, 0)`);
  const count = getDb().get(sql`SELECT COUNT(*) as c FROM emails WHERE account_id = ${account_id} AND from_address = ${data.email}`) as { c: number } | undefined;
  if (count?.c) {
    getDb().run(sql`UPDATE contacts SET times_contacted = ${count.c}, emails_received = ${count.c} WHERE id = ${id}`);
  }
  const rowid = (getDb().get(sql`SELECT rowid FROM contacts WHERE id = ${id}`) as { rowid: number } | undefined)?.rowid;
  if (rowid) {
    try {
      insert_contact_fts(rowid, data.name ?? null, data.email);
    } catch (e) {
      logger.error("db", `contacts FTS insert failed: ${e}`);
    }
  }
  logger.info("db", `create_contact id=${id} email=${data.email} count=${count?.c ?? 0}`);
  return getDb().get(sql`SELECT * FROM contacts WHERE id = ${id}`) as ContactRow;
}

export function update_contact(id: string, data: ContactUpdateInput): void {
  const sets: ReturnType<typeof sql>[] = [];
  if (data.name !== undefined) sets.push(sql`name = ${data.name}`);
  if (data.email !== undefined) sets.push(sql`email = ${data.email}`);
  if (sets.length === 0) return;
  getDb().run(sql`UPDATE contacts SET ${sql.join(sets, sql`, `)}, updated_at = datetime('now') WHERE id = ${id}`);
  logger.info("db", `update_contact id=${id}`);
}

export function delete_contact(id: string): void {
  delete_contact_fts(id);
  getDb().delete(contacts).where(eq(contacts.id, id)).run();
  logger.info("db", `delete_contact id=${id}`);
}