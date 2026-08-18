const DEBUG = false;

import { useState, useEffect, useRef, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { currentMailViewAtom, composeMetaAtom, currentThreadViewAtom, currentScheduledViewAtom, activeThreadScheduledItemAtom, create_default_compose_state, email_idsWithDraftsAtom, composeCanUndoAtom, composeCanRedoAtom, composeUndoAtom, composeRedoAtom, savedFileToastAtom, command_k_modal_open_atom, command_k_modal_request_atom } from "../state";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import EmailViewer from "./email_viewer";
import ScheduledViewer from "./scheduled_viewer";
import ThreadViewer from "./thread_viewer";
import ComposeEditor from "./compose_editor";
import MailViewerActionButtons from "./mail_viewer_action_buttons";
import MailViewerControlButtons from "./mail_viewer_control_buttons";
import MailComposerControlButtons from "./mail_composer_control_buttons";
import { use_email_actions } from "../hooks/use_email_actions";
import { use_compose_editor } from "../hooks/use_compose_editor";
import { use_reminders } from "../hooks/use_reminders";
import ScheduledMailControlButtons from "./scheduled_mail_control_buttons";

const VIEWER_FULL_VH = 85;
const COMPOSE_COMPACT_VH = 35;
const COMPOSE_EXPANDED_VH = 55;
const VIEWER_COMPOSE_GAP_VH = 1;
const COMPOSE_PADDING_TOP_PX = 56;
const THREAD_PADDING_TOP_PX = 24;

type Props = {
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onAction?: (email_id: string, action: string, value?: number) => void;
};

function MailBackdrop({ onClose, onPrev, onNext, onAction }: Props) {
  const [currentView, setCurrentView] = useAtom(currentMailViewAtom);
  const [currentCompose] = useAtom(composeMetaAtom);
  const [currentThreadView, setCurrentThreadView] = useAtom(currentThreadViewAtom);
  const [currentScheduledView] = useAtom(currentScheduledViewAtom);
  const { open_fresh, close } = use_compose_editor();
  const [overflowPx, setOverflowPx] = useState(0);
  const [composeCompact, setComposeCompact] = useState(false);
  const setSavedFileToast = useSetAtom(savedFileToastAtom);
  const set_command_open = useSetAtom(command_k_modal_open_atom);
  const set_command_request = useSetAtom(command_k_modal_request_atom);
  const viewerRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const threadWrapRef = useRef<HTMLDivElement>(null);
  const [threadRailTop, setThreadRailTop] = useState(0);
  const email = currentView?.email ?? currentCompose.email ?? null;
  const activeThreadTe = currentThreadView?.emails[currentThreadView.activeIndex] ?? null;
  const { items: reminders, refresh: refresh_reminders } = use_reminders(email?.account_id);
  const current_reminder = reminders.find(
    (item) => item.email_id === email?.id || (email?.thread_id && item.thread_id === email.thread_id),
  ) ?? null;
  const email_idsWithDrafts = useAtomValue(email_idsWithDraftsAtom);
  const hasReplyDraft = email ? email_idsWithDrafts.get(email.id)?.draft_mode === "reply" : false;
  const hasForwardDraft = email ? email_idsWithDrafts.get(email.id)?.draft_mode === "forward" : false;
  const composeCanUndo = useAtomValue(composeCanUndoAtom);
  const composeCanRedo = useAtomValue(composeCanRedoAtom);
  const composeUndo = useAtomValue(composeUndoAtom);
  const composeRedo = useAtomValue(composeRedoAtom);
  const mountLabel = `mailbackdrop:${email?.id?.slice(0, 8) ?? 'noemail'}`;

  const paddingTop = useMotionValue(COMPOSE_PADDING_TOP_PX);
  const springPad = useSpring(paddingTop, { damping: 28, stiffness: 300, mass: 0.8 });
  const padPx = useTransform(springPad, (v) => `${v}px`);

  useEffect(() => {
    DEBUG && console.log(`[${mountLabel}] mount`);
    return () => { DEBUG && console.log(`[${mountLabel}] unmount`); };
  }, []);

  useEffect(() => {
    const viewId = currentView?.email?.id;
    DEBUG && console.log(`[${mountLabel}] view email.id changed: ${viewId?.slice(0, 8) ?? 'none'}`);
    if (!viewId) return;
    close();
    setComposeCompact(false);
  }, [currentView?.email?.id]);

  const isComposeOpen = currentCompose.phase !== "closed";
  const reply_original = isComposeOpen && currentCompose.mode !== "new" ? currentCompose.email : null;
  const reply_original_shown =
    (currentView?.email?.id !== undefined && reply_original !== null && currentView.email.id === reply_original.id) ||
    (currentThreadView?.emails.some(te => reply_original !== null && te.email.id === reply_original.id) ?? false);
  const show_reply_original = reply_original !== null && !reply_original_shown;
  const reply_original_is_thread = show_reply_original && !!reply_original?.thread_id && (reply_original.thread_message_count ?? 0) > 1;
  const composeVh = isComposeOpen ? (composeCompact ? COMPOSE_COMPACT_VH : COMPOSE_EXPANDED_VH) : 0;
  const viewerVh = isComposeOpen ? (100 - composeVh - VIEWER_COMPOSE_GAP_VH - (COMPOSE_PADDING_TOP_PX / window.innerHeight) * 100) : VIEWER_FULL_VH;
  const threadVh = isComposeOpen ? (100 - composeVh - VIEWER_COMPOSE_GAP_VH - (THREAD_PADDING_TOP_PX / window.innerHeight) * 100) : VIEWER_FULL_VH;

  useEffect(() => {
    const update = () => {
      if (isComposeOpen) {
        paddingTop.set(COMPOSE_PADDING_TOP_PX);
        return;
      }
      const vh = window.innerHeight;
      const viewerHeight = vh * (VIEWER_FULL_VH / 100);
      const belowHeight = actionRef.current?.offsetHeight ?? 0;
      paddingTop.set(Math.max(0, (vh - viewerHeight - belowHeight) / 2));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [currentCompose]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) {
      DEBUG && console.log(`[height] viewerVh=${viewerVh} ref=null`);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    DEBUG && console.log(`[height] viewerVh=${viewerVh} rectHeight=${rect.height.toFixed(1)} csHeight=${cs.height} csMaxH=${cs.maxHeight} spring=${el.style.height}`);
  }, [viewerVh]);

  useEffect(() => {
    const el = composeRef.current;
    const parentEl = parentRef.current;
    const composeVhVal = isComposeOpen ? (composeCompact ? 35 : 55) : 0;
    DEBUG && console.log(`[height] compose composeVh=${composeVhVal} mode=${isComposeOpen} ref=${!!el} parentPB=${parentEl ? getComputedStyle(parentEl).paddingBottom : 'n/a'}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      DEBUG && console.log(`[height] compose rectHeight=${rect.height.toFixed(1)} csHeight=${cs.height}`);
    }
  }, [currentCompose, composeCompact]);

  const {
    starred,
    items,
    handle_menu_action,
    handle_starred_change,
  } = use_email_actions({
    email,
    onAction,
    onOptimisticStarChange: (newStarred) => {
      setCurrentView(prev => {
        if (!prev) return prev;
        return { ...prev, email: { ...prev.email, is_starred: newStarred ? 1 : 0 } };
      });
    },
    onSavedFileChange: setSavedFileToast,
  });

  const threadEmail = activeThreadTe?.email ?? null;
  const is_thread_first = !currentThreadView || currentThreadView.activeIndex <= 0;
  const is_thread_last = !currentThreadView || currentThreadView.activeIndex >= currentThreadView.emails.length - 1;

  const handle_thread_prev = () => {
    setCurrentThreadView(prev => {
      if (!prev || prev.activeIndex <= 0) return prev;
      return { ...prev, activeIndex: prev.activeIndex - 1 };
    });
  };

  const handle_thread_next = () => {
    setCurrentThreadView(prev => {
      if (!prev || prev.activeIndex >= prev.emails.length - 1) return prev;
      return { ...prev, activeIndex: prev.activeIndex + 1 };
    });
  };

  const handle_thread_card_move = useCallback((rect: { top: number; height: number }) => {
    const wrap = threadWrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const railHeight = 4 * 36 + 3 * 12;
    const rawTop = rect.top - wrapRect.top;
    const maxTop = wrapRect.height - railHeight;
    const clamped = maxTop > 0 ? Math.max(0, Math.min(rawTop, maxTop)) : Math.max(0, rawTop);
    setThreadRailTop(clamped);
  }, []);

  useEffect(() => {
    if (!show_reply_original || !reply_original_is_thread || currentThreadView) return;
    const orig = reply_original!;
    if (!orig.thread_id) return;
    rpc.request(messages.thread_previews, { thread_id: orig.thread_id })
      .then((previews: EmailPreviewWire[]) => {
        const threadEmails = previews.map((p: EmailPreviewWire) => ({ email: p, fullEmail: null }));
        const activeIndex = threadEmails.findIndex((te) => te.email.id === orig.id);
        setCurrentThreadView({
          thread_id: orig.thread_id!,
          emails: threadEmails,
          activeIndex: activeIndex >= 0 ? activeIndex : threadEmails.length - 1,
        });
      })
      .catch(() => {});
  }, [show_reply_original, reply_original_is_thread, reply_original, currentThreadView, setCurrentThreadView]);

  const ensure_thread_full_email = useCallback((mode: "reply" | "forward") => {
    if (!activeThreadTe) return;
    const compose = (fullEmail: EmailRowWire | null) =>
      open_fresh(create_default_compose_state(mode, activeThreadTe.email, fullEmail));
    if (activeThreadTe.fullEmail) {
      compose(activeThreadTe.fullEmail);
      return;
    }
    rpc.request(messages.mail_get, { id: activeThreadTe.email.id })
      .then((fullEmail) => compose(fullEmail))
      .catch(() => compose(null));
  }, [activeThreadTe, open_fresh]);

  const create_reminder = useCallback((reminder_email: EmailPreviewWire | null, remind_at: number) => {
    if (!reminder_email) return;
    const request = current_reminder
      ? rpc.request(messages.reminders_update, { id: current_reminder.id, account_id: reminder_email.account_id, remind_at })
      : rpc.request(messages.reminders_create, {
        account_id: reminder_email.account_id,
        email_id: reminder_email.id,
        thread_id: reminder_email.thread_id,
        remind_at,
      });
    request.then(() => refresh_reminders()).catch(() => {});
  }, [current_reminder, refresh_reminders]);

  const open_reminder_command = useCallback(() => {
    if (!email) return;
    set_command_request({
      mode: "reminder",
      account_id: email.account_id,
      email_id: email.id,
      thread_id: email.thread_id,
      reminder_id: current_reminder?.id,
    });
    set_command_open(true);
  }, [email, current_reminder, set_command_open, set_command_request]);

  const {
    items: threadItems,
    handle_menu_action: handle_thread_action,
    handle_starred_change: handle_thread_starred_change,
  } = use_email_actions({
    email: threadEmail,
    onAction,
    onOptimisticStarChange: (newStarred) => {
      setCurrentThreadView(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          emails: prev.emails.map(te =>
            te.email.id === threadEmail?.id
              ? { ...te, email: { ...te.email, is_starred: newStarred ? 1 : 0 } }
              : te
          ),
        };
      });
    },
    onSavedFileChange: setSavedFileToast,
  });

  const activeScheduledItem = useAtomValue(activeThreadScheduledItemAtom);
  if (!email && !isComposeOpen && !currentThreadView && !currentScheduledView) return null;

  const widthFactor = window.innerWidth < 900 ? 0.85 : 0.7;
  const sharedWidth = Math.min(700 + overflowPx, window.innerWidth * widthFactor);
  const composeWidth = isComposeOpen && (currentView || currentThreadView || show_reply_original) ? sharedWidth : Math.min(700, window.innerWidth * widthFactor);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <div
        ref={parentRef}
        className="flex-1 flex flex-col justify-start items-center min-h-0"
        // style={{ paddingBottom: `${composeVh}vh` }}
        onMouseDown={(e) => {
          DEBUG && console.log(`[${mountLabel}] backdrop mousedown target=${(e.target as HTMLElement)?.className?.slice(0, 50)} currentTarget=${(e.currentTarget as HTMLElement)?.className?.slice(0, 50)}`);
          if (e.target === e.currentTarget) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            DEBUG && console.log(`[${mountLabel}] backdrop click -> onClose`);
            onClose();
          }
        }}>
        {currentView && email && (
          <motion.div
            className="relative flex flex-col items-center pointer-events-none"
            style={{ width: sharedWidth, paddingTop: padPx }}>
            <motion.div ref={viewerRef} animate={{ height: `${viewerVh}vh` }} transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }} className="pointer-events-auto w-full bg-white/95 shadow-2xl border rounded-xl flex flex-col overflow-hidden">
              <EmailViewer
                email={email}
                onClose={onClose}
                onOverflowChange={setOverflowPx}
              />
            </motion.div>

            <div ref={actionRef}>
              {!isComposeOpen && currentView && (
                <MailViewerActionButtons
                  onReply={() => open_fresh(create_default_compose_state("reply", currentView.email, currentView.fullEmail))}
                  onForward={() => open_fresh(create_default_compose_state("forward", currentView.email, currentView.fullEmail))}
                  hasReplyDraft={hasReplyDraft}
                  hasForwardDraft={hasForwardDraft}
                  onRemindLater={(remind_at) => create_reminder(email, remind_at)}
                  reminder_at={current_reminder?.remind_at}
                  onOpenReminderCommand={open_reminder_command}
                />
              )}
            </div>

            <MailViewerControlButtons
              starred={starred}
              items={items}
              onAction={handle_menu_action}
              onPrev={onPrev}
              onNext={onNext}
              onStarredChange={handle_starred_change}
            />
          </motion.div>
        )}

        {currentScheduledView && (
          <motion.div
            className="relative flex flex-col items-center pointer-events-none"
            style={{ width: sharedWidth, paddingTop: padPx }}>
             <motion.div animate={{ height: `${viewerVh}vh` }} transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }} className="pointer-events-auto w-full bg-white/95 shadow-2xl border rounded-xl flex flex-col overflow-hidden">
               <ScheduledViewer onClose={onClose} />
             </motion.div>
             <ScheduledMailControlButtons item={currentScheduledView.item} />
           </motion.div>
         )}

        {show_reply_original && !reply_original_is_thread && (
          <motion.div
            className="relative flex flex-col items-center pointer-events-none"
            style={{ width: sharedWidth, paddingTop: padPx }}>
            <motion.div animate={{ height: `${viewerVh}vh` }} transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }} className="pointer-events-auto w-full bg-white/95 shadow-2xl border rounded-xl flex flex-col overflow-hidden">
              <EmailViewer
                email={reply_original!}
                onClose={onClose}
                onOverflowChange={setOverflowPx}
              />
            </motion.div>
          </motion.div>
        )}

        {currentThreadView && (
          <motion.div
            ref={threadWrapRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full max-w-[700px] mx-auto flex flex-col items-center pt-6 pointer-events-none">
            <ThreadViewer maxHeightVh={threadVh} compact={isComposeOpen} onActiveCardMove={handle_thread_card_move} />
            {activeThreadTe && (
              <div className={`pointer-events-auto ${isComposeOpen ? "hidden" : ""}`}>
                <MailViewerActionButtons
                  onReply={() => ensure_thread_full_email("reply")}
                  onForward={() => ensure_thread_full_email("forward")}
                  hasReplyDraft={activeThreadTe ? email_idsWithDrafts.get(activeThreadTe.email.id)?.draft_mode === "reply" : false}
                  hasForwardDraft={activeThreadTe ? email_idsWithDrafts.get(activeThreadTe.email.id)?.draft_mode === "forward" : false}
                  onRemindLater={(remind_at) => create_reminder(threadEmail, remind_at)}
                  reminder_at={current_reminder?.remind_at}
                  onOpenReminderCommand={open_reminder_command}
                />
                <MailViewerControlButtons
                  starred={threadEmail?.is_starred === 1}
                  items={threadItems}
                  onAction={handle_thread_action}
                  onPrev={is_thread_first ? undefined : handle_thread_prev}
                  onNext={is_thread_last ? undefined : handle_thread_next}
                  onStarredChange={handle_thread_starred_change}
                  top={threadRailTop}
                />
              </div>
            )}
            {activeScheduledItem && (
              !isComposeOpen && <ScheduledMailControlButtons item={activeScheduledItem} top={threadRailTop} />
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {(isComposeOpen && (currentView || currentThreadView || show_reply_original)) && (
          <motion.div
            ref={composeRef}
            key="compose-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }}
            className="fixed bottom-0 inset-x-0 flex justify-center pointer-events-none z-[60]">
            <div
              className="pointer-events-auto bg-white/95 rounded-t-xl shadow-[0_-8px_20px_rgba(0,0,0,0.1)] border border-b-0 relative"
              style={{ width: composeWidth, height: `${composeVh}vh` }}>
              <ComposeEditor
                onClose={close}
                onCloseAfterSend={onClose}
                onCompactChange={(c) => setComposeCompact(c)}
              />
              <MailComposerControlButtons
                canUndo={composeCanUndo}
                canRedo={composeCanRedo}
                onUndo={composeUndo.current}
                onRedo={composeRedo.current}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isComposeOpen && !currentView && !currentThreadView && !show_reply_original && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }}
          className="fixed bottom-0 inset-x-0 flex justify-center z-[60]">
          <div
            className="bg-white/95 rounded-t-xl shadow-[0_-8px_20px_rgba(0,0,0,0.1)] border border-b-0 relative"
             style={{ width: composeWidth, height: "55vh" }}>
            <ComposeEditor
              onClose={onClose}
              onCloseAfterSend={onClose}
              onCompactChange={() => {}}
            />
            <MailComposerControlButtons
              canUndo={composeCanUndo}
              canRedo={composeCanRedo}
              onUndo={composeUndo.current}
              onRedo={composeRedo.current}
            />
          </div>
        </motion.div>
      )}

    </div>
  );
}

export default MailBackdrop;
