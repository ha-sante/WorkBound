import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { rpc_send } from "..";
import { stop_latest_emails_polling, cancel_past_sync, start_latest_emails_polling } from "../../sync/engine";
import {
  start_gmail_oauth,
  start_gmail_oauth_shared,
  prepare_gmail_oauth,
  launch_gmail_oauth,
  cancel_gmail_oauth,
  has_pending_oauth,
  reconnect_gmail_oauth,
  reconnect_gmail_oauth_shared,
} from "../../providers/gmail/auth";
import { get_config } from "../../utils/config";

function is_shared_auth(): boolean {
  return !get_config("GOOGLE_OAUTH_CLIENT_SECRET") && !!get_config("WORKBOUND_PROXY_BASE_URL");
}

export default {
  [messages.auth_prepare_gmail_oauth]: async () => {
    logger.info("rpc", "auth:prepare_gmail_oauth");
    return prepare_gmail_oauth();
  },

  [messages.auth_launch_gmail_oauth]: async (params: { skip_open?: boolean }) => {
    if (!has_pending_oauth()) throw new Error("No pending OAuth flow. Start login again.");
    logger.info("rpc", `auth:launch_gmail_oauth skip_open=${!!params.skip_open}`);
    launch_gmail_oauth(params.skip_open).then((result) => {
      logger.info("rpc", `auth:login_complete ${JSON.stringify(result)}`);
      rpc_send(messages.auth_login_complete, result);
    }).catch((e) => {
      if ((e as Error)?.message !== "OAuth cancelled") {
        logger.error("rpc", "auth:launch_gmail_oauth error", e);
      }
    });
    return { started: true };
  },

  [messages.auth_start_gmail_oauth]: async () => {
    logger.info("rpc", "auth:start_gmail_oauth");
    const flow = is_shared_auth() ? start_gmail_oauth_shared : start_gmail_oauth;
    flow().then((result) => {
      logger.info("rpc", `auth:login_complete ${JSON.stringify(result)}`);
      rpc_send(messages.auth_login_complete, result);
    }).catch((e) => {
      if ((e as Error)?.message !== "OAuth cancelled") {
        logger.error("rpc", "auth:start_gmail_oauth error", e);
      }
    });
    return { started: true };
  },

  [messages.auth_cancel_gmail_oauth]: async () => {
    logger.info("rpc", "auth:cancelGmailOAuth");
    cancel_gmail_oauth();
    return { success: true };
  },

  [messages.auth_reconnect_gmail]: async (params: AccountScope) => {
    logger.info("rpc", `auth:reconnect_gmail account_id=${params.account_id}`);
    stop_latest_emails_polling(params.account_id);
    cancel_past_sync(params.account_id);
    const flow = is_shared_auth() ? reconnect_gmail_oauth_shared : reconnect_gmail_oauth;
    flow(params.account_id).then((result) => {
      logger.info("rpc", `auth:reconnect_complete ${JSON.stringify(result)}`);
      start_latest_emails_polling(params.account_id);
      rpc_send(messages.auth_reconnect_complete, result);
    }).catch((e) => {
      logger.error("rpc", "auth:reconnect_gmail error", e);
      rpc_send(messages.auth_reconnect_complete, {
        id: params.account_id, email: "", name: "", avatar_url: "", provider: "gmail", error: String(e),
      });
    });
    return { started: true };
  },
};
