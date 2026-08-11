import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { sync_past_emails, sync_latest_emails, cancel_past_sync } from "../../sync/engine";
import { sync_all_past, start_latest_emails_polling, stop_latest_emails_polling } from "../../sync/engine";
import { get_backfill_state } from "../../db/accounts";
import { start_all_services, stop_all_services } from "../../sync/services";

export default {
  [messages.sync_past]: async (params: AccountScope) => {
    logger.info("rpc", `sync:past account_id=${params.account_id}`);
    const state = get_backfill_state(params.account_id);
    if (state?.backfill_done) {
      logger.info("rpc", `sync:past: account ${params.account_id} backfill already done, skipping`);
      return { started: false };
    }
    sync_past_emails(params.account_id).catch((e) => logger.error("rpc", "sync:past error", e));
    return { started: true };
  },
  [messages.sync_past_all]: async () => {
    logger.info("rpc", "sync:pastAll");
    sync_all_past().catch((e) => logger.error("rpc", "sync:pastAll error", e));
    return { started: true };
  },
  [messages.sync_latest]: async (params: AccountScope) => {
    logger.info("rpc", `sync:latest account_id=${params.account_id}`);
    sync_latest_emails(params.account_id).catch((e) => logger.error("rpc", "sync:latest error", e));
    return { started: true };
  },
  [messages.sync_past_cancel]: async (params: AccountScope) => {
    logger.info("rpc", `sync:past:cancel account_id=${params.account_id}`);
    cancel_past_sync(params.account_id);
    return { success: true };
  },
  [messages.sync_backfill_state]: async (params: AccountScope) => {
    const state = get_backfill_state(params.account_id);
    if (!state) return null;
    return {
      backfill_done: state.backfill_done,
      backfill_status: state.backfill_status,
      backfill_next_page_token: state.backfill_next_page_token,
      backfill_oldest_synced_at: state.backfill_oldest_synced_at,
      backfill_initial_total_messages: state.backfill_initial_total_messages,
      backfill_fetched_total: state.backfill_fetched_total,
    };
  },
  [messages.sync_polling_start]: async (params: { account_id: string; intervalMs?: number }) => {
    logger.info("rpc", `sync:polling:start account_id=${params.account_id} intervalMs=${params.intervalMs ?? "default"}`);
    start_latest_emails_polling(params.account_id, params.intervalMs);
    return { success: true };
  },
  [messages.sync_polling_stop]: async (params: AccountScope) => {
    logger.info("rpc", `sync:polling:stop account_id=${params.account_id}`);
    stop_latest_emails_polling(params.account_id);
    return { success: true };
  },

  [messages.services_start]: async () => {
    logger.info("rpc", "services:start");
    start_all_services();
    return { success: true };
  },

  [messages.services_stop]: async () => {
    logger.info("rpc", "services:stop");
    stop_all_services();
    return { success: true };
  },
};
