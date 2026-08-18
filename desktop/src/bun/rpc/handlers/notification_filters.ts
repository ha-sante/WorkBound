import { messages } from "../../../shared/rpc_messages";
import { list_notification_filters, replace_notification_filters } from "../../db/notification_filters";
import { logger } from "../../utils/logger";

export default {
  [messages.notification_filters_list]: async (params: AccountScope) => {
    logger.info("rpc", `notification_filters:list account_id=${params.account_id}`);
    return list_notification_filters(params.account_id);
  },

  [messages.notification_filters_replace]: async (params: { account_id: string; filters: NotificationFilterWire[] }) => {
    logger.info("rpc", `notification_filters:replace account_id=${params.account_id} count=${params.filters.length}`);
    replace_notification_filters(params.account_id, params.filters);
    return { success: true };
  },
};
