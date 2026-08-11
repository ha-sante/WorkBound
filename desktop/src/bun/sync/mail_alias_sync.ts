import { list_accounts } from "../db/accounts";
import { list_send_as_aliases, replace_all_send_as_aliases } from "../db/send_as";
import { get_pref, set_pref } from "../db/preferences";
import { withGmailAuth } from "../providers/gmail/auth";
import { fetch_send_as_list, type SendAsAlias } from "../providers/gmail/api";
import { logger } from "../utils/logger";
import { get_config } from "../utils/config";
import { error_message } from "../../shared/errors";
import { make_email_alias_id } from "../utils/crypto";

export const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const get_sync_interval_ms = (): number => parseInt(get_config("GMAIL_ALIAS_POLL_INTERVAL"), 10) || DEFAULT_SYNC_INTERVAL_MS;

let interval_id: ReturnType<typeof setInterval> | null = null;

function map_alias_to_db(account_id: string, a: SendAsAlias) {
  if (!a.send_as_email) {
    logger.debug("sendAs", `skipping alias with missing send_as_email for account ${account_id}`);
    return [];
  }
  return [{
    id: make_email_alias_id(a.send_as_email),
    account_id,
    send_as_email: a.send_as_email,
    display_name: a.display_name ?? null,
    reply_to_address: a.reply_to_address ?? null,
    signature: a.signature ?? null,
    is_primary: a.is_primary ? 1 : 0,
    is_default: a.is_default ? 1 : 0,
    treat_as_alias: a.treat_as_alias ? 1 : 0,
    smtp_msa_host: null,
    smtp_msa_port: null,
    smtp_msa_security_mode: null,
    verification_status: a.verification_status ?? null,
    created_at: new Date().toISOString(),
  }];
}

export async function sync_single_account_send_as(account_id: string): Promise<void> {
  const oldAliases = list_send_as_aliases(account_id);
  const oldAssignments = get_pref("signature:assignments") as Record<string, string | null> | null;

  const aliases = await withGmailAuth(account_id, async (token) => {
    return fetch_send_as_list(token);
  });
  const dbAliases = aliases.flatMap((a) => map_alias_to_db(account_id, a));
  replace_all_send_as_aliases(account_id, dbAliases);

  if (oldAssignments) {
    const oldIdToEmail = new Map(oldAliases.map((a) => [a.id, a.send_as_email]));
    const newIdToEmail = new Map(aliases.filter((a) => a.send_as_email).map((a) => [make_email_alias_id(a.send_as_email!), a.send_as_email]));
    const newAssignments: Record<string, string | null> = {};
    let migrated = 0;
    let orphaned = 0;
    for (const [oldAliasId, templateId] of Object.entries(oldAssignments)) {
      const email = oldIdToEmail.get(oldAliasId) ?? newIdToEmail.get(oldAliasId);
      if (email) {
        newAssignments[make_email_alias_id(email)] = templateId;
        migrated++;
      } else {
        orphaned++;
      }
    }
    if (migrated > 0 || orphaned > 0) {
      set_pref("signature:assignments", newAssignments);
      logger.info("sendAs", `migrated ${migrated} assignments, orphaned ${orphaned} for account ${account_id}`);
    }
  }

  logger.info("sendAs", `synced ${dbAliases.length} aliases for account ${account_id}`);
}

async function sync_all_accounts_send_as() {
  const accounts = list_accounts();
  for (const account of accounts) {
    if (!account.has_credentials) {
      logger.warn("sendAs", `skipping account ${account.id}: no stored credentials`);
      continue;
    }
    try {
      await sync_single_account_send_as(account.id);
    } catch (err) {
      logger.warn("sendAs", `sync failed for account ${account.id}: ${error_message(err)}`);
    }
  }
}

export function start_send_as_sync() {
  if (interval_id) return;
  logger.info("sendAs", `starting periodic sync (interval=${get_sync_interval_ms()}ms)`);
  sync_all_accounts_send_as().catch((e) => logger.warn("sendAs", `initial alias sync failed: ${error_message(e)}`));
  interval_id = setInterval(sync_all_accounts_send_as, get_sync_interval_ms());
}

export function stop_send_as_sync() {
  if (interval_id) {
    clearInterval(interval_id);
    interval_id = null;
    logger.info("sendAs", "periodic sync stopped");
  }
}

export { get_sync_interval_ms };
