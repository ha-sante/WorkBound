import { useCallback, useEffect, useState } from "react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

export function use_reminders(account_id: string | undefined) {
  const [items, set_items] = useState<ReminderWire[]>([]);
  const [now, set_now] = useState(() => Date.now());

  const refresh = useCallback(() => {
    if (!account_id) return;
    rpc.request(messages.reminders_list, { account_id })
      .then((data) => set_items(data as ReminderWire[]))
      .catch(() => {});
  }, [account_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handle_changed = () => refresh();
    rpc.addMessageListener(messages.reminders_changed, handle_changed);
    return () => rpc.removeMessageListener(messages.reminders_changed, handle_changed);
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => set_now(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const due_count = items.filter((item) => item.remind_at <= now).length;

  return { items, refresh, due_count };
}
