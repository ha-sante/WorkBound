import { useCallback, useMemo } from "react";
import { useAtom } from "jotai";
import SyncProgress from "./sync_progress";
import EmailList from "./email_list";
import TopBar from "./top_bar";
import { emailsByFolderAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import type { SyncEngineState } from "../hooks/utils/sync_state";
import { rpc } from "../rpc";
import { row_email } from "../utils/mail_display_utils";

type Props = {
  syncState: SyncEngineState;
  onRefresh: () => void;
  onCompose: () => void;
  onSelectEmail?: (email: EmailPreviewWire) => void;
  folder: string;
  active_view: FilteredViewWire | null;
  rows: MailListRow[];
  actions_for?: (row: MailListRow, index: number) => React.ReactNode | null | undefined;
  onSelect: (row: MailListRow) => void;
};

function MainContent({ syncState, onRefresh, onCompose, onSelectEmail, folder, active_view, rows, actions_for, onSelect }: Props) {
  const [emailsByFolder] = useAtom(emailsByFolderAtom);

  const handleContextMenu = useCallback((e: React.MouseEvent, row: MailListRow) => {
    if ((e.target as HTMLElement)?.tagName === "IFRAME") return;
    const email = row_email(row, emailsByFolder);
    if (!email) return;
    rpc.request(messages.context_menu_show, {
      kind: "email",
      email_id: email.id,
      account_id: email.account_id,
      is_read: email.is_read === 1,
      is_flagged: email.is_flagged === 1,
      folder: email.folder,
      x: e.clientX,
      y: e.clientY,
    });
  }, [emailsByFolder]);

  const { backfill, newfill, hasCompletedBackfill } = syncState;
  const isBackfillSyncing = backfill.status === "syncing" && !hasCompletedBackfill;
  const isNewfillSyncing = newfill.isSyncing;
  const totalEmails = useMemo(() => Object.values(emailsByFolder).reduce((sum, arr) => sum + arr.length, 0), [emailsByFolder]);
  const loading = !hasCompletedBackfill && rows.length === 0;
  const showFullScreenSync = isBackfillSyncing && backfill.total === 0 && totalEmails === 0;

  const dragStrip = (<div className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-4 z-[30] cursor-default"
    onDoubleClick={() => rpc.request(messages.toggle_zoom)} />);

  return (
    <main className="main-panel">
      {dragStrip}
      <TopBar
        folder={folder}
        active_view={active_view}
        onCompose={onCompose}
        onRefresh={onRefresh}
        isNewfillSyncing={isNewfillSyncing}
        onSelectEmail={onSelectEmail}
      />
      {showFullScreenSync ? (
        <SyncProgress backfill={backfill} />
      ) : (
        <EmailList
          rows={rows}
          loading={loading}
          onSelect={onSelect}
          onContextMenu={handleContextMenu}
          actions_for={actions_for}
        />
      )}
    </main>
  );
}

export default MainContent;
