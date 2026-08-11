import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { get_all_configs, set_config, delete_config, type ConfigEntry } from "../../utils/config";

export default {
  [messages.config_list]: async (): Promise<ConfigEntry[]> => {
    logger.info("rpc", "config:list");
    return get_all_configs();
  },

  [messages.config_set]: async (params: { key: string; value?: string }) => {
    logger.info("rpc", `config:set key=${params.key}`);
    if (params.value && params.value !== "") {
      await set_config(params.key, params.value);
    } else {
      await delete_config(params.key);
    }
    return { success: true };
  },
};
