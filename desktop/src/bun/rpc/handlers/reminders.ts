import { messages } from "../../../shared/rpc_messages";
import { create_reminder, delete_reminder, list_reminders, update_reminder } from "../../db/reminders";
import { rpc_send } from "../index";

function notify(account_id: string) {
  rpc_send(messages.reminders_changed, { account_id });
}

export default {
  [messages.reminders_list]: async (params: AccountScope) => list_reminders(params.account_id),
  [messages.reminders_create]: async (params: { account_id: string; email_id: string; thread_id?: string | null; remind_at: number }) => {
    const reminder = create_reminder(params);
    notify(params.account_id);
    return reminder;
  },
  [messages.reminders_update]: async (params: { id: string; account_id?: string; remind_at?: number; status?: "pending" | "completed" | "dismissed" }) => {
    update_reminder(params.id, params);
    if (params.account_id) notify(params.account_id);
    return { success: true };
  },
  [messages.reminders_delete]: async (params: EntityId & { account_id?: string }) => {
    delete_reminder(params.id);
    if (params.account_id) notify(params.account_id);
    return { success: true };
  },
};
