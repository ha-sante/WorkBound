import { useEffect, useState, useCallback, useMemo } from "react";
import LoginScreen from "./screens/login_screen";
import AuthenticatedScreen from "./screens/authenticated_screen";
import AppSetupMoveScreen from "./components/app_setup_move_screen";
import { useSyncState } from "./hooks/use_sync_state";
import { useLoadEmails } from "./hooks/use_load_emails";
import { use_prefetch_mail_bodies } from "./hooks/use_prefetch_mail_bodies";
import { useContextMenu } from "./hooks/use_context_menu";
import { useEmailCommands } from "./hooks/use_email_commands";
import { messages } from "@/shared/rpc_messages";
import { useSetAtom } from "jotai";
import { accountsAtom, currentAccountIdAtom } from "./state";
import { rpc } from "./rpc";
import { CopyToast } from "./components/ui/copy_toast";
import { AlertToast } from "./components/ui/alert_toast";
import { MessageToast } from "./components/ui/message_toast";
import { FileToast } from "./components/ui/file_toast";
import { UpdateToast } from "./components/ui/update_toast";
import { SentToast } from "./components/ui/sent_toast";
import { useAutoUpdate } from "./hooks/use_auto_update";
import { SessionExpiredBanner } from "./components/ui/session_expired_banner";
import { ConfigProvider } from "./hooks/use_config";
import SplashScreen from "./components/splash_screen";

console.time("app:init");

function App() {
  useContextMenu();
  useEmailCommands();
  useAutoUpdate();
  console.timeLog("app:init", "mounted");

  const [accounts, setAccounts] = useState<AccountRowWire[] | null>(null);
  const [splashStatus, setSplashStatus] = useState("Connecting...");
  const [showMove, setShowMove] = useState(false);
  const account_id = accounts?.[0]?.id;
  const setAccountId = useSetAtom(currentAccountIdAtom);
  const setAccountsAtom = useSetAtom(accountsAtom);
  const { state, check_for_new_mail, reset_sync_state, setPaginationAnchors } = useSyncState(account_id);
  const actions = useMemo(() => ({ setPaginationAnchors }), [setPaginationAnchors]);
  const initial_load_complete = useLoadEmails(account_id, actions);
  use_prefetch_mail_bodies(account_id, initial_load_complete);

  useEffect(() => {
    (async () => {
      console.time("app:loadAccounts");
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          setSplashStatus(`Connecting... (attempt ${attempt})`);
          const list = await rpc.request(messages.account_list);
          const active = list.filter((a: AccountRowWire) => a.is_active);
          console.timeLog("app:loadAccounts", `got ${active.length} active account(s)`);
          setAccounts(active);
          setAccountsAtom(active);
          if (active.length > 0) {
            setAccountId(active[0].id);
            rpc.request(messages.services_start).catch(() => {});
          }
          console.timeEnd("app:loadAccounts");
          console.timeLog("app:init", "accounts settled");
          return;
        } catch {
          console.timeLog("app:loadAccounts", `attempt ${attempt} failed, retrying...`);
        }
      }
      console.timeLog("app:loadAccounts", "all retries exhausted, showing login");
      console.timeEnd("app:loadAccounts");
      console.timeLog("app:init", "accounts settled (fallback)");
      setAccounts([]);
      setAccountsAtom([]);
    })();
  }, [setAccountId, setAccountsAtom]);

  const handleLogin = useCallback(async () => {
    const list = await rpc.request(messages.account_list);
    const active = list.filter((a: AccountRowWire) => a.is_active);
    setAccounts(active);
    setAccountsAtom(active);
    if (active.length > 0) {
      setAccountId(active[0].id);
      rpc.request(messages.services_start).catch(() => {});
    }
  }, [setAccountId, setAccountsAtom]);

  const handleLogout = useCallback(async () => {
    await rpc.request(messages.services_stop);
    await rpc.request(messages.account_logout);
    reset_sync_state();
    setAccounts([]);
    setAccountsAtom([]);
    setAccountId(null);
  }, [reset_sync_state, setAccountId, setAccountsAtom]);

  const handleDisconnect = useCallback(async () => {
    await rpc.request(messages.services_stop);
    await rpc.request(messages.account_delete_all);
    reset_sync_state();
    setAccounts([]);
    setAccountsAtom([]);
    setAccountId(null);
  }, [reset_sync_state, setAccountId, setAccountsAtom]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await rpc.request(messages.app_setup_get_status);
        if (!cancelled && s.should_auto_move) setShowMove(true);
      } catch {
        // never block on a move-status check failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ConfigProvider>
      {showMove ? (
        <AppSetupMoveScreen onContinue={() => setShowMove(false)} />
      ) : accounts === null ? (
        <SplashScreen status={splashStatus} />
      ) : accounts.length === 0 ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <>
          <AuthenticatedScreen
            syncState={state}
            check_for_new_mail={check_for_new_mail}
            onLogout={handleLogout}
            onDisconnect={handleDisconnect}
          />
          <CopyToast />
          <AlertToast />
          <MessageToast />
          <FileToast />
          <UpdateToast />
          <SentToast />
          <SessionExpiredBanner />
        </>
      )}
    </ConfigProvider>
  );
}

export default App;
