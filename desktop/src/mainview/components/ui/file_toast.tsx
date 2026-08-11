import { useEffect } from "react";
import { useAtom } from "jotai";
import { savedFileToastAtom } from "../../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../rpc";

export function FileToast() {
  const [toast, setToast] = useAtom(savedFileToastAtom);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 pl-5 pr-1.5 py-1.5">
      <span className="text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
        {toast.isLocal ? "Opened" : "Saved"} {toast.filename}
      </span>
      <button
        onClick={() => rpc.request(messages.reveal_in_finder, { path: toast.path })}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full transition-colors cursor-pointer"
      >
        Find
      </button>
    </div>
  );
}
