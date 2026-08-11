import { useEffect, useState, useCallback } from "react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

export function useOutboxItems(filter: { thread_id?: string | null; status?: string[] } = {}) {
  const [items, setItems] = useState<OutboxItemWire[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    const params: { thread_id?: string; status?: string[] } = {};
    if (filter.thread_id) params.thread_id = filter.thread_id;
    if (filter.status && filter.status.length > 0) params.status = filter.status;
    setLoading(true);
    rpc.request(messages.outbox_list, Object.keys(params).length > 0 ? params : undefined)
      .then((data) => setItems(data as OutboxItemWire[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter.thread_id, filter.status?.join(",")]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    rpc.addMessageListener(messages.outbox_changed, handler);
    return () => rpc.removeMessageListener(messages.outbox_changed, handler);
  }, [refresh]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { items, loading, refresh, removeItem };
}
