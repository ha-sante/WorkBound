import { useEffect } from "react";
import { useAtom } from "jotai";
import { copyToastAtom } from "../../state";

export function CopyToast() {
  const [message, setMessage] = useAtom(copyToastAtom);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2000);
    return () => clearTimeout(t);
  }, [message, setMessage]);

  if (!message) return null;

  const clean = message.replace(/\s+/g, " ").trim();
  const snippet = clean.length > 80 ? clean.slice(0, 80) + "…" : clean;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 pl-5 pr-5 py-1.5">
      <span className="text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">Copied {snippet}</span>
    </div>
  );
}