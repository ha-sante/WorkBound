import { useAtom } from "jotai";
import { updateToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { mark_update_dismissed } from "../../hooks/use_auto_update";

export function UpdateToast() {
  const [toast, set_toast] = useAtom(updateToastAtom);
  if (!toast) return null;

  const handle_apply = () => {
    set_toast(null);
    rpc.request(messages.updates_install).catch((e) => {
      console.error("update install failed", e);
    });
  };

  const handle_later = () => {
    mark_update_dismissed(toast.hash);
    set_toast(null);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 pl-5 pr-2 py-1.5">
      <span className="text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
        Update ready
      </span>
      <button
        onClick={handle_later}
        className="text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1 rounded-full transition-colors cursor-pointer">
        Later
      </button>
      <button
        onClick={handle_apply}
        className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full transition-colors cursor-pointer">
        Apply & Restart
      </button>
    </div>
  );
}
