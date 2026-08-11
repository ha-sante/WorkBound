import { useEffect } from "react";
import { useAtom } from "jotai";
import { alertToastAtom } from "../../state";
import { AlertTriangle, Check, X } from "lucide-react";

export function AlertToast() {
  const [toast, setToast] = useAtom(alertToastAtom);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;

  const icon = toast.type === "success" ? <Check size={16} className="shrink-0 text-green-500" /> : <AlertTriangle size={16} className="shrink-0 text-gray-500" />;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-white rounded-full shadow-lg border border-gray-200 pl-4 pr-2 py-1.5">
      {icon}
      <span className="text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">{toast.message}</span>
      <button
        onClick={() => setToast(null)}
        className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
        <X size={12} />
      </button>
    </div>
  );
}