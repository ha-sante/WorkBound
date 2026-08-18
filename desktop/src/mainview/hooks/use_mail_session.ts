import { useCallback, useMemo } from "react";
import { useAtom } from "jotai";
import {
  currentMailViewAtom,
  composeMetaAtom,
  currentThreadViewAtom,
  currentScheduledViewAtom,
  create_default_compose_state,
  type ThreadViewEmail,
} from "../state";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";
import { useLiveThread } from "./use_live_thread";
import { use_compose_editor } from "./use_compose_editor";

export function use_mail_session(emails: EmailPreviewWire[]) {
  const [currentView, setCurrentView] = useAtom(currentMailViewAtom);
  const [currentCompose] = useAtom(composeMetaAtom);
  const [currentThreadView, setCurrentThreadView] = useAtom(currentThreadViewAtom);
  const [currentScheduledView, setCurrentScheduledView] = useAtom(currentScheduledViewAtom);
  const { open_fresh, close } = use_compose_editor();
  const isBackdropOpen = !!currentView || !!currentThreadView || !!currentScheduledView || currentCompose.phase !== "closed";

  useLiveThread();

  const currentIdx = useMemo(
    () => {
      const email_id = currentView?.email?.id;
      return email_id ? emails.findIndex((e) => e.id === email_id) : -1;
    },
    [emails, currentView?.email?.id],
  );
  const goPrev = useCallback(() => {
    if (currentIdx > 0) setCurrentView({ email: emails[currentIdx - 1], fullEmail: null });
  }, [emails, currentIdx, setCurrentView]);
  const goNext = useCallback(() => {
    if (currentIdx < emails.length - 1) setCurrentView({ email: emails[currentIdx + 1], fullEmail: null });
  }, [emails, currentIdx, setCurrentView]);

  const handleCompose = useCallback(() => {
    setCurrentView(null);
    open_fresh(create_default_compose_state("new"));
  }, [setCurrentView, open_fresh]);

  const handle_close_viewer = useCallback(() => {
    setCurrentView(null);
    setCurrentThreadView(null);
    setCurrentScheduledView(null);
    close();
  }, [setCurrentView, setCurrentThreadView, setCurrentScheduledView, close]);

  const handle_prev_email = useCallback(() => {
    if (currentThreadView) {
      setCurrentThreadView(prev => {
        if (!prev || prev.activeIndex <= 0) return prev;
        return { ...prev, activeIndex: prev.activeIndex - 1 };
      });
    } else {
      goPrev();
    }
  }, [currentThreadView, setCurrentThreadView, goPrev]);

  const handle_next_email = useCallback(() => {
    if (currentThreadView) {
      setCurrentThreadView(prev => {
        if (!prev || prev.activeIndex >= prev.emails.length - 1) return prev;
        return { ...prev, activeIndex: prev.activeIndex + 1 };
      });
    } else {
      goNext();
    }
  }, [currentThreadView, setCurrentThreadView, goNext]);

  const handle_reply = useCallback((mode: "reply" | "reply_all" | "forward") => {
    if (currentThreadView) {
      const te = currentThreadView.emails[currentThreadView.activeIndex];
      if (!te) return;
      const compose = (fullEmail: EmailRowWire | null) =>
        open_fresh(create_default_compose_state(mode, te.email, fullEmail));
      if (te.fullEmail) {
        compose(te.fullEmail);
        return;
      }
      rpc.request(messages.mail_get, { id: te.email.id })
        .then((fullEmail) => compose(fullEmail))
        .catch(() => compose(null));
      return;
    }
    if (currentView?.email) {
      open_fresh(create_default_compose_state(mode, currentView.email, currentView.fullEmail));
    }
  }, [currentThreadView, currentView, open_fresh]);

  const handleSelectEmail = useCallback((email: EmailPreviewWire) => {
    console.time(`email_open_${email.id.slice(0, 8)}`);
    console.timeLog(`email_open_${email.id.slice(0, 8)}`, `folder=${email.folder} subject=${email.subject?.slice(0, 40)}`);

    if (email.thread_message_count && email.thread_message_count > 1 && email.thread_id) {
      setCurrentView(null);
      close();
      rpc.request(messages.thread_previews, { thread_id: email.thread_id }).then((previews: EmailPreviewWire[]) => {
        const threadEmails = previews.map((p: EmailPreviewWire) => ({ email: p, fullEmail: null }));
        const activeIndex = threadEmails.findIndex((te: ThreadViewEmail) => te.email.id === email.id);
        setCurrentThreadView({
          thread_id: email.thread_id!,
          emails: threadEmails,
          activeIndex: activeIndex >= 0 ? activeIndex : threadEmails.length - 1,
        });
        console.timeEnd(`email_open_${email.id.slice(0, 8)}`);
      }).catch(() => {
        setCurrentView({ email, fullEmail: null });
        console.timeEnd(`email_open_${email.id.slice(0, 8)}`);
      });
      return;
    }

    if (email.folder === "drafts") {
      if (email.draft_mode && email.draft_mode !== "new" && email.original_email_id) {
        console.timeLog(`email_open_${email.id.slice(0, 8)}`, 'draft with original, fetching original...');
        rpc.request(messages.mail_get, { id: email.original_email_id }).then((res: any) => {
          if (res?.email) {
            const origPreview: EmailPreviewWire = {
              id: res.email.id,
              account_id: res.email.account_id,
              thread_id: res.email.thread_id,
              thread_message_count: null,
              subject: res.email.subject,
              from_name: res.email.from_name,
              from_address: res.email.from_address,
              toAddr: res.email.to,
              cc: res.email.cc,
              bcc: res.email.bcc,
              snippet: res.email.snippet,
              folder: res.email.folder,
              is_read: res.email.is_read,
              is_starred: res.email.is_starred,
              is_flagged: res.email.is_flagged,
              sent_at: res.email.sent_at,
              received_at: res.email.received_at,
              draft_mode: null,
              original_email_id: null,
            };
            setCurrentView(null);
            setCurrentThreadView(null);
            open_fresh(create_default_compose_state(email.draft_mode ?? "new", origPreview, res.email, email.id));
            console.timeEnd(`email_open_${email.id.slice(0, 8)}`);
          }
        }).catch(() => {});
      } else {
        setCurrentView(null);
        setCurrentThreadView(null);
        open_fresh(create_default_compose_state(email.draft_mode ?? "new", email, null, email.id));
        console.timeEnd(`email_open_${email.id.slice(0, 8)}`);
      }
    } else {
      setCurrentView({ email, fullEmail: null });
      setCurrentThreadView(null);
      close();
      console.timeEnd(`email_open_${email.id.slice(0, 8)}`);
    }
  }, [setCurrentView, open_fresh, setCurrentThreadView]);

  return {
    currentView,
    currentThreadView,
    currentCompose,
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
  };
}
