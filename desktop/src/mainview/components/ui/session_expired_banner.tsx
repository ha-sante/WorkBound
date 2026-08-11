import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../rpc";

export function SessionExpiredBanner() {
  const [entry, setEntry] = useState<InvalidGrantWire | null>(null);
  const [loading, setLoading] = useState(false);
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handler = (payload: InvalidGrantWire) => {
      setEntry(payload);
    };
    rpc.addMessageListener(messages.auth_invalid_grant, handler);
    return () => {
      rpc.removeMessageListener(messages.auth_invalid_grant, handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        rpc.removeMessageListener(messages.auth_reconnect_complete, listenerRef.current);
      }
    };
  }, []);

  const handleReconnect = useCallback(async () => {
    if (!entry) return;
    setLoading(true);
    try {
      await rpc.request(messages.auth_reconnect_gmail, { account_id: entry.account_id });
      const handler = () => {
        rpc.removeMessageListener(messages.auth_reconnect_complete, handler);
        listenerRef.current = null;
        setEntry(null);
        setLoading(false);
      };
      listenerRef.current = handler;
      rpc.addMessageListener(messages.auth_reconnect_complete, handler);
    } catch {
      setEntry(null);
      setLoading(false);
    }
  }, [entry]);

  if (!entry) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white rounded-full shadow-lg border border-border-subtle pl-4 pr-3 py-1.5">
      <AlertTriangle size={16} className="shrink-0 text-text-secondary" />
      <span className="text-sm text-text-primary whitespace-nowrap">
        {entry.reason === "credentials_changed" ? (
          <>You changed your OAuth credentials. <span className="font-medium">{entry.email}</span> needs to reconnect.</>
        ) : (
          <>Re-authentication required for <span className="font-medium">{entry.email}</span>.</>
        )}
      </span>
      <button
        onClick={handleReconnect}
        disabled={loading}
        className="ml-1 px-3 py-1 text-xs font-medium border border-border-subtle text-text-primary rounded-full hover:bg-black/[0.04] transition-colors disabled:opacity-40"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : "Reconnect"}
      </button>
    </div>
  );
}
