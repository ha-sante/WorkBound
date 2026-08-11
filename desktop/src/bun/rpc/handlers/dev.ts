import { Utils } from "electrobun/bun";
import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";

export default {
  [messages.dev_test_notification]: async (params: { title: string; body: string }) => {
    logger.info("rpc", `dev:test_notification title=${params.title} body=${params.body}`);
    Utils.showNotification({
      title: params.title,
      body: params.body,
      subtitle: "Test Notification",
      silent: false,
    });
    return { success: true };
  },
};
