import { useState, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { ChevronRight } from "lucide-react";
import { accountContactsAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import AvatarImage from "../avatar_image";

export function ProfilePanel({ account, onLogout, onDisconnect }: { account: AccountRowWire | null; onLogout: () => void; onDisconnect: () => void }) {
  const [loading, setLoading] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [reconnectDone, setReconnectDone] = useState(false);
  const listenerRef = useRef<((payload: AuthReconnectCompleteWire) => void) | null>(null);

  const aliases = useAtomValue(accountContactsAtom);
  const [aliasesOpen, setAliasesOpen] = useState(true);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        rpc.removeMessageListener(messages.auth_reconnect_complete, listenerRef.current);
      }
    };
  }, []);

  const handleResync = async () => {
    setLoading(true);
    try {
      await rpc.request(messages.send_as_sync, { account_id: account.id });
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 2000);
    } catch {
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 2000);
    }
    setLoading(false);
  };

  const handleReconnect = async () => {
    setReconnectLoading(true);
    try {
      await rpc.request(messages.auth_reconnect_gmail, { account_id: account.id });
      const handler = (_payload: AuthReconnectCompleteWire) => {
        rpc.removeMessageListener(messages.auth_reconnect_complete, handler);
        listenerRef.current = null;
        setReconnectDone(true);
        setTimeout(() => setReconnectDone(false), 2000);
        setReconnectLoading(false);
      };
      listenerRef.current = handler;
      rpc.addMessageListener(messages.auth_reconnect_complete, handler);
    } catch {
      setReconnectDone(true);
      setTimeout(() => setReconnectDone(false), 2000);
      setReconnectLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-medium text-text-primary">Profile</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <AvatarImage
            url={account.avatar_url}
            name={account.name}
            email={account.email}
            imgClassName="w-10 h-10 rounded-full object-cover shrink-0"
            initialsClassName="w-10 h-10 rounded-full border border-[#DEDEDC] shrink-0 flex items-center justify-center text-sm font-medium text-text-secondary"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-primary truncate">
                {account.name || account.email}
              </p>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 shrink-0">
                {account.provider === "gmail" ? "Gmail" : account.provider}
              </span>
            </div>
            <p className="text-xs text-text-secondary truncate">{account.email}</p>
          </div>
        </div>

      </div>

      <div className="space-y-3">
        <button
          onClick={() => setAliasesOpen(!aliasesOpen)}
          className="flex items-center justify-between w-full text-left cursor-pointer"
        >
          <h3 className="text-sm font-medium text-text-primary">Account Aliases</h3>
          <ChevronRight
            size={16}
            className={`text-text-secondary transition-transform ${aliasesOpen ? "rotate-90" : ""}`}
          />
        </button>

        {aliasesOpen && (
          aliases.length === 0 ? (
            <p className="text-sm text-text-secondary">No aliases found.</p>
          ) : (
            <div>
              {aliases.map((a) => (
                <div key={`${a.send_as_email}-${a.id}`} className="flex items-center justify-between py-2.5">
                  <p className="text-sm text-text-primary truncate">
                    {a.display_name ? `${a.display_name} <${a.send_as_email}>` : a.send_as_email}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {a.is_primary && (
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700">Primary</span>
                    )}
                    {a.is_default && !a.is_primary && (
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700">Default</span>
                    )}
                    {a.verification_status === "pending" && (
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">Account Actions</h3>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Sync profile</p>
            <p className="text-xs text-text-secondary mt-0.5">Fetch latest aliases and profile data from your provider.</p>
          </div>
          <button
            onClick={handleResync}
            disabled={loading}
            className="px-4 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            {loading ? "Syncing..." : syncDone ? "Synced ✓" : "Refresh"}
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Reconnect</p>
            <p className="text-xs text-text-secondary mt-0.5">Re-authorize access if your session has expired.</p>
          </div>
          <button
            onClick={handleReconnect}
            disabled={reconnectLoading}
            className="px-4 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            {reconnectLoading ? "Opening..." : reconnectDone ? "Done ✓" : "Reconnect"}
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Logout</p>
            <p className="text-xs text-text-secondary mt-0.5">Sign out and clear credentials. Cached emails are kept.</p>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer shrink-0"
          >
            Logout
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Disconnect</p>
            <p className="text-xs text-text-secondary mt-0.5">Remove account and purge all data including emails, templates, and signatures.</p>
          </div>
          <button
            onClick={onDisconnect}
            className="px-4 py-1.5 text-sm border border-red-200 text-red-500 rounded hover:bg-red-50 transition-colors cursor-pointer shrink-0"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
