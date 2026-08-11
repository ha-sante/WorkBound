import type { Database } from "bun:sqlite";
import { prefill_contacts_from_emails } from "./contact_prefill";

function ensure_column(db: Database, table: string, columnDef: string) {
  const tableExists = db
    .query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  if (!tableExists) return;
  const colName = columnDef.split(" ")[0];
  const existing = db
    .query(
      `SELECT COUNT(*) as c FROM pragma_table_info('${table}') WHERE name = '${colName}'`,
    )
    .get() as { c: number } | undefined;
  if (!existing?.c) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

function onetime_migrations(db: Database) {
  ensure_column(
    db,
    "contacts",
    "account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE",
  );
  ensure_column(
    db,
    "threads",
    "account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE",
  );
  ensure_column(db, "contacts", "emails_received INTEGER NOT NULL DEFAULT 0");
  ensure_column(db, "contacts", "emails_sent INTEGER NOT NULL DEFAULT 0");
  ensure_column(db, "outbox", "to_addr TEXT");
  ensure_column(db, "outbox", "subject TEXT");
  ensure_column(db, "outbox", "thread_id TEXT");
  ensure_column(db, "labels", "icon_name TEXT");

  // Backfill state extensions
  ensure_column(db, "backfill_state", "attachments_marker_backfill_done INTEGER DEFAULT 0");
  ensure_column(db, "backfill_state", "attachments_marker_next_page_token TEXT");
  ensure_column(db, "backfill_state", "attachments_marker_backfill_status TEXT DEFAULT 'idle'");
  ensure_column(db, "backfill_state", "backfill_fetched_total INTEGER DEFAULT 0");

  ensure_column(db, "contacts", "photo_fetched_at TEXT");
}

function migrate_email_headers(db: Database): boolean {
  const cols = db
    .query(`SELECT name FROM pragma_table_info('emails')`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "headers")) return false;

  db.exec(`
    INSERT INTO email_headers (email_id, headers)
    SELECT id, headers FROM emails
    WHERE headers IS NOT NULL AND length(headers) > 0
    ON CONFLICT(email_id) DO NOTHING
  `);

  const moved = db.query(`SELECT count(*) AS c FROM email_headers`).get() as
    { c: number } | undefined;
  if ((moved?.c ?? 0) > 0) {
    db.exec(`ALTER TABLE emails DROP COLUMN headers`);
    return true;
  }
  return false;
}

export function run_setup(db: Database) {
  onetime_migrations(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      has_credentials INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      subject TEXT,
      latest_received_at TEXT,
      message_count INTEGER DEFAULT 1,
      snippet TEXT
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      thread_id TEXT,
      message_id TEXT,
      subject TEXT,
      from_name TEXT,
      from_address TEXT,
      "to" TEXT,
      cc TEXT,
      bcc TEXT,
      reply_to TEXT,
      reply_to_address TEXT,
      labels TEXT,
      classification_labels TEXT,
      history_id TEXT,
      size_estimate INTEGER,
      internal_date TEXT,
      cid_refs_fetched INTEGER DEFAULT 0,
      body_text TEXT,
      body_html TEXT,
      mail_cached_at TEXT,
      image_dimensions TEXT,
      images_measured INTEGER DEFAULT 0,
      snippet TEXT,
      folder TEXT NOT NULL DEFAULT 'inbox',
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0,
      is_phishing INTEGER DEFAULT 0,
      received_at TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT,
      original_email_id TEXT,
      draft_mode TEXT,
      gmail_draft_id TEXT,
      local_draft_id TEXT,
      quote_text TEXT,
      draft_version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (thread_id) REFERENCES threads(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_headers (
      email_id TEXT PRIMARY KEY,
      headers TEXT NOT NULL,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      disposition TEXT,
      part_id TEXT,
      headers TEXT,
      local_path TEXT,
      cache_path TEXT,
      remote_url TEXT,
      cid TEXT,
      data TEXT,
      is_downloaded INTEGER DEFAULT 0,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_has_attachments (
      email_id TEXT PRIMARY KEY,
      created_at TEXT,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backfill_state (
      account_id TEXT PRIMARY KEY,
      backfill_done INTEGER DEFAULT 0,
      backfill_next_page_token TEXT,
      backfill_oldest_synced_at TEXT,
      backfill_status TEXT DEFAULT 'idle',
      backfill_initial_total_messages INTEGER,
      backfill_fetched_total INTEGER DEFAULT 0,

      attachments_marker_backfill_done INTEGER DEFAULT 0,
      attachments_marker_next_page_token TEXT,
      attachments_marker_backfill_status TEXT DEFAULT 'idle',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS newfill_state (
      account_id TEXT PRIMARY KEY,
      newfill_current_history_id TEXT,
      newfill_last_synced_at TEXT,
      newfill_status TEXT DEFAULT 'idle',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      command TEXT NOT NULL DEFAULT 'send_email',
      payload TEXT,
      extras TEXT,
      to_addr TEXT,
      subject TEXT,
      body_html TEXT,
      body_text TEXT,
      quote_text TEXT,
      attachments TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      scheduled_at INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON outbox(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_emails_account_folder_received
      ON emails(account_id, folder, received_at);

    CREATE INDEX IF NOT EXISTS idx_emails_account_received
      ON emails(account_id, received_at);

    CREATE INDEX IF NOT EXISTS idx_emails_account_received_id
      ON emails(account_id, received_at, id);

    CREATE INDEX IF NOT EXISTS idx_emails_mail_cached_at
      ON emails(mail_cached_at);

    CREATE INDEX IF NOT EXISTS idx_emails_cache_eviction
      ON emails(received_at, mail_cached_at);

    CREATE INDEX IF NOT EXISTS idx_emails_thread_id_received
      ON emails(thread_id, received_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS email_meta_fts USING fts5(
      email_id UNINDEXED,
      subject,
      from_name,
      from_address,
      to_addr,
      cc,
      bcc
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS email_body_fts USING fts5(
      email_id UNINDEXED,
      body_text,
      body_html_stripped
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS send_as_aliases (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      send_as_email TEXT NOT NULL,
      display_name TEXT,
      reply_to_address TEXT,
      signature TEXT,
      is_primary INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      treat_as_alias INTEGER DEFAULT 0,
      smtp_msa_host TEXT,
      smtp_msa_port INTEGER,
      smtp_msa_security_mode TEXT,
      verification_status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signature_templates (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT,
      email TEXT NOT NULL,
      last_contacted_at TEXT,
      times_contacted INTEGER DEFAULT 1,
      emails_received INTEGER NOT NULL DEFAULT 0,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      photo_fetched_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_id, email)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      name, email, content=contacts, content_rowid=rowid
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      email_id TEXT,
      account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS filtered_views (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon_name TEXT,
      clauses TEXT NOT NULL DEFAULT '[]',
      folder TEXT NOT NULL DEFAULT 'inbox',
      visible INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_filtered_views_account_position
      ON filtered_views(account_id, position);

    CREATE TABLE IF NOT EXISTS app_preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_config_overrides (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon_name TEXT,
      type TEXT DEFAULT 'user',
      UNIQUE(account_id, name)
    );

    CREATE TABLE IF NOT EXISTS auto_label_jobs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      rule_version INTEGER NOT NULL,
      scope TEXT NOT NULL,
      scope_limit INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      scanned INTEGER NOT NULL DEFAULT 0,
      matches INTEGER NOT NULL DEFAULT 0,
      applied INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_auto_label_jobs_status_created
      ON auto_label_jobs(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_auto_label_jobs_account_created
      ON auto_label_jobs(account_id, created_at);

    CREATE TABLE IF NOT EXISTS auto_label_assignments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      rule_version INTEGER NOT NULL,
      label_ids TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(email_id, rule_id, rule_version)
    );

    CREATE INDEX IF NOT EXISTS idx_auto_label_assignments_account
      ON auto_label_assignments(account_id);

    CREATE INDEX IF NOT EXISTS idx_auto_label_assignments_email
      ON auto_label_assignments(email_id);

    CREATE TABLE IF NOT EXISTS images (
      url TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      mime TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensure_column(db, "accounts", "has_credentials INTEGER NOT NULL DEFAULT 0");

  if (migrate_email_headers(db)) {
    console.log("db: migrated emails.headers -> email_headers table");
  }

  prefill_contacts_from_emails(db);
}
