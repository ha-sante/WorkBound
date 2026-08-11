import { X } from "lucide-react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../rpc";
import { ConfigRow } from "./config_row";
import { useConfig } from "@/mainview/hooks/use_config";

type Props = {
  onClose: () => void;
};

const LOGIN_CONFIG_KEYS = new Set([
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_CALLBACK_PORT",
  "WORKBOUND_PROXY_BASE_URL",
  "WORKBOUND_PROXY_API_KEY",
]);

export function DeveloperConfigModal({ onClose }: Props) {
  const { entries, refresh } = useConfig();

  const handleSave = async (key: string, value: string) => {
    await rpc.request(messages.config_set, { key, value: value || undefined });
    await refresh();
  };

  const handleReset = async (key: string) => {
    await rpc.request(messages.config_set, { key, value: undefined });
    await refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[540px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-3 shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Configurations</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/[0.04] transition-colors cursor-pointer"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-3 pb-5 flex-1">
          <p className="text-xs text-text-secondary mb-3">
            <span className="font-medium">Self Keys</span> - you can use your own Google OAuth credentials. <a href="https://developers.google.com/identity/protocols/oauth2" target="_blank" rel="noopener noreferrer" className="underline">See official Google setup guide</a>. This can be edited later in settings.
          </p>
          <div className="border border-border-subtle rounded divide-y divide-border-subtle">
            {entries.filter((e) => LOGIN_CONFIG_KEYS.has(e.key)).map((entry) => (
              <ConfigRow key={entry.key} entry={entry} onSave={handleSave} onReset={handleReset} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
