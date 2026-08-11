import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_emails, list_all_emails, list_emails_page, list_emails_page_after, count_emails, list_emails_up, list_emails_down, get_email, update_email, delete_email } from "../../db/emails";
import { search_emails_local } from "../../db/search";
import { get_account, upsert_newfill_state } from "../../db/accounts";
import { get_adapter } from "../../providers/index";
import { get_attachments_by_email, upsert_attachment_metadatas } from "../../db/attachments";
import { email_has_attachments_exists } from "../../db/email_has_attachments";
import { withGmailAuth } from "../../providers/gmail/auth";
import { fetch_email_by_id, parse_message_full, resolve_inline_cids, resolve_external_image_urls } from "../../providers/gmail/api";
import { get_config } from "../../utils/config";
import { get_downloads_dir } from "../../utils/platform";
import { Tel } from "../../utils/tel";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const tel = new Tel("mail_rpc");

function apply_proxy_to_body_html(body_html: string | null | undefined): string | null {
  if (!body_html) return body_html ?? null;
  const proxy_base = get_config("WORKBOUND_PROXY_BASE_URL");
  const proxy_key = get_config("WORKBOUND_PROXY_API_KEY");
  if (!proxy_base || !proxy_key) return body_html;
  return resolve_external_image_urls(body_html, proxy_base, proxy_key);
}

export default {
  [messages.mail_list]: async (params: { account_id: string; folder: string }) => {
    const rows = list_emails(params);
    const err = new Error();
    const stackLine = (err.stack?.split("\n")[2] || "").trim();
    logger.info("rpc", `mail:list folder=${params.folder} count=${rows.length} caller=${stackLine}`);
    return rows;
  },
  [messages.mail_list_all]: async (params: AccountScope) => {
    const rows = list_all_emails(params.account_id);
    logger.info("rpc", `mail:listAll count=${rows.length}`);
    return rows;
  },
  [messages.mail_list_page]: async (params: { account_id: string; limit: number; offset?: number; before?: { received_at: string; id: string } }) => {
    if (params.before) {
      const emails = list_emails_page_after(params.account_id, params.limit, params.before.received_at, params.before.id);
      const total = count_emails(params.account_id);
      return { emails, total };
    }
    return list_emails_page(params.account_id, params.limit, params.offset ?? 0);
  },
  [messages.mail_count]: async (params: AccountScope) => {
    const total = count_emails(params.account_id);
    return { total };
  },
  [messages.mail_list_up]: async (params: { account_id: string; since: string }) => {
    const rows = list_emails_up(params.account_id, params.since);
    logger.info("rpc", `mail:listUp account_id=${params.account_id} since=${params.since} count=${rows.length}`);
    return rows;
  },
  [messages.mail_list_down]: async (params: { account_id: string; before: string }) => {
    const rows = list_emails_down(params.account_id, params.before);
    logger.info("rpc", `mail:listDown account_id=${params.account_id} before=${params.before} count=${rows.length}`);
    return rows;
  },
  [messages.mail_fetch_first_page]: async (params: { account_id: string; maxResults?: number }) => {
    logger.info("rpc", `mail:fetchFirstPage account_id=${params.account_id} maxResults=${params.maxResults ?? 50}`);
    const account = get_account(params.account_id);
    if (!account) throw new Error(`Account not found: ${params.account_id}`);

    const adapter = get_adapter(account.provider);
    await adapter.connect(account);

    const result = await adapter.fetchPastEmails(undefined, params.maxResults ?? 50);

    if (result.lastHistoryId) {
      upsert_newfill_state({
        account_id: params.account_id,
        newfill_current_history_id: result.lastHistoryId,
        newfill_status: "done",
      });
    }

    return list_all_emails(params.account_id);
  },
  [messages.mail_get]: async (params: EntityId) => {
    const t = tel.start("mail_get", params.id);
    try {
      const row = get_email(params.id);
      t.mark("query_db");
      if (!row) {
        logger.info("rpc", `mail:get id=${params.id} not found`);
        return { email: null, attachments: [] };
      }
      logger.file("rpc").info(`mail:get id=${params.id} acc=${row.account_id} txt=${!!row.body_text} html=${!!row.body_html}`);
      const cached_attachments = get_attachments_by_email(row.id);
      t.mark("attachments");

      const body_cached = !!(row.body_text || row.body_html);
      const marker_exists = email_has_attachments_exists(row.id);
      const attachments_cached = cached_attachments.length > 0;
      const offline_complete = body_cached && marker_exists && attachments_cached;

      if (offline_complete) {
        logger.info("rpc", `mail:get id=${params.id} offline-complete: serving from cache`);
        const finalRow = { ...row, body_html: apply_proxy_to_body_html(row.body_html) };
        return { email: finalRow, attachments: cached_attachments };
      }

      // live call fetch
      logger.info("rpc", `mail:get id=${params.id} not offline-complete: fetching full`);
      try {
        const result = await withGmailAuth(row.account_id, async (token) => {
          const msg = await fetch_email_by_id(token, row.id, "full");
          t.mark("gmail_fetch");
          const parsed = parse_message_full(msg, row.account_id);
          t.mark("parse");
          const resolved_html = await resolve_inline_cids(
            token, msg.id, parsed.email.body_html ?? null, parsed.attachments,
          );
          t.mark("cid_resolve");
          return {
            body_text: parsed.email.body_text ?? null,
            body_html: resolved_html ?? parsed.email.body_html ?? null,
            attachments: parsed.attachments,
          };
        });
        const served = { ...row, body_text: result.body_text, body_html: apply_proxy_to_body_html(result.body_html) };
        const attachments = result.attachments.length > 0
          ? (upsert_attachment_metadatas(result.attachments), get_attachments_by_email(row.id))
          : result.attachments;
        return { email: served, attachments };
      } catch (e) {
        logger.error("rpc", `mail:get lazy full fetch failed for ${params.id}:`, e);
        return { email: row, attachments: cached_attachments };
      }
    } finally {
      t.done();
    }
  },
  [messages.mail_get_attachments]: async (params: EmailId) => {
    const rows = get_attachments_by_email(params.email_id);
    logger.info("rpc", `mail:get_attachments email_id=${params.email_id} count=${rows.length}`);
    return rows;
  },

  [messages.mail_download_eml]: async (params: EntityId) => {
    const row = get_email(params.id);
    if (!row) throw new Error(`Email not found: ${params.id}`);

    const eml = await withGmailAuth(row.account_id, async (token) => {
      const msg = await fetch_email_by_id(token, row.id, "raw");
      return Buffer.from(msg.raw, "base64url").toString("utf-8");
    });

    const downloadsDir = get_downloads_dir();
    mkdirSync(downloadsDir, { recursive: true });

    const sanitized = (row.subject || "email").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200);
    const filename = `${sanitized}.eml`;
    let destPath = join(downloadsDir, filename);
    if (existsSync(destPath)) {
      const dotIdx = filename.lastIndexOf(".");
      const name = dotIdx === -1 ? filename : filename.slice(0, dotIdx);
      const ext = dotIdx === -1 ? "" : filename.slice(dotIdx);
      let counter = 2;
      while (existsSync(destPath)) {
        destPath = join(downloadsDir, `${name} (${counter})${ext}`);
        counter++;
      }
    }

    writeFileSync(destPath, eml, "utf-8");
    logger.info("rpc", `mail:downloadEml id=${params.id} saved to ${destPath}`);
    return { savedTo: destPath };
  },
  [messages.mail_update]: async (params: { id: string; data: Parameters<typeof update_email>[1] }) => {
    logger.info("rpc", `mail:update id=${params.id}`);
    update_email(params.id, params.data);
    return { success: true };
  },
  [messages.mail_delete]: async (params: EntityId) => {
    logger.info("rpc", `mail:delete id=${params.id}`);
    delete_email(params.id);
    return { success: true };
  },
  [messages.mail_search]: async (params: { query: string; limit?: number; account_id?: string }) => {
    const rows = search_emails_local(params.query, params.limit, params.account_id);
    logger.info("rpc", `mail:search query="${params.query}" count=${rows.length}`);
    return rows;
  },
  [messages.mail_search_local]: async (params: { query: string; limit?: number; account_id?: string; folder?: string }) => {
    const rows = search_emails_local(params.query, params.limit, params.account_id, params.folder);
    logger.info("rpc", `mail:search_local query="${params.query}" folder=${params.folder ?? "all"} count=${rows.length}`);
    return rows;
  },
};
