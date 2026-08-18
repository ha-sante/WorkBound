import { useCallback, useMemo } from "react";
import { Send, X, Pencil } from "lucide-react";
import { useSetAtom } from "jotai";
import { currentMailViewAtom, currentScheduledViewAtom, currentThreadViewAtom } from "../state";
import { useOutboxItems } from "./use_outbox_items";
import { useScheduledActions } from "./use_scheduled_actions";
import { use_compose_editor } from "./use_compose_editor";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";
import { is_scheduled_send } from "../utils/scheduled_send";
import { build_scheduled_rows } from "../utils/mail_display_utils";

export function use_scheduled_list() {
  const { items } = useOutboxItems({ status: ["queued", "sending", "failed"] });
  const { cancel, sendNow, edit } = useScheduledActions();
  const { close } = use_compose_editor();
  const setCurrentView = useSetAtom(currentMailViewAtom);
  const setCurrentScheduledView = useSetAtom(currentScheduledViewAtom);
  const setCurrentThreadView = useSetAtom(currentThreadViewAtom);

  const scheduled_items = useMemo(() => items.filter(is_scheduled_send), [items]);
  const rows = useMemo(() => build_scheduled_rows(scheduled_items), [scheduled_items]);

  const open = useCallback(
    (row: MailListRow) => {
      if (!("kind" in row) || row.kind !== "scheduled") return;
      const item = row.item;
      if (!item) return;
      setCurrentView(null);
      setCurrentScheduledView(null);
      close();
      if (item.thread_id) {
        rpc.request(messages.thread_previews, { thread_id: item.thread_id })
          .then((previews: EmailPreviewWire[]) => {
            const threadEmails = previews.map((p) => ({ email: p, fullEmail: null }));
            setCurrentThreadView({
              thread_id: item.thread_id!,
              emails: threadEmails,
              activeIndex: -1,
              scheduled_item_id: item.id,
            });
          })
          .catch(() => setCurrentScheduledView({ item }));
      } else {
        setCurrentScheduledView({ item });
      }
    },
    [setCurrentView, close, setCurrentScheduledView, setCurrentThreadView],
  );

  const actions_for = useCallback(
    (row: MailListRow) => {
      if (!("kind" in row) || row.kind !== "scheduled" || !row.item) return null;
      const item = row.item;
      return (
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {row.status === "failed" && (
            <span className="shrink-0 text-[10px] font-medium text-rose-500 px-1.5 py-0.5 rounded bg-rose-500/10">
              Failed
            </span>
          )}
          <button
            onClick={(event) => { event.stopPropagation(); sendNow(item); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors cursor-pointer"
            title="Send now"
            aria-label="Send now">
            <Send size={15} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); edit(item); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors cursor-pointer"
            title="Edit scheduled email"
            aria-label="Edit scheduled email">
            <Pencil size={15} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); cancel(item); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors cursor-pointer"
            title="Cancel scheduled email"
            aria-label="Cancel scheduled email">
            <X size={15} />
          </button>
        </div>
      );
    },
    [cancel, sendNow, edit],
  );

  return { rows, count: scheduled_items.length, open, actions_for };
}
