import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import {
  list_filtered_views,
  save_filtered_view,
  delete_filtered_view,
  replace_filtered_views,
} from "../../db/filtered_views";

export default {
  [messages.filtered_views_list]: async (params: AccountScope) => {
    logger.info("rpc", `filtered_views:list account_id=${params.account_id}`);
    return list_filtered_views(params.account_id);
  },

  [messages.filtered_views_save]: async (params: { account_id: string; view: FilteredViewWire }) => {
    logger.info("rpc", `filtered_views:save id=${params.view.id}`);
    return save_filtered_view(params.account_id, params.view);
  },

  [messages.filtered_views_delete]: async (params: EntityId) => {
    logger.info("rpc", `filtered_views:delete id=${params.id}`);
    delete_filtered_view(params.id);
    return { success: true };
  },

  [messages.filtered_views_replace]: async (params: { account_id: string; views: FilteredViewWire[] }) => {
    logger.info("rpc", `filtered_views:replace account_id=${params.account_id} count=${params.views.length}`);
    replace_filtered_views(params.account_id, params.views);
    return { success: true };
  },
};
