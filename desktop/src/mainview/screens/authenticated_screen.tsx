import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";
import Sidebar from "../components/sidebar";
import MainContent from "../components/main_content";
import SettingsModal from "./settings_modal";
import MailBackdrop from "../components/mail_backdrop";
import { folderAtom, emailsByFolderAtom, filtered_views_atom_for, active_filtered_view_atom, filter_clauses_atom, email_list_selection_atom, settings_open_atom } from "../state";
import { useAccount } from "../hooks/use_current_account";
import type { SyncEngineState } from "../hooks/utils/sync_state";
import type { Tab } from "../components/settings/types";
import { get_emails_for_folder } from "../hooks/utils/email_utils";
import { apply_filter_clauses } from "../utils/filter_clauses";
import { use_commands } from "../hooks/use_commands";
import { use_reminders_list } from "../hooks/use_reminders_list";
import { use_scheduled_list } from "../hooks/use_scheduled_list";
import { row_email } from "../utils/mail_display_utils";
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
  const open_email_ref = useRef<(email: EmailPreviewWire) => void>(() => {});
  const [active_view_id, set_active_view_id] = useAtom(active_filtered_view_atom);
  const account_views_atom = useMemo(() => filtered_views_atom_for(user?.id ?? ""), [user?.id]);
  const [account_views] = useAtom(account_views_atom);
  const active_view = useMemo(
    () => account_views.find((v) => v.id === active_view_id && v.visible) ?? null,
    [account_views, active_view_id],
  );
  const visible_views = useMemo(
    () => account_views.filter((v) => v.visible).sort((a, b) => a.position - b.position),
    [account_views],
  );
  const folder = active_view?.folder ?? currentFolder;
  const clauses = active_view ? active_view.clauses : filter_clauses;
  const emails_base = get_emails_for_folder(emailsByFolder, folder);
  const emails = useMemo(() => apply_filter_clauses(emails_base, clauses), [emails_base, clauses]);

  const reminders_list = use_reminders_list(user?.id, (email) => open_email_ref.current(email));
  const scheduled_list = use_scheduled_list();
  const is_reminders = folder === "reminders";
  const is_scheduled = folder === "scheduled";
  const reminder_session_emails = useMemo(
    () => reminders_list.rows.flatMap((row) => {
      const email = row_email(row, emailsByFolder);
      return email ? [email] : [];
    }),
    [reminders_list.rows, emailsByFolder],
  );
  const session_emails = is_reminders ? reminder_session_emails : is_scheduled ? [] : emails;

  useEffect(() => {
    if (currentFolder === "scheduled" && scheduled_list.count === 0) {
      setCurrentFolder("inbox");
    }
    if (currentFolder === "reminders" && reminders_list.count === 0) {
      setCurrentFolder("inbox");
    }
  }, [currentFolder, scheduled_list.count, reminders_list.count, setCurrentFolder]);

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
  } = use_mail_session(session_emails);
  open_email_ref.current = handleSelectEmail;
  const { handleAction, handle_list_action, handle_viewer_action } = use_mail_actions({ folder, emails: session_emails, currentIdx });

  const open_email = useCallback(
    (row: MailListRow) => {
      const email = row_email(row, emailsByFolder);
      if (email) handleSelectEmail(email);
    },
    [handleSelectEmail, emailsByFolder],
  );

  const page = is_reminders
    ? reminders_list
    : is_scheduled
      ? scheduled_list
      : { rows: emails, count: emails.length, open: open_email, actions_for: undefined };

  useEffect(() => {
    set_email_list_selection(-1);
  }, [folder, active_view_id, set_email_list_selection]);

  useEffect(() => {
    set_email_list_selection((sel) => (sel >= page.rows.length ? -1 : sel));
  }, [page.rows.length, set_email_list_selection]);

  const { execute } = use_commands({
    rows: page.rows,
    scheduled_count: scheduled_list.count,
    reminders_count: reminders_list.count,
    on_open_row: page.open,
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
        scheduled_count={scheduled_list.count}
        reminders_count={reminders_list.count}
        due_reminders_count={reminders_list.due_count}
        backfill={syncState.backfill}
      />
      <MainContent
        syncState={syncState}
        onRefresh={check_for_new_mail}
        onCompose={handleCompose}
        onSelectEmail={handleSelectEmail}
        folder={folder}
        active_view={active_view}
        rows={page.rows}
        actions_for={page.actions_for}
        onSelect={page.open}
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
          onNext={currentIdx < session_emails.length - 1 ? goNext : undefined}
          onAction={handleAction}
        />
      )}
      <CommandKModal
        execute={execute}
        views={visible_views}
        scheduled_count={scheduled_list.count}
        reminders_count={reminders_list.count} />
    </div>
  );
}

export default AuthenticatedScreen;
