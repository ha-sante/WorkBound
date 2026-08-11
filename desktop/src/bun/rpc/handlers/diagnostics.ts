import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { getDb, get_db_path, get_db_size } from "../../db/client";
import { list_accounts, get_backfill_state, get_newfill_state } from "../../db/accounts";
import { sql } from "drizzle-orm";

export default {
  [messages.db_stats]: async () => {
    const db = getDb();
    const emailCount = (db.get(sql`SELECT COUNT(*) AS c FROM emails`) as { c: number }).c;
    const threadCount = (db.get(sql`SELECT COUNT(*) AS c FROM threads`) as { c: number }).c;
    const attachmentCount = (db.get(sql`SELECT COUNT(*) AS c FROM attachments`) as { c: number }).c;
    const accountCount = (db.get(sql`SELECT COUNT(*) AS c FROM accounts`) as { c: number }).c;
    logger.info("rpc", `db:stats emails=${emailCount} threads=${threadCount} attachments=${attachmentCount} accounts=${accountCount}`);
    return { emailCount, threadCount, attachmentCount, accountCount };
  },

  "diag:snapshot": async () => {
    const db = getDb();
    const emailCount = (db.get(sql`SELECT COUNT(*) AS c FROM emails`) as { c: number }).c;
    const threadCount = (db.get(sql`SELECT COUNT(*) AS c FROM threads`) as { c: number }).c;
    const attachmentCount = (db.get(sql`SELECT COUNT(*) AS c FROM attachments`) as { c: number }).c;
    const accountCount = (db.get(sql`SELECT COUNT(*) AS c FROM accounts`) as { c: number }).c;

    const accounts = list_accounts().map((acc) => {
      const backfill = get_backfill_state(acc.id);
      const newfill = get_newfill_state(acc.id);
      return {
        id: acc.id,
        provider: acc.provider,
        email: acc.email,
        name: acc.name,
        created_at: acc.created_at,
        is_active: acc.is_active,
        backfill_state: backfill
          ? {
            backfill_done: backfill.backfill_done,
            backfill_status: backfill.backfill_status,
            backfill_next_page_token: backfill.backfill_next_page_token,
            backfill_oldest_synced_at: backfill.backfill_oldest_synced_at,
            backfill_initial_total_messages: backfill.backfill_initial_total_messages,
          }
          : null,
        newfill_state: newfill
          ? {
            newfill_current_history_id: newfill.newfill_current_history_id,
            newfill_last_synced_at: newfill.newfill_last_synced_at,
            newfill_status: newfill.newfill_status,
          }
          : null,
      };
    });

    return {
      database: {
        path: get_db_path(),
        size: get_db_size(),
        emailCount,
        threadCount,
        attachmentCount,
        accountCount,
      },
      accounts,
      environment: {
        platform: process.platform,
        arch: process.arch,
        bun: Bun.version,
      },
    };
  },
};
