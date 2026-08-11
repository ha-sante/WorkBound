const DEBUG = false;

import { useState, useEffect, useRef, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { currentMailViewAtom, currentMailComposeAtom, currentThreadViewAtom, CLOSED_COMPOSE_STATE, create_default_compose_state, email_idsWithDraftsAtom, composeCanUndoAtom, composeCanRedoAtom, composeUndoAtom, composeRedoAtom, savedFileToastAtom } from "../state";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import EmailViewer from "./email_viewer";
import ThreadViewer from "./thread_viewer";
import ComposeEditor from "./compose_editor";
import MailViewerActionButtons from "./mail_viewer_action_buttons";
import MailViewerControlButtons from "./mail_viewer_control_buttons";
import MailComposerControlButtons from "./mail_composer_control_buttons";
import { use_email_actions } from "../hooks/use_email_actions";

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
  const [currentCompose, setCurrentCompose] = useAtom(currentMailComposeAtom);
  const [currentThreadView, setCurrentThreadView] = useAtom(currentThreadViewAtom);
  const [overflowPx, setOverflowPx] = useState(0);
  const [composeCompact, setComposeCompact] = useState(false);
  const setSavedFileToast = useSetAtom(savedFileToastAtom);
  const viewerRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const threadWrapRef = useRef<HTMLDivElement>(null);
  const [threadRailTop, setThreadRailTop] = useState(0);
  const email = currentView?.email ?? currentCompose.email ?? null;
  const activeThreadTe = currentThreadView?.emails[currentThreadView.activeIndex] ?? null;
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
    setCurrentCompose(CLOSED_COMPOSE_STATE);
    setComposeCompact(false);
  }, [currentView?.email?.id]);

  const isComposeOpen = currentCompose.phase !== "closed";
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
    const clamped = Math.max(0, Math.min(rect.top - wrapRect.top, wrapRect.height - railHeight));
    setThreadRailTop(clamped);
  }, []);

  useEffect(() => {
    const wrap = threadWrapRef.current;
    if (!wrap) return;
    const activeEl = wrap.querySelector('[data-active="true"]');
    if (!activeEl) return;
    const rect = activeEl.getBoundingClientRect();
    handle_thread_card_move({ top: rect.top, height: rect.height });
  }, [isComposeOpen, handle_thread_card_move]);

  const ensure_thread_full_email = useCallback((mode: "reply" | "forward") => {
    if (!activeThreadTe) return;
    const compose = (fullEmail: EmailRowWire | null) =>
      setCurrentCompose(create_default_compose_state(mode, activeThreadTe.email, fullEmail));
    if (activeThreadTe.fullEmail) {
      compose(activeThreadTe.fullEmail);
      return;
    }
    rpc.request(messages.mail_get, { id: activeThreadTe.email.id })
      .then((fullEmail) => compose(fullEmail))
      .catch(() => compose(null));
  }, [activeThreadTe, setCurrentCompose]);

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

  if (!email && !isComposeOpen && !currentThreadView) return null;

  const widthFactor = window.innerWidth < 900 ? 0.85 : 0.7;
  const sharedWidth = Math.min(700 + overflowPx, window.innerWidth * widthFactor);
  const composeWidth = isComposeOpen && (currentView || currentThreadView) ? sharedWidth : Math.min(700, window.innerWidth * widthFactor);

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
                  onReply={() => setCurrentCompose(create_default_compose_state("reply", currentView.email, currentView.fullEmail))}
                  onForward={() => setCurrentCompose(create_default_compose_state("forward", currentView.email, currentView.fullEmail))}
                  hasReplyDraft={hasReplyDraft}
                  hasForwardDraft={hasForwardDraft}
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

        {currentThreadView && (
          <motion.div
            ref={threadWrapRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative w-full max-w-[700px] mx-auto flex flex-col items-center pt-6 pointer-events-none ${isComposeOpen ? "" : "my-auto"}`}>
            <ThreadViewer maxHeightVh={threadVh} compact={isComposeOpen} onActiveCardMove={handle_thread_card_move} />
            <div className={`pointer-events-auto ${isComposeOpen ? "hidden" : ""}`}>
              <MailViewerActionButtons
                onReply={() => ensure_thread_full_email("reply")}
                onForward={() => ensure_thread_full_email("forward")}
                hasReplyDraft={activeThreadTe ? email_idsWithDrafts.get(activeThreadTe.email.id)?.draft_mode === "reply" : false}
                hasForwardDraft={activeThreadTe ? email_idsWithDrafts.get(activeThreadTe.email.id)?.draft_mode === "forward" : false}
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
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {(isComposeOpen && (currentView || currentThreadView)) && (
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
                onClose={() => setCurrentCompose(CLOSED_COMPOSE_STATE)}
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

      {isComposeOpen && !currentView && !currentThreadView && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }}
          className="fixed bottom-0 inset-x-0 flex justify-center z-[60]">
          <div
            className="bg-white/95 rounded-t-xl shadow-[0_-8px_20px_rgba(0,0,0,0.1)] border border-b-0 relative"
            style={{ width: composeWidth, height: "85vh" }}>
            <ComposeEditor
              onClose={onClose}
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
