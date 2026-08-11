import { useState, useEffect, useRef } from "react";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";

export function AliasesPanel({ account }: { account: AccountRowWire }) {
  const [aliases, setAliases] = useState<SendAsAliasWire[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAliases = async () => {
    setLoading(true);
    try {
      const data = await rpc.request(messages.send_as_list, { account_id: account.id }) as SendAsAliasWire[];
      if (mountedRef.current) setAliases(data);
    } catch (err) {
      if (mountedRef.current) setStatus({ type: "error", msg: String(err) });
    }
    if (mountedRef.current) setLoading(false);
  };

  useEffect(() => {
    fetchAliases();
  }, [account.id]);

  const handleSync = async () => {
    setSyncing(true);
    setStatus(null);
    try {
      const data = await rpc.request(messages.send_as_sync, { account_id: account.id }) as SendAsAliasWire[];
      if (mountedRef.current) {
        setAliases(data);
        setStatus({ type: "success", msg: `Synced ${data.length} alias${data.length === 1 ? "" : "es"}` });
      }
    } catch (err) {
      if (mountedRef.current) setStatus({ type: "error", msg: String(err) });
    }
    if (mountedRef.current) setSyncing(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-text-primary mb-4">Send-As Aliases</h2>
      <div className="space-y-4">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {syncing ? "Syncing..." : "Sync from Gmail"}
        </button>

        {status && (
          <p className={`text-xs ${status.type === "error" ? "text-red-500" : "text-green-600"}`}>
            {status.msg}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-text-secondary">Loading...</p>
        ) : aliases.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No aliases found. Click "Sync from Gmail" to fetch your send-as aliases.
          </p>
        ) : (
          <div className="space-y-2">
            {aliases.map((a) => (
              <div
                key={`${a.send_as_email}-${a.id}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {a.display_name ? `${a.display_name} <${a.send_as_email}>` : a.send_as_email}
                  </p>
                  {a.reply_to_address && (
                    <p className="text-xs text-text-secondary mt-0.5">Reply-To: {a.reply_to_address}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {a.is_primary && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700">
                      Primary
                    </span>
                  )}
                  {a.is_default && !a.is_primary && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700">
                      Default
                    </span>
                  )}
                  {a.verification_status === "pending" && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
