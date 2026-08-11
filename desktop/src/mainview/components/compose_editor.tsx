const DEBUG = false;

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { MdexEditor } from "./compose/editor/mdex";
import ReplyPreview from "./compose/editor/reply_preview";
import AttachmentChips from "./compose/editor/attachment_chips";
import { SOFT_LIMIT } from "./compose/editor/constants";
import { messages } from "@/shared/rpc_messages";
import { useAtomValue } from "jotai";
import { currentAccountIdAtom } from "../state";
import { parse_email_string } from "./compose/editor/contact_input";
import { useAtom, useSetAtom } from "jotai";
import { alertToastAtom, accountContactsAtom, currentMailComposeAtom, composeMailBodyAtom, composeSaveAtom, compose_actions_atom, signature_templatesAtom, signatureAssignmentsAtom } from "../state";
import ComposeHeader from "./compose/editor/header_bar";
import ComposeFromField from "./compose/editor/from_field";
import ComposeContactFields from "./compose/editor/contact_fields";
import ComposeSubjectField from "./compose/editor/subject_field";
import ComposeActionBar from "./compose/editor/action_bar";
import ComposeSentStatus from "./compose/editor/sent_status";
import SendingBar from "./compose/editor/sending_bar";
import SizeWarning from "./compose/editor/size_warning";
import ConflictPane from "./compose/editor/conflict_banner";
import { useDraftEmail } from "./compose/hooks/use_draft_email";
import { useAttachments } from "./compose/hooks/use_attachments";
import { findBestAliasMatch } from "../utils/contacts";
import { build_quote } from "../utils/quote";
import { rpc } from "../rpc";

type Props = {
  onClose: () => void;
  onCompactChange?: (compact: boolean) => void;
};

function ComposeEditor({ onClose, onCompactChange }: Props) {
  const account_id = useAtomValue(currentAccountIdAtom);
  const [composeState, setComposeState] = useAtom(currentMailComposeAtom);
  const setBodyState = useSetAtom(composeMailBodyAtom);
  const setAlertToast = useSetAtom(alertToastAtom);
  const setComposeSaveAtom = useSetAtom(composeSaveAtom);
  const setComposeActions = useSetAtom(compose_actions_atom);
  const [showPreview, setShowPreview] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [bodySize, setBodySize] = useState(0);
  const phase = composeState.phase;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef(50);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const userTypedRef = useRef(false);

  const computedQuoteText = useMemo(() => {
    if (composeState.mode === "new" || !composeState.email || !composeState.fullEmail) return "";
    return build_quote(composeState.email, composeState.fullEmail);
  }, [composeState.mode, composeState.email, composeState.fullEmail]);

  const { status, trigger_local_save, flush_to_backend, save_draft, send, discard, loadedDraftId, loadedQuoteText, resolveConflict, reloading, clearSendFlag } = useDraftEmail({
    account_id,
    initialMode: composeState.mode,
    email: composeState.email ?? undefined,
    quote_text: computedQuoteText,
    draft_id: composeState.draft_id ?? null,
    editorRef,
    setComposeState,
    onClose,
  });
  const quote_text = loadedQuoteText ?? computedQuoteText;
  const { remove_attachment, handle_pick_files, handle_attach_files, total_attachments_size } = useAttachments({ trigger_local_save, });

  const totalEstimatedSize = total_attachments_size + bodySize;
  const totalEstimatedSizeRef = useRef(totalEstimatedSize);
  totalEstimatedSizeRef.current = totalEstimatedSize;

  const handleBodyInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    const text = editorRef.current?.innerText || "";
    setBodyState({ body_html: html, body_text: text });
    setBodySize(new TextEncoder().encode(html).length);
    trigger_local_save();
  }, [trigger_local_save]);

  const handleSend = useCallback(async () => {
    if (totalEstimatedSizeRef.current > SOFT_LIMIT) {
      console.warn("[send] blocked — total size exceeds limit", { totalEstimatedSize: totalEstimatedSizeRef.current });
      return;
    }

    setComposeState(prev => ({ ...prev, phase: "sending" }));
    const result = await send();

    if (result.ok) {
      setComposeState(prev => ({ ...prev, phase: "sent", countdown: 50, outboxId: result.outboxId }));
      onCompactChange?.(true);
      countdownRef.current = 50;
      timerRef.current = setInterval(() => {
        countdownRef.current -= 1;
        setComposeState(prev => ({ ...prev, countdown: countdownRef.current }));
        if (countdownRef.current <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onClose();
        }
      }, 100);
    } else {
      if (result.error === "no_recipient") {
        setAlertToast({ message: "Recipient required", type: "error" });
      }
      setComposeState(prev => ({ ...prev, phase: "composing" }));
      onCompactChange?.(false);
    }
  }, [send, onClose, onCompactChange]);

  const handleSendLater = useCallback(async (scheduled_at: number) => {
    if (totalEstimatedSizeRef.current > SOFT_LIMIT) return;
    const result = await send(scheduled_at);
    if (result.ok) {
      onClose();
    } else {
      if (result.error === "no_recipient") {
        setAlertToast({ message: "Recipient required", type: "error" });
      }
    }
  }, [send, onClose]);

  const has_only_auto_content = useCallback((editor: HTMLElement | null) => {
    if (!editor) return true;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.textContent?.trim()) continue;
      let el: Node | null = node;
      let isAuto = false;
      while (el && el !== editor) {
        if (
          el instanceof HTMLElement &&
          (el.dataset.signature !== undefined || el.dataset.role === "quote-pill")
        ) {
          isAuto = true;
          break;
        }
        el = el.parentNode;
      }
      if (!isAuto) return false;
    }
    return true;
  }, []);

  const is_empty = useCallback(() => {
    if (userTypedRef.current) return false;
    if (composeState.toInput.trim()
      || composeState.ccInput.trim()
      || composeState.bccInput.trim()
      || composeState.attachments.length > 0) return false;
    return has_only_auto_content(editorRef.current);
  }, [composeState, has_only_auto_content]);

  const handleClose = useCallback(async () => {
    if (showPicker) {
      setShowPicker(false);
      return;
    }
    if (is_empty()) {
      discard();
      return;
    }
    await flush_to_backend();
    onClose();
  }, [flush_to_backend, onClose, is_empty, showPicker, discard]);

  const accountContacts = useAtomValue(accountContactsAtom);
  const signature_templates = useAtomValue(signature_templatesAtom);
  const signatureAssignments = useAtomValue(signatureAssignmentsAtom);

  const initialSignatureHtml = useMemo(() => {
    if (loadedDraftId || composeState.draft_id) { DEBUG && console.log("[sig] skip: draft"); return undefined; }
    if (!composeState.from_address) { DEBUG && console.log("[sig] skip: no from_address"); return undefined; }
    const alias = accountContacts.find(c => c.send_as_email === composeState.from_address || c.id === composeState.from_address);
    if (!alias) { DEBUG && console.log("[sig] skip: no alias match", composeState.from_address, accountContacts.length); return undefined; }
    const templateId = signatureAssignments[alias.id];
    if (!templateId) { DEBUG && console.log("[sig] skip: no assignment for", alias.id, alias.send_as_email); return undefined; }
    const template = signature_templates.find(t => t.id === templateId);
    if (!template?.body) { DEBUG && console.log("[sig] skip: no template body", templateId); return undefined; }
    DEBUG && console.log("[sig] inserting", template.name);
    return `<div data-signature="${template.id}" style="margin:8px 0">${template.body}</div>`;
  }, [loadedDraftId, composeState.draft_id, composeState.from_address, accountContacts, signature_templates, signatureAssignments]);

  useEffect(() => {
    if (!account_id) return;
    if ((loadedDraftId || composeState.draft_id) && composeState.from_address) return;
    if ((composeState.mode === "reply" || composeState.mode === "reply_all") && composeState.email && accountContacts.length > 0) {
      const rawTo = composeState.fullEmail?.to ?? composeState.email.toAddr;
      const rawCc = composeState.fullEmail?.cc ?? composeState.email.cc;
      const toEmails = parse_email_string(rawTo || "").map((e) => e.email.toLowerCase());
      const ccEmails = parse_email_string(rawCc || "").map((e) => e.email.toLowerCase());

      const result = findBestAliasMatch(accountContacts, toEmails, ccEmails);
      if (result) {
        setComposeState(prev => ({
          ...prev,
          from_address: result.match.send_as_email,
          from_name: result.match.display_name ?? "",
          is_domain_match: result.is_domain_match,
        }));
        return;
      }
    }

    const primary = accountContacts.find(c => c.is_primary);
    setComposeState(prev => ({
      ...prev,
      from_address: primary?.send_as_email ?? "",
      from_name: primary?.display_name ?? "",
      is_domain_match: false,
    }));
  }, [account_id, accountContacts, composeState.mode, composeState.email, composeState.fullEmail, loadedDraftId]);

  const draftStatus: "off" | "saving" | "saved" = status === "saving" ? "saving" : status === "saved" ? "saved" : "off";

  useEffect(() => {
    setComposeSaveAtom({ status: draftStatus, fn: save_draft });
  }, [draftStatus, save_draft, setComposeSaveAtom]);

  const handleUndo = useCallback(() => {
    clearSendFlag();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (composeState.outboxId) {
      rpc.request(messages.outbox_cancel, { id: composeState.outboxId }).catch(() => { });
    }
    setComposeState(prev => ({ ...prev, outboxId: null, phase: "composing", countdown: 50 }));
    countdownRef.current = 50;
    onCompactChange?.(false);
  }, [clearSendFlag, composeState.outboxId, onCompactChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const phase_ref = useRef(phase);
  phase_ref.current = phase;

  const latest_actions = useRef({ handleSend, handleSendLater, discard, handle_pick_files, handleClose, setShowPicker, handleUndo });
  latest_actions.current = { handleSend, handleSendLater, discard, handle_pick_files, handleClose, setShowPicker, handleUndo };

  useEffect(() => {
    const register = <A extends unknown[]>(guard: (p: string) => boolean, fn: (...args: A) => void) => (...args: A) => {
      if (guard(phase_ref.current)) fn(...args);
    };
    setComposeActions({
      send: register((p) => p === "composing", () => latest_actions.current.handleSend()),
      discard: register((p) => p === "composing", () => latest_actions.current.discard()),
      attach: register((p) => p === "composing", () => latest_actions.current.handle_pick_files()),
      close: register((p) => p === "composing" || p === "sent", () => latest_actions.current.handleClose()),
      send_later: register((p) => p === "composing", () => latest_actions.current.setShowPicker(true)),
      undo_send: register((p) => p === "sent", () => latest_actions.current.handleUndo()),
      send_at: register((p) => p === "composing", (ts: number) => latest_actions.current.handleSendLater(ts)),
    });
    return () => {
      setComposeActions({
        send: () => {}, discard: () => {}, attach: () => {}, close: () => {}, send_later: () => {}, undo_send: () => {}, send_at: () => {},
      });
    };
  }, [setComposeActions]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editorRef.current?.contains(e.target as Node)) {
        userTypedRef.current = true;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (status === "loading") {
    return (
      <div className="h-full flex flex-col">
        <ComposeHeader />
        <div className="flex-1 flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (phase === "conflicted") {
    return (
      <div className="h-full flex flex-col">
        <ComposeHeader />
        <ConflictPane
          reloading={reloading}
          onKeep={() => resolveConflict("keep")}
          onUseGmail={() => resolveConflict("load_gmail")}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ComposeHeader />
      <SendingBar visible={phase === "sending"} />
      <div className={`flex-1 flex flex-col min-h-0 relative ${phase === "sent" ? "hidden" : ""}`}>
        <div className="px-6 py-3 shrink-0 space-y-2">
          <ComposeFromField triggerLocalSave={trigger_local_save} />
          <ComposeContactFields triggerLocalSave={trigger_local_save} />
          <ComposeSubjectField triggerLocalSave={trigger_local_save} />
        </div>
        <div className="flex-1 min-h-0 px-6 overflow-y-auto">
          <MdexEditor
            quote_text={quote_text}
            editorRef={editorRef}
            onAttachFiles={handle_attach_files}
            onShowQuotePreview={() => setShowPreview((p) => !p)}
            onBodyInput={handleBodyInput}
            initialSignatureHtml={initialSignatureHtml}
          />
        </div>
        <ReplyPreview
          showPreview={showPreview}
          quote_text={quote_text}
          editorRef={editorRef}
          onClose={() => setShowPreview(false)}
        />
        <AttachmentChips attachments={composeState.attachments} onRemove={remove_attachment} />
        <SizeWarning />
        <ComposeActionBar
          onSend={handleSend}
          onSendLater={handleSendLater}
          onPickFiles={handle_pick_files}
          onClose={handleClose}
          showPicker={showPicker}
          onTogglePicker={() => setShowPicker((p) => !p)}
        />
      </div>
      <ComposeSentStatus onUndo={handleUndo} onClose={onClose} />
    </div>
  );
}

export default ComposeEditor;
