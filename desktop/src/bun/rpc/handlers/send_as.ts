import { make_email_alias_id } from "../../utils/crypto";
import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_send_as_aliases, replace_all_send_as_aliases, update_send_as_alias_signature } from "../../db/send_as";
import { upsert_signature_template_by_body } from "../../db/signature_templates";
import { get_pref, set_pref } from "../../db/preferences";
import { withGmailAuth } from "../../providers/gmail/auth";
import { fetch_send_as_list, update_send_as } from "../../providers/gmail/api";
import type { SendAsAlias } from "../../providers/gmail/api";

function to_wire(row: SendAsAliasRow): SendAsAliasWire {
  return {
    id: row.id,
    account_id: row.account_id,
    send_as_email: row.send_as_email,
    display_name: row.display_name,
    reply_to_address: row.reply_to_address,
    signature: row.signature,
    is_primary: row.is_primary === 1,
    is_default: row.is_default === 1,
    treat_as_alias: row.treat_as_alias === 1,
    verification_status: row.verification_status,
  };
}

export default {
  [messages.send_as_list]: async (params: AccountScope) => {
    const rows = list_send_as_aliases(params.account_id);
    logger.file("sendAs").info(`list: ${JSON.stringify(rows.map(r => ({ email: r.send_as_email, signature: r.signature })))}`);
    return rows.map(to_wire);
  },

  [messages.send_as_sync]: async (params: AccountScope) => {
    const aliases = await withGmailAuth(params.account_id, async (token) => {
      return fetch_send_as_list(token);
    });

    const oldAliases = list_send_as_aliases(params.account_id);
    const oldAssignments = get_pref("signature:assignments") as Record<string, string | null> | null;
    const oldIdToEmail = new Map(oldAliases.map((a) => [a.id, a.send_as_email]));

    const dbAliases = aliases.filter((a: SendAsAlias) => {
      if (!a.send_as_email) {
        logger.warn("sendAs", `skipping alias with missing send_as_email for account ${params.account_id}`);
        return false;
      }
      return true;
    }).map((a: SendAsAlias) => ({
      id: make_email_alias_id(a.send_as_email!),
      account_id: params.account_id,
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
    }));

    replace_all_send_as_aliases(params.account_id, dbAliases);
    logger.info("sendAs", `synced ${dbAliases.length} aliases for account ${params.account_id}`);

    if (oldAssignments) {
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
      logger.info("sendAs", `migrated ${migrated} signature assignments (${orphaned} orphaned old UUID keys dropped)`);
      set_pref("signature:assignments", newAssignments);
    }

    const imported: string[] = [];
    for (const a of aliases) {
      if (a.signature) {
        const tpl = upsert_signature_template_by_body(
          params.account_id,
          a.signature,
          `Default (${a.send_as_email})`,
        );
        if (tpl.body === a.signature) imported.push(a.send_as_email);
      }
    }
    if (imported.length) {
      logger.info("sendAs", `imported ${imported.length} Gmail signatures as templates: ${imported.join(", ")}`);
    }

    return list_send_as_aliases(params.account_id).map(to_wire);
  },

  [messages.send_as_update]: async (params: { alias_id: string; send_as_email: string; account_id: string; signature: string | null }) => {
    update_send_as_alias_signature(params.alias_id, params.signature);

    try {
      await withGmailAuth(params.account_id, async (token) => {
        await update_send_as(token, params.send_as_email, { signature: params.signature ?? undefined });
      });
    } catch (err) {
      logger.warn("sendAs", `failed to push signature to Gmail: ${err}`);
    }

    return { success: true };
  },
};
