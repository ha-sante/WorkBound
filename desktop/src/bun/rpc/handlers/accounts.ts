import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_accounts, get_account, get_account_by_email, insert_account, update_account, delete_all_accounts } from "../../db/accounts";
import { delete_tokens } from "../../utils/token_store";
import { stop_latest_emails_polling, cancel_past_sync } from "../../sync/engine";

export default {
  [messages.account_list]: async () => {
    const list = list_accounts();
    logger.info("rpc", `account:list count=${list.length}`);
    return list;
  },
  [messages.account_get]: async (params: EntityId) => {
    return get_account(params.id) ?? null;
  },
  [messages.account_get_by_email]: async (params: { email: string }) => {
    return get_account_by_email(params.email) ?? null;
  },
  [messages.account_add]: async (params: { provider: string; email: string; name?: string }) => {
    const id = crypto.randomUUID();
    logger.info("rpc", `account:add provider=${params.provider} email=${params.email}`);
    insert_account({
      id,
      provider: params.provider,
      email: params.email,
      name: params.name ?? null,
      is_active: 1,
      created_at: new Date().toISOString(),
    });
    return { id };
  },
  [messages.account_logout]: async () => {
    logger.info("rpc", `account:logout`);
    const all = list_accounts();
    for (const acc of all) {
      stop_latest_emails_polling(acc.id);
      cancel_past_sync(acc.id);
      await delete_tokens(acc.id);
      update_account(acc.id, { is_active: 0, has_credentials: 0 });
    }
    return { success: true };
  },
  [messages.account_delete_all]: async () => {
    logger.info("rpc", `account:deleteAll`);
    const all = list_accounts();
    for (const acc of all) {
      stop_latest_emails_polling(acc.id);
      cancel_past_sync(acc.id);
      await delete_tokens(acc.id);
    }
    delete_all_accounts();
    return { success: true };
  },
};
