import { useState, useRef, useEffect } from "react";
import { MailIcon, Terminal } from "lucide-react";
import { messages } from "@/shared/rpc_messages";
import { DeveloperConfigModal } from "@/mainview/components/settings/login_dev_config_modal";
import { useConfig } from "@/mainview/hooks/use_config";
import { rpc } from "../rpc";
type Props = {
  onLogin: () => void;
};

type Provider = {
  id: string;
  label: string;
  disabled: boolean;
  badge?: string;
};

const providers: Provider[] = [
  { id: "gmail", label: "Gmail Account", disabled: false },
  { id: "workbound", label: "Workbound Native", disabled: true, badge: "Coming soon" },
  { id: "cloudflare", label: "Cloudflare Account", disabled: true, badge: "Coming soon" },
];

function LoginScreen({ onLogin }: Props) {
  const { get } = useConfig();
  const authMode = !get("GOOGLE_OAUTH_CLIENT_SECRET") && get("WORKBOUND_PROXY_BASE_URL") ? "shared" : "self";
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showDevModal, setShowDevModal] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (listenerRef.current) {
        rpc.removeMessageListener(messages.auth_login_complete, listenerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const handler = () => {
      rpc.removeMessageListener(messages.auth_login_complete, handler);
      listenerRef.current = null;
      onLogin();
    };
    listenerRef.current = handler;
    rpc.addMessageListener(messages.auth_login_complete, handler);
    return () => {
      rpc.removeMessageListener(messages.auth_login_complete, handler);
      listenerRef.current = null;
    };
  }, [loading, onLogin]);

  const handleGmail = async () => {
    setError("");
    setPreparing(true);
    try {
      const prep = await rpc.request(messages.auth_prepare_gmail_oauth);
      setLoginUrl(prep.url);
      setPreparing(false);
      setLoading(true);
      await rpc.request(messages.auth_launch_gmail_oauth, {});
    } catch (err) {
      setError(String(err));
      setPreparing(false);
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!loginUrl) return;
    try {
      await rpc.request(messages.clipboard_write, { text: loginUrl });
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleCancel = async () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    try { await rpc.request(messages.auth_cancel_gmail_oauth); } catch { console.warn("auth_cancel_gmail_oauth failed"); }
    setLoading(false);
    setError("");
    setCopied(false);
    setLoginUrl(null);
  };

  return (
    <div className="h-screen flex flex-col sidebar_parent">
      <div className="electrobun-webkit-app-region-drag h-9 cursor-default select-none shrink-0" />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[360px] sidebar_parent rounded-xl p-8">
        <div className="text-center mb-8">
          <MailIcon className="mx-auto my-3 text-gray-400" size={18}/>
          <h1 className="text-2xl font-semibold text-text-primary">WorkBound</h1>
          <p className="text-sm text-text-secondary mt-1">
            Connect an account to get started
          </p>
        </div>

        <div className="space-y-3">
          {providers.map((p) => (
            <button
              key={p.id}
              disabled={p.disabled || loading || preparing}
              onClick={p.id === "gmail" ? handleGmail : undefined}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm rounded-lg border border-border-subtle transition-colors cursor-pointer ${
                p.disabled
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-black/5 active:bg-black/10"
              }`}
            >
              <span className="font-medium text-text-primary">{p.label}</span>
              {p.id === "gmail" ? (
                <span className="text-xs text-text-secondary">{authMode === "shared" ? "Default Keys" : "Self Keys"}</span>
              ) : p.badge ? (
                <span className="text-xs text-text-secondary">{p.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {(preparing || loading) && (
          <div className="flex flex-col items-center gap-3 mt-5 px-4 pt-3 border-t border-border-subtle">
            <p className="text-xs text-text-secondary text-center">
              {preparing
                ? "Preparing login link..."
                : "Waiting for authorization... Complete sign-in in your browser, then return here."}
            </p>
            <div className="flex items-center gap-4">
              {loading && !preparing && (
                <button
                  onClick={handleCopyLink}
                  className="text-xs text-text-secondary/70 hover:text-text-secondary transition-colors cursor-pointer"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button
                onClick={handleCancel}
                className="text-xs text-text-secondary/70 hover:text-text-secondary transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500 text-center mt-4">{error}</p>
        )}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center pb-4">
        <button
          onClick={() => setShowDevModal(true)}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <Terminal size={14} />
          Developer
        </button>
      </div>

      {showDevModal && <DeveloperConfigModal onClose={() => setShowDevModal(false)} />}
    </div>
  );
}

export default LoginScreen;
