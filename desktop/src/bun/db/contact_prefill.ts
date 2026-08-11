import type { Database } from "bun:sqlite";

function split_addrs(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/<([^>]+)>/);
    out.push((m ? m[1] : t).trim().toLowerCase());
  }
  return out;
}

export function prefill_contacts_from_emails(db: Database) {
  const accounts = db.query("SELECT id, email FROM accounts").all() as { id: string; email: string }[];
  for (const acct of accounts) {
    const sentCounts = new Map<string, number>();
    const recvCounts = new Map<string, [number, string | null]>();

    const allEmails = db.query(`
      SELECT from_address, from_name, "to", cc, bcc FROM emails
      WHERE account_id = ? AND from_address IS NOT NULL AND from_address != ''
    `).all(acct.id) as { from_address: string; from_name: string | null; to: string | null; cc: string | null; bcc: string | null }[];

    for (const email of allEmails) {
      const fromAddr = email.from_address.toLowerCase();
      if (fromAddr !== acct.email.toLowerCase()) {
        const entry = recvCounts.get(fromAddr) ?? [0, email.from_name];
        entry[0]++;
        if (email.from_name && !entry[1]) entry[1] = email.from_name;
        recvCounts.set(fromAddr, entry);
      } else {
        for (const addr of split_addrs(email.to)) {
          if (addr !== acct.email.toLowerCase()) sentCounts.set(addr, (sentCounts.get(addr) ?? 0) + 1);
        }
        for (const addr of split_addrs(email.cc)) {
          if (addr !== acct.email.toLowerCase()) sentCounts.set(addr, (sentCounts.get(addr) ?? 0) + 1);
        }
        for (const addr of split_addrs(email.bcc)) {
          if (addr !== acct.email.toLowerCase()) sentCounts.set(addr, (sentCounts.get(addr) ?? 0) + 1);
        }
      }
    }

    const allAddrs = new Set([...recvCounts.keys(), ...sentCounts.keys()]);
    for (const addr of allAddrs) {
      const [recv, name] = recvCounts.get(addr) ?? [0, null];
      const sent = sentCounts.get(addr) ?? 0;
      const total = recv + sent;
      const id = crypto.randomUUID() as string;
      const result = db.run(`
        INSERT OR IGNORE INTO contacts (id, account_id, name, email, times_contacted, emails_received, emails_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, acct.id, name, addr, total, recv, sent]);
      if (result.changes) {
        try {
          const rid = (db.query("SELECT last_insert_rowid() as rid").get() as { rid: number }).rid;
          db.run(`INSERT INTO contacts_fts (rowid, name, email) VALUES (?, ?, ?)`, [rid, name, addr]);
        } catch {}
      }
    }
  }
}