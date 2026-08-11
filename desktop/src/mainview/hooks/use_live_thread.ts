import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { currentMailViewAtom, currentThreadViewAtom, type ThreadViewEmail } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

const REFRESH_THROTTLE_MS = 2000;

export function useLiveThread() {
  const setCurrentThreadView = useSetAtom(currentThreadViewAtom);
  const setCurrentView = useSetAtom(currentMailViewAtom);
  const threadView = useAtomValue(currentThreadViewAtom);
  const currentView = useAtomValue(currentMailViewAtom);

  const threadViewRef = useRef(threadView);
  threadViewRef.current = threadView;
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;

  const lastRefreshRef = useRef<{ thread_id: string; at: number } | null>(null);

  const refresh_thread = useCallback((thread_id: string, opts?: { focus_id?: string; force?: boolean }) => {
    const now = Date.now();
    if (!opts?.force && lastRefreshRef.current?.thread_id === thread_id && now - lastRefreshRef.current.at < REFRESH_THROTTLE_MS) return;
    lastRefreshRef.current = { thread_id, at: now };

    rpc.request(messages.thread_previews, { thread_id })
      .then((previews: EmailPreviewWire[]) => {
        setCurrentThreadView((prev) => {
          if (!prev || prev.thread_id !== thread_id) return prev;
          const existing = new Map(prev.emails.map((te) => [te.email.id, te]));
          const emails: ThreadViewEmail[] = previews.map((p) => {
            const prior = existing.get(p.id);
            return { email: p, fullEmail: prior?.fullEmail ?? null };
          });
          let activeIndex = prev.activeIndex;
          if (opts?.focus_id) {
            const idx = emails.findIndex((te) => te.email.id === opts.focus_id);
            if (idx >= 0) activeIndex = idx;
          } else if (prev.activeIndex === -1) {
            activeIndex = -1;
          } else if (prev.activeIndex === prev.emails.length - 1 && emails.length > prev.emails.length) {
            activeIndex = emails.length - 1;
          }
          if (activeIndex !== -1) {
            activeIndex = Math.min(Math.max(activeIndex, 0), emails.length - 1);
          }
          return { ...prev, emails, activeIndex };
        });
      })
      .catch(() => {});
  }, [setCurrentThreadView]);

  useEffect(() => {
    const handler = (payload: DraftEmailSentWire) => {
      const tv = threadViewRef.current;
      const cv = currentViewRef.current;

      if (tv?.thread_id === payload.thread_id) {
        refresh_thread(payload.thread_id, { focus_id: payload.sent_message_id, force: true });
        return;
      }

      if (cv?.email?.thread_id === payload.thread_id) {
        rpc.request(messages.thread_previews, { thread_id: payload.thread_id })
          .then((previews: EmailPreviewWire[]) => {
            const emails: ThreadViewEmail[] = previews.map((p) => ({ email: p, fullEmail: null }));
            const activeIndex = emails.findIndex((te) => te.email.id === payload.sent_message_id);
            setCurrentView(null);
            setCurrentThreadView({
              thread_id: payload.thread_id,
              emails,
              activeIndex: activeIndex >= 0 ? activeIndex : emails.length - 1,
            });
          })
          .catch(() => {});
      }
    };

    rpc.addMessageListener(messages.draft_email_sent, handler);
    return () => rpc.removeMessageListener(messages.draft_email_sent, handler);
  }, [refresh_thread, setCurrentView, setCurrentThreadView]);

  useEffect(() => {
    const handler = (payload: NewfillProgressWire) => {
      if (payload.state !== "done" || !payload.hasChanges) return;
      const tv = threadViewRef.current;
      if (tv) refresh_thread(tv.thread_id);
    };

    rpc.addMessageListener(messages.sync_newfill_progress, handler);
    return () => rpc.removeMessageListener(messages.sync_newfill_progress, handler);
  }, [refresh_thread]);
}
