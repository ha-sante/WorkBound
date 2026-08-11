import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_notes, get_note_by_email, create_note, update_note, delete_note } from "../../db/notes";

export default {
  [messages.notes_list]: async (params: AccountScope) => {
    logger.info("rpc", `notes:list account_id=${params.account_id}`);
    return list_notes(params.account_id);
  },

  [messages.notes_get_by_email]: async (params: EmailId) => {
    logger.info("rpc", `notes:getByEmail email_id=${params.email_id}`);
    const row = get_note_by_email(params.email_id);
    return row ?? null;
  },

  [messages.notes_create]: async (params: { email_id?: string; account_id?: string; content: string }) => {
    logger.info("rpc", `notes:create email_id=${params.email_id ?? "(standalone)"}`);
    return create_note(params);
  },

  [messages.notes_update]: async (params: { id: string; content: string }) => {
    logger.info("rpc", `notes:update id=${params.id}`);
    update_note(params.id, params.content);
    return { success: true };
  },

  [messages.notes_delete]: async (params: EntityId) => {
    logger.info("rpc", `notes:delete id=${params.id}`);
    delete_note(params.id);
    return { success: true };
  },
};
