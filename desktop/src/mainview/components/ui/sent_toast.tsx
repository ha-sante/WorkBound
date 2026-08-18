import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { sentToastAtom } from "../../state";
import { use_compose_editor } from "../../hooks/use_compose_editor";
import { Send } from "lucide-react";

function mode_label(mode: DraftMode, is_draft: boolean): string {
  if (is_draft) return "Draft";
  return mode === "new" ? "Message" : mode === "reply" ? "Reply" : mode === "reply_all" ? "Reply All" : "Forward";
}

export function SentToast() {
  const [toast, set_toast] = useAtom(sentToastAtom);
  const { cancel_and_open, restore_previous } = use_compose_editor();
  const [ticks_left, set_ticks_left] = useState(0);

  useEffect(() => {
    if (!toast || toast.status !== "sent" || toast.countdown_total <= 0) {
      set_ticks_left(0);
      return;
    }
    set_ticks_left(toast.countdown_total);
    const timer = setInterval(() => {
      set_ticks_left((t) => Math.max(0, t - 1));
    }, 100);
    const close_timer = setTimeout(() => set_toast(null), toast.countdown_total * 100);
    return () => {
      clearInterval(timer);
      clearTimeout(close_timer);
    };
  }, [toast, set_toast]);

  if (!toast) return null;

  const reopen = () => {
    if (toast.outbox_id) {
      cancel_and_open(toast.outbox_id, "undo");
    } else {
      restore_previous();
    }
    set_toast(null);
  };

  const dismiss = () => {
    set_toast(null);
  };

  const progress = toast.countdown_total > 0 ? (ticks_left / toast.countdown_total) * 100 : 100;
  const seconds = Math.ceil(ticks_left / 10);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 pl-5 pr-2 py-1.5">
      {toast.status === "pending" ? (
        <>
          <span className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
            <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            Sending {mode_label(toast.mode, toast.is_draft).toLowerCase()}…
          </span>
          <button
            onClick={dismiss}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1 rounded-full transition-colors cursor-pointer">
            Close
          </button>
        </>
      ) : toast.status === "failed" ? (
        <>
          <span className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
            <Send size={15} className="text-red-500" />
            Couldn't send {mode_label(toast.mode, toast.is_draft).toLowerCase()}
            {toast.error ? ` — ${toast.error}` : ""}
          </span>
          <button
            onClick={reopen}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full transition-colors cursor-pointer">
            Reopen
          </button>
          <button
            onClick={dismiss}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1 rounded-full transition-colors cursor-pointer">
            Close
          </button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
            <Send size={15} className="text-accent" />
            {mode_label(toast.mode, toast.is_draft)} Sent
          </span>
          {toast.undo_enabled && toast.countdown_total > 0 && (
            <>
              <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/40 rounded-full transition-[width] duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{seconds}s</span>
            </>
          )}
          {toast.undo_enabled && (
            <button
              onClick={reopen}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full transition-colors cursor-pointer">
              Undo
            </button>
          )}
          <button
            onClick={dismiss}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1 rounded-full transition-colors cursor-pointer">
            Close
          </button>
        </>
      )}
    </div>
  );
}