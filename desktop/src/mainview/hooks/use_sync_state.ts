import { useEffect, useReducer, useCallback, useRef } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { initialSyncState, sync_reducer } from "./sync_state";
import { emailsByFolderAtom } from "../state";
import { fetch_all_local_emails, group_emails_by_folder, merge_emails, get_bounds } from "./email_utils";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

export type { SyncEngineState } from "./sync_state";

export function useSyncState(account_id?: string) {
  const [state, dispatch] = useReducer(sync_reducer, initialSyncState);
  const backfill_doneRef = useRef(false);
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const folderEmails = useAtomValue(emailsByFolderAtom);
  const newestRef = useRef<string | null>(null);
  const oldestRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const boundsSetRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync bounds from atom once it's populated (after initial load in useStartup)
  useEffect(() => {
    if (boundsSetRef.current) return;
    const b = get_bounds(folderEmails);
    if (b.newest || b.oldest) {
      newestRef.current = b.newest;
      oldestRef.current = b.oldest;
      boundsSetRef.current = true;
    }
  }, [folderEmails]);

  const setPaginationAnchors = useCallback((newest: string | null, oldest: string | null) => {
    if (newest) newestRef.current = newest;
    if (oldest) oldestRef.current = oldest;
    boundsSetRef.current = true;
  }, []);

  const reset_sync_state = useCallback(() => {
    backfill_doneRef.current = false;
    dispatch({ type: "RESET" });
  }, []);

  const check_for_new_mail = useCallback(() => {
    if (!account_id) return;
    dispatch({ type: "NEWFILL_SYNCING" });
    rpc.request(messages.sync_latest, { account_id })
      .then(() => dispatch({ type: "NEWFILL_COMPLETE" }))
      .catch(console.error);
  }, [account_id]);

  const reload_email_list = useCallback(() => {
    if (!account_id) return;
    fetch_all_local_emails(account_id).then((result) => {
      const grouped = group_emails_by_folder(result || []);
      setEmailsByFolder(grouped);
      const b = get_bounds(grouped);
      newestRef.current = b.newest;
      oldestRef.current = b.oldest;
      boundsSetRef.current = true;
      totalRef.current = (result || []).length;
      dispatch({ type: "UPDATE_TOTAL_EMAILS", total: totalRef.current });
    });
  }, [account_id, setEmailsByFolder]);

  const fetch_and_merge_newer = useCallback(() => {
    if (!account_id || !newestRef.current) { reload_email_list(); return; }
    rpc.request(messages.mail_list_up, { account_id, since: newestRef.current }).then((newEmails: EmailPreviewWire[]) => {
      if (!newEmails?.length) return;
      setEmailsByFolder((prev) => merge_emails(prev, newEmails));
      let n = newestRef.current;
      for (const e of newEmails) {
        if (e.received_at && (!n || e.received_at > n)) n = e.received_at;
      }
      newestRef.current = n;
      totalRef.current += newEmails.length;
      dispatch({ type: "UPDATE_TOTAL_EMAILS", total: totalRef.current });
    });
  }, [account_id, setEmailsByFolder, reload_email_list]);

  const fetch_and_merge_older = useCallback(() => {
    if (!account_id || !oldestRef.current) { reload_email_list(); return; }
    rpc.request(messages.mail_list_down, { account_id, before: oldestRef.current }).then((oldEmails: EmailPreviewWire[]) => {
      if (!oldEmails?.length) return;
      setEmailsByFolder((prev) => merge_emails(prev, oldEmails));
      let o = oldestRef.current;
      for (const e of oldEmails) {
        if (e.received_at && (!o || e.received_at < o)) o = e.received_at;
      }
      oldestRef.current = o;
      totalRef.current += oldEmails.length;
      dispatch({ type: "UPDATE_TOTAL_EMAILS", total: totalRef.current });
    });
  }, [account_id, rpc, setEmailsByFolder, reload_email_list]);

  // backfill messages
  useEffect(() => {
    if (!account_id) return;

    const flush = () => {
      debounceRef.current = null;
      fetch_and_merge_older();
    };

    const onStart = (payload: BackfillStartWire) => {
      dispatch({ type: "BACKFILL_START", total: payload.total, totalMessages: payload.totalMessages, resume: payload.resume });
    };

    const onProgress = (payload: BackfillProgressWire) => {
      dispatch({ type: "BACKFILL_PROGRESS", total: payload.total, totalMessages: payload.totalMessages ?? undefined });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, 500);
    };

    const onError = (payload: BackfillErrorWire) => {
      dispatch({ type: "BACKFILL_ERROR", error: payload.error ?? "Backfill failed" });
    };

    const onDone = (_payload: BackfillDoneWire) => {
      backfill_doneRef.current = true;
      dispatch({ type: "BACKFILL_DONE" });
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      fetch_and_merge_older();
    };

    rpc.addMessageListener(messages.sync_backfill_start, onStart);
    rpc.addMessageListener(messages.sync_backfill_progress, onProgress);
    rpc.addMessageListener(messages.sync_backfill_error, onError);
    rpc.addMessageListener(messages.sync_backfill_done, onDone);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      rpc.removeMessageListener(messages.sync_backfill_start, onStart);
      rpc.removeMessageListener(messages.sync_backfill_progress, onProgress);
      rpc.removeMessageListener(messages.sync_backfill_error, onError);
      rpc.removeMessageListener(messages.sync_backfill_done, onDone);
    };
  }, [account_id, fetch_and_merge_older]);

  // seed from persisted backfill state on mount (mid-backfill relaunch)
  useEffect(() => {
    if (!account_id) return;
    let cancelled = false;
    rpc.request(messages.sync_backfill_state, { account_id })
      .then((state: BackfillStateWire | null) => {
        if (cancelled) return;
        if (!state) return;
        if (state.backfill_done === 1) {
          backfill_doneRef.current = true;
          dispatch({ type: "BACKFILL_DONE" });
        } else if (state.backfill_status === "syncing" || state.backfill_next_page_token) {
          dispatch({
            type: "BACKFILL_START",
            total: state.backfill_fetched_total ?? 0,
            totalMessages: state.backfill_initial_total_messages,
            resume: !!state.backfill_next_page_token,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account_id]);

  // attachment metadata backfill (repairs `has_attachments` computed field)
  useEffect(() => {
    if (!account_id) return;

    const handler = (payload: AttachmentsMetaBackfillDoneWire) => {
      if (payload.account_id !== account_id) return;
      reload_email_list();
    };

    rpc.addMessageListener(messages.sync_attachments_meta_backfill_done, handler);
    return () => {
      rpc.removeMessageListener(messages.sync_attachments_meta_backfill_done, handler);
    };
  }, [account_id, rpc, reload_email_list]);

  // newfill messages
  useEffect(() => {
    if (!account_id) return;

    const handler = (payload: NewfillProgressWire) => {
      if (payload.state === "syncing") {
        dispatch({ type: "NEWFILL_SYNCING" });
      } else if (payload.state === "done") {
        dispatch({ type: "NEWFILL_COMPLETE" });
        if (payload.hasChanges) {
          fetch_and_merge_newer();
          if (payload.deletedIds?.length) {
            const ids = new Set(payload.deletedIds);
            setEmailsByFolder(prev => {
              const next: Record<string, EmailPreviewWire[]> = {};
              for (const [folder, list] of Object.entries(prev)) {
                next[folder] = (list as EmailPreviewWire[]).filter(e => !ids.has(e.id));
              }
              return next;
            });
          }
        }
      } else if (payload.state === "error") {
        dispatch({ type: "NEWFILL_ERROR" });
      }
    };

    rpc.addMessageListener(messages.sync_newfill_progress, handler);
    return () => {
      rpc.removeMessageListener(messages.sync_newfill_progress, handler);
    };
  }, [account_id, fetch_and_merge_newer]);

  return { state, check_for_new_mail, reset_sync_state, setPaginationAnchors };
}
