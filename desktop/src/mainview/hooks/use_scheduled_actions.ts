import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { activeThreadScheduledItemAtom, currentMailViewAtom, currentScheduledViewAtom, currentThreadViewAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { use_compose_editor } from "./use_compose_editor";

export function useScheduledActions() {
  const setCurrentView = useSetAtom(currentMailViewAtom);
  const setScheduledView = useSetAtom(currentScheduledViewAtom);
  const setThreadView = useSetAtom(currentThreadViewAtom);
  const setActiveScheduledItem = useSetAtom(activeThreadScheduledItemAtom);
  const { cancel_and_open } = use_compose_editor();

  const edit = useCallback(async (item: OutboxItemWire) => {
    setThreadView(null);
    await cancel_and_open(item.id, "edit");
  }, [cancel_and_open, setThreadView]);

  const cancel = useCallback(async (item: OutboxItemWire) => {
    try {
      await rpc.request(messages.outbox_cancel, { id: item.id });
      setCurrentView(null);
      setScheduledView(null);
      setThreadView(null);
      setActiveScheduledItem(null);
    } catch {}
  }, [setActiveScheduledItem, setCurrentView, setScheduledView, setThreadView]);

  const sendNow = useCallback(async (item: OutboxItemWire) => {
    await rpc.request(messages.outbox_send_now, { id: item.id }).catch(() => {});
  }, []);

  return { edit, cancel, sendNow };
}
