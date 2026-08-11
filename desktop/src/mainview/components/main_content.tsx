import { useCallback, useMemo } from "react";
import { useAtom } from "jotai";
import SyncProgressView from "../screens/sync_progress_view";
import EmailList from "./email_list";
import ScheduledList from "./scheduled_list";
import TopBar from "./top_bar";
import { emailsByFolderAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import type { SyncEngineState } from "../hooks/sync_state";
import { rpc } from "../rpc";
import { apply_filter_clauses } from "../utils/filter_clauses";
import { emails_for_folder } from "../hooks/email_utils";

type Props = {
  syncState: SyncEngineState;
  onRefresh: () => void;
  onSelectEmail?: (email: EmailPreviewWire) => void;
  onCompose: () => void;
  onDeleteEmail?: (id: string) => void;
  folder: string;
  clauses: ClientFilterClause[];
  active_view: FilteredViewWire | null;
  scheduled_items?: OutboxItemWire[];
};

function MainContent({ syncState, onRefresh, onSelectEmail, onCompose, onDeleteEmail, folder, clauses, active_view, scheduled_items }: Props) {
  const [emailsByFolder] = useAtom(emailsByFolderAtom);
  const emails = useMemo(
    () => apply_filter_clauses(emails_for_folder(emailsByFolder, folder), clauses),
    [emailsByFolder, folder, clauses],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, email: EmailPreviewWire) => {
    if ((e.target as HTMLElement)?.tagName === "IFRAME") return;
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
  }, []);

  const { backfill, newfill, hasCompletedBackfill } = syncState;
  const isBackfillSyncing = backfill.status === "syncing" && !hasCompletedBackfill;
  const isNewfillSyncing = newfill.isSyncing;
  const totalEmails = Object.values(emailsByFolder).reduce((sum, arr) => sum + arr.length, 0);
  const loading = !hasCompletedBackfill && totalEmails === 0;
  const showFullScreenSync = isBackfillSyncing && backfill.total === 0 && totalEmails === 0;

  const dragStrip = (<div
    className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-4 z-[30] cursor-default"
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
        <SyncProgressView backfill={backfill} />
      ) : folder === "scheduled" ? (
        <ScheduledList items={scheduled_items ?? []} />
      ) : (
        <EmailList emails={emails} loading={loading} onSelectEmail={onSelectEmail} onContextMenu={handleContextMenu} onDeleteEmail={onDeleteEmail} />
      )}
    </main>
  );
}

export default MainContent;
