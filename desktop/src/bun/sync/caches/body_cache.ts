import { logger } from "../../utils/logger";
import { get_config } from "../../utils/config";
import { get_account } from "../../db/accounts";
import { update_email } from "../../db/emails";
import { upsert_email_body_fts, get_email_rowid } from "../../db/fts";
import { convert } from "html-to-text";

export const get_body_cache_ms = (): number => parseInt(get_config("CACHE_RETENTION_MS"), 10) || 43200000;
export const is_body_cache_active = (): boolean => get_config("CACHE_MAIL_BODY") !== "false";

export async function cache_email_bodies(account_id: string, email_ids: string[]): Promise<void> {
  if (email_ids.length === 0 || !is_body_cache_active()) return;
  const account = get_account(account_id);
  if (!account?.has_credentials) return;

  try {
    const { fetch_bodies_batch } = await import("../../providers/gmail/api");
    const { withGmailAuth } = await import("../../providers/gmail/auth");

    const { results } = await withGmailAuth(account_id, async (token) => {
      const results = await fetch_bodies_batch(token, account_id, email_ids);
      return { results, token };
    });

    let cached = 0;
    for (const { email } of results) {
      update_email(email.id!, {
        body_text: email.body_text ?? null,
        body_html: email.body_html ?? null,
        mail_cached_at: new Date().toISOString(),
        cid_refs_fetched: 1,
      });

      const strippedHtml = email.body_html ? convert(email.body_html, { wordwrap: false }) : null;
      const rowid = get_email_rowid(email.id!);
      if (rowid) upsert_email_body_fts(rowid, email.id!, email.body_text ?? null, strippedHtml);

      cached += 1;
      await Bun.sleep(0);
    }
    logger.info("sync", `cache_email_bodies: account=${account_id} cached=${cached}/${email_ids.length}`);
  } catch (e) {
    logger.error("sync", `cache_email_bodies: failed for account ${account_id}: ${e}`);
  }
}