import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_email_templates, create_email_template, update_email_template, delete_email_template } from "../../db/email_templates";

function to_wire(row: { id: string; account_id: string; name: string; subject: string; body: string; created_at: string | null; updated_at: string | null }) {
  return { id: row.id, account_id: row.account_id, name: row.name, subject: row.subject, body: row.body };
}

export default {
  [messages.templates_list]: async (params: AccountScope) => {
    logger.info("rpc", `templates:list account_id=${params.account_id}`);
    return list_email_templates(params.account_id).map(to_wire);
  },

  [messages.templates_create]: async (params: { account_id: string; name: string; subject?: string; body?: string }) => {
    logger.info("rpc", `templates:create name=${params.name}`);
    const row = create_email_template(params);
    return to_wire(row);
  },

  [messages.templates_update]: async (params: { id: string; name?: string; subject?: string; body?: string }) => {
    logger.info("rpc", `templates:update id=${params.id}`);
    update_email_template(params.id, { name: params.name, subject: params.subject, body: params.body });
    return { success: true };
  },

  [messages.templates_delete]: async (params: EntityId) => {
    logger.info("rpc", `templates:delete id=${params.id}`);
    delete_email_template(params.id);
    return { success: true };
  },
};
