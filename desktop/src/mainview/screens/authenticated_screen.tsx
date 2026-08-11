import { useState, useMemo, useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";
import Sidebar from "../components/sidebar";
import MainContent from "../components/main_content";
import SettingsModal from "./settings_modal";
import MailBackdrop from "../components/mail_backdrop";
import { folderAtom, emailsByFolderAtom, filtered_views_atom_for, active_filtered_view_atom, filter_clauses_atom, email_list_selection_atom, settings_open_atom } from "../state";
import { useAccount } from "../hooks/use_current_account";
import type { SyncEngineState } from "../hooks/sync_state";
import type { Tab } from "../components/settings/types";
import { emails_for_folder } from "../hooks/email_utils";
import { apply_filter_clauses } from "../utils/filter_clauses";
import { is_scheduled_send } from "../utils/scheduled_send";
import { useOutboxItems } from "../hooks/use_outbox_items";
import { use_commands } from "../hooks/use_commands";
import { use_account_data } from "../hooks/use_account_data";
import { use_mail_session } from "../hooks/use_mail_session";
import { use_mail_actions } from "../hooks/use_mail_actions";
import CommandKModal from "../components/command_k_modal";

type Props = {
  syncState: SyncEngineState;
  check_for_new_mail: () => void;
  onLogout: () => void;
  onDisconnect: () => void;
};

function AuthenticatedScreen({ syncState, check_for_new_mail, onLogout, onDisconnect }: Props) {
  const [currentFolder, setCurrentFolder] = useAtom(folderAtom);
  const [settingsOpen, setSettingsOpen] = useAtom(settings_open_atom);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const set_email_list_selection = useSetAtom(email_list_selection_atom);

  const [emailsByFolder] = useAtom(emailsByFolderAtom);
  const filter_clauses = useAtomValue(filter_clauses_atom);
  const user = useAccount();
  const [active_view_id, set_active_view_id] = useAtom(active_filtered_view_atom);
  const account_views_atom = useMemo(() => filtered_views_atom_for(user?.id ?? ""), [user?.id]);
  const [account_views] = useAtom(account_views_atom);
  const active_view = useMemo(
    () => account_views.find((v) => v.id === active_view_id && v.visible) ?? null,
    [account_views, active_view_id],
  );
  const folder = active_view?.folder ?? currentFolder;
  const clauses = active_view ? active_view.clauses : filter_clauses;
  const emails_base = emails_for_folder(emailsByFolder, folder);
  const emails = useMemo(() => apply_filter_clauses(emails_base, clauses), [emails_base, clauses]);

  const { items: outbox_items } = useOutboxItems({ status: ["queued", "sending", "failed"] });
  const scheduled_items = useMemo(() => outbox_items.filter(is_scheduled_send), [outbox_items]);

  useEffect(() => {
    if (currentFolder === "scheduled" && scheduled_items.length === 0) {
      setCurrentFolder("inbox");
    }
  }, [currentFolder, scheduled_items.length, setCurrentFolder]);

  use_account_data(user);

  const {
    isBackdropOpen,
    currentIdx,
    goPrev,
    goNext,
    handleCompose,
    handle_close_viewer,
    handle_prev_email,
    handle_next_email,
    handle_reply,
    handleSelectEmail,
  } = use_mail_session(emails);
  const { handleAction, handle_list_action, handle_viewer_action } = use_mail_actions({ folder, emails, currentIdx });

  useEffect(() => {
    set_email_list_selection(-1);
  }, [folder, active_view_id, set_email_list_selection]);

  useEffect(() => {
    set_email_list_selection((sel) => (sel >= emails.length ? -1 : sel));
  }, [emails.length, set_email_list_selection]);

  const { execute } = use_commands({
    emails,
    on_open_email: handleSelectEmail,
    on_reload: check_for_new_mail,
    on_compose: handleCompose,
    on_list_action: handle_list_action,
    on_viewer_action: handle_viewer_action,
    on_prev_email: handle_prev_email,
    on_next_email: handle_next_email,
    on_close_viewer: handle_close_viewer,
    on_reply: handle_reply,
  });

  function open_settings_tab(tab: string) {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
    setTimeout(() => setSettingsInitialTab(undefined), 0);
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user!}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenProfile={() => open_settings_tab("Profile")}
        onOpenDeveloper={() => open_settings_tab("Developer")}
        onRetryBackfill={() => { if (user?.id) rpc.request(messages.sync_past, { account_id: user.id }).catch(() => { }); }}
        currentFolder={currentFolder}
        onFolderChange={(folder) => { set_active_view_id(null); setCurrentFolder(folder); }}
        active_view_id={active_view_id}
        onViewSelect={set_active_view_id}
        scheduled_count={scheduled_items.length}
        backfill={syncState.backfill}
      />
      <MainContent
        syncState={syncState}
        onRefresh={check_for_new_mail}
        onSelectEmail={handleSelectEmail}
        onCompose={handleCompose}
        onDeleteEmail={undefined}
        folder={folder}
        clauses={clauses}
        active_view={active_view}
        scheduled_items={scheduled_items}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={onLogout}
        onDisconnect={onDisconnect}
        syncState={syncState}
        initialTab={settingsInitialTab as Tab | undefined}
      />
      {isBackdropOpen && (
        <MailBackdrop
          onClose={handle_close_viewer}
          onPrev={currentIdx > 0 ? goPrev : undefined}
          onNext={currentIdx < emails.length - 1 ? goNext : undefined}
          onAction={handleAction}
        />
      )}
      <CommandKModal execute={execute} />
    </div>
  );
}

export default AuthenticatedScreen;
