const DEBUG = false;

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { clientDraftsAtom, draftMutexAtom, draftCommittedPayloadAtom, accountContactsAtom, emailsByFolderAtom, currentMailComposeAtom, composeMailBodyAtom, composeDiscardAtom } from "../../../state";
import { messages } from "@/shared/rpc_messages";
import { outbox_commands } from "@/shared/outbox_commands";
import { parse_email_string } from "../editor/contact_input";
import { rpc } from "../../../rpc";

function has_draft_content(snap: ReturnType<typeof snapshot>): boolean {
  return !!(
    snap.to.trim() ||
    snap.cc.trim() ||
    snap.bcc.trim() ||
    snap.subject?.trim() ||
    snap.body_text?.trim() ||
    snap.attachments.length > 0
  );
}

function snapshot(s: MailComposeState, b: ComposeMailBody) {
  const typedTo = s.toInput.trim() ? parse_email_string(s.toInput) : [];
  const typedCc = s.ccInput.trim() ? parse_email_string(s.ccInput) : [];
  const typedBcc = s.bccInput.trim() ? parse_email_string(s.bccInput) : [];
  const allTo = [...s.toContacts, ...typedTo];
  const allCc = [...s.ccContacts, ...typedCc];
  const allBcc = [...s.bccContacts, ...typedBcc];
  const toStr = allTo.map((c) => c.email).join(", ");
  const result = {
    mode: s.mode,
    from_address: s.from_address,
    from_name: s.from_name,
    to: toStr,
    cc: allCc.map((c) => c.email).join(", "),
    bcc: allBcc.map((c) => c.email).join(", "),
    subject: s.subject,
    body_html: b.body_html,
    body_text: b.body_text,
    allTo,
    attachments: s.attachments,
  };
  return result;
}

export function useDraftEmail(params: UseDraftEmailParams) {
  const { account_id, initialMode, email, quote_text, 
    draft_id: initialDraftId, editorRef, setComposeState, onClose } = params;

  const account_id_ref = useRef(account_id);
  account_id_ref.current = account_id;

  const email_ref = useRef(email);
  email_ref.current = email;

  const quote_text_ref = useRef(quote_text);
  quote_text_ref.current = quote_text;

  const rpc_ref = useRef(rpc);
  rpc_ref.current = rpc;

  const on_close_ref = useRef(onClose);
  on_close_ref.current = onClose;

  const draft_id_ref = useRef<string | null>(initialDraftId ?? null);
  const gmail_draft_id_ref = useRef<string | null>(null);
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const draft_original_email_id_ref = useRef<string | null>(null);
  const is_loaded_ref = useRef(false);
  const compose_ready_ref = useRef(false);
  const flushing_ref = useRef(false);
  const discarded_ref = useRef(false);
  const dirty_ref = useRef(false);
  const active_ref = useRef(true);
  const loaded_gmail_message_id_ref = useRef<string | null>(null);
  const conflict_draft_ref = useRef<DraftWire | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conflictDraft, setConflictDraft] = useState<DraftWire | null>(null);
  const [reloading, setReloading] = useState(false);
  const [status, setStatus] = useState<DraftStatus>("loading");
  const [loadedQuoteText, setLoadedQuoteText] = useState<string | null>(null);
  const loaded_quote_text_ref = useRef(loadedQuoteText);
  loaded_quote_text_ref.current = loadedQuoteText;

  const composeState = useAtomValue(currentMailComposeAtom);
  const compose_ref = useRef(composeState);
  compose_ref.current = composeState;

  const bodyState = useAtomValue(composeMailBodyAtom);
  const body_ref = useRef(bodyState);
  body_ref.current = bodyState;

  const setBody = useSetAtom(composeMailBodyAtom);
  const setDrafts = useSetAtom(clientDraftsAtom);
  const drafts = useAtomValue(clientDraftsAtom);
  const drafts_ref = useRef(drafts);
  drafts_ref.current = drafts;
  const setMutex = useSetAtom(draftMutexAtom);

  const committed = useAtomValue(draftCommittedPayloadAtom);
  const accountContacts = useAtomValue(accountContactsAtom);
  const account_contacts_ref = useRef(accountContacts);
  account_contacts_ref.current = accountContacts;
  const emailsByFolder = useAtomValue(emailsByFolderAtom);

  const send_enqueued_ref = useRef(false);

  const getDraft = useCallback((id: string) => {
    return (drafts_ref.current as Record<string, any>)[id] ?? null;
  }, []);

  const saveDraft = useCallback((key: string, data: Record<string, unknown>) => {
    setDrafts((prev: Record<string, any>) => {
      const existing = prev[key] || {};
      return {
        ...prev,
        [key]: {
          ...existing,
          ...data,
          created_at: existing.created_at ?? data.created_at ?? Date.now(),
          updated_at: Date.now(),
        },
      };
    });
  }, [setDrafts]);

  const deleteDraft = useCallback((key: string) => {
    setDrafts((prev: Record<string, any>) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setDrafts]);

  const setMutexState = useCallback((id: string, state: "idle" | "flushing" | "checkpointing" | "sending" | "deleting") => {
    setMutex((prev: Record<string, any>) => ({ ...prev, [id]: state }));
  }, [setMutex]);

  const lsSave = useCallback(() => {
    if (!account_id_ref.current) return;
    if (discarded_ref.current) return;
    const s = compose_ref.current;
    const b = body_ref.current;
    if (!s) return;
    const snap = snapshot(s, b);
    if (!snap.from_address && account_contacts_ref.current.length > 0) {
      const primary = account_contacts_ref.current.find((c: any) => c.is_primary) ?? account_contacts_ref.current[0];
      snap.from_address = primary?.send_as_email ?? "";
      snap.from_name = primary?.display_name ?? "";
    }
    if (!draft_id_ref.current && !snap.to.trim() && !snap.cc.trim() && !snap.bcc.trim() && !snap.body_text.trim()) return;
    if (!draft_id_ref.current) {
      draft_id_ref.current = crypto.randomUUID();
    }

    const emailKey = draft_original_email_id_ref.current || email_ref.current?.id || `__new__`;
    const existing = getDraft(emailKey);
    const entry = {
      id: draft_id_ref.current,
      account_id: account_id_ref.current,
      mode: snap.mode,
      from_address: snap.from_address,
      from_name: snap.from_name,
      to: snap.to,
      cc: snap.cc,
      bcc: snap.bcc,
      subject: snap.subject,
      body_html: snap.body_html,
      body_text: snap.body_text,
      attachments: snap.attachments.map((a: DraftAttachment) => ({ ...a, committed: false })),
      status: "draft",
      gmail_draft_id: gmail_draft_id_ref.current,
      gmail_message_id: existing?.gmail_message_id || undefined,
      thread_id: existing?.thread_id || undefined,
      flushedAt: existing?.flushedAt || undefined,
      original_email_id: draft_original_email_id_ref.current || undefined,
      created_at: existing?.created_at || Date.now(),
      updated_at: Date.now(),
    };

    setEmailsByFolder(prev => {
      const drafts = prev.drafts || [];
      const idx = drafts.findIndex((e: any) => e.id === entry.id);
      const preview: EmailPreviewWire = {
        id: entry.id,
        account_id: entry.account_id || "",
        thread_id: null,
        thread_message_count: null,
        subject: entry.subject,
        from_name: entry.from_name,
        from_address: entry.from_address,
        toAddr: entry.to,
        cc: entry.cc,
        bcc: entry.bcc,
        snippet: snap.body_text?.slice(0, 100) || null,
        folder: "drafts",
        is_read: 1,
        is_starred: 0,
        is_flagged: 0,
        sent_at: null,
        received_at: new Date().toISOString(),
        draft_mode: snap.mode,
        original_email_id: draft_original_email_id_ref.current || null,
      };
      if (idx >= 0) {
        const updated = [...drafts];
        updated[idx] = { ...updated[idx], ...preview };
        return { ...prev, drafts: updated };
      }
      return { ...prev, drafts: [preview, ...drafts] };
    });
  }, [saveDraft, getDraft, setEmailsByFolder]);

  const flushBackend = useCallback(async (force?: boolean) => {
    if (!account_id_ref.current) return;
    if (!is_loaded_ref.current && !draft_id_ref.current) return;

    const s = compose_ref.current;
    const b = body_ref.current;
    if (!s) return;
    const snap = snapshot(s, b);
    if (!snap.from_address && account_contacts_ref.current.length > 0) {
      const primary = account_contacts_ref.current.find((c: any) => c.is_primary) ?? account_contacts_ref.current[0];
      snap.from_address = primary?.send_as_email ?? "";
      snap.from_name = primary?.display_name ?? "";
    }
    if (!has_draft_content(snap)) return;

    if (flushing_ref.current) return;
    flushing_ref.current = true;

    if (!draft_id_ref.current) {
      draft_id_ref.current = crypto.randomUUID();
    }

    const draft_id = draft_id_ref.current;
    const emailKey = draft_original_email_id_ref.current || email_ref.current?.id || `__new__`;
    setMutexState(draft_id, "flushing");

    try {
      const existing = getDraft(emailKey);
      try {
        saveDraft(emailKey, {
          id: draft_id,
          account_id: account_id_ref.current,
          mode: snap.mode,
          from_address: snap.from_address,
          from_name: snap.from_name,
          to: snap.to,
          cc: snap.cc,
          bcc: snap.bcc,
          subject: snap.subject,
          body_html: snap.body_html,
          body_text: snap.body_text,
          attachments: snap.attachments.map((a: DraftAttachment) => ({ ...a, committed: false })),
          status: "draft",
          gmail_draft_id: gmail_draft_id_ref.current,
          gmail_message_id: existing?.gmail_message_id || undefined,
          thread_id: existing?.thread_id || undefined,
          flushedAt: existing?.flushedAt || undefined,
          original_email_id: draft_original_email_id_ref.current || undefined,
          created_at: existing?.created_at || Date.now(),
          updated_at: Date.now(),
        });
      } catch { console.warn("[draft] local save failed"); }

      const original_email_id = draft_original_email_id_ref.current || (snap.mode !== "new" ? email_ref.current?.id : undefined);
      const draftSaveParams = {
        id: draft_id,
        account_id: account_id_ref.current,
        mode: snap.mode,
        to: snap.to,
        cc: snap.cc || undefined,
        bcc: snap.bcc || undefined,
        subject: snap.subject,
        body_html: snap.body_html,
        body_text: snap.body_text,
        from_address: snap.from_address || undefined,
        from_name: snap.from_name || undefined,
        original_email_id,
        quote_text: quote_text_ref.current || undefined,
        lastGmailMessageId: loaded_gmail_message_id_ref.current ?? undefined,
        force,
        attachments: snap.attachments,
      };
      DEBUG && console.log("[draft:flush] " + JSON.stringify(draftSaveParams));
      const result = await rpc_ref.current.request(messages.draft_save, draftSaveParams);

      if (result?.conflict) {
        DEBUG && console.log("[draft:flush] conflict id=" + draft_id + " — stashing server version");
        try {
          const fresh = await rpc_ref.current.request(messages.draft_get, { id: draft_id }) as DraftWire | null;
          DEBUG && console.log("[draft:flush] conflict fresh=", fresh ? "non-null gmail_message_id=" + fresh.gmail_message_id : "null");
          if (fresh) {
            conflict_draft_ref.current = fresh;
            setConflictDraft(fresh);
            setComposeState(prev => ({ ...prev, phase: "conflicted" }));
          }
        } catch { console.warn("[draft] failed to fetch fresh draft after conflict"); }
        return result;
      }

      if (result?.id) {
        const oldId = draft_id_ref.current;
        draft_id_ref.current = result.id;

        const preview: EmailPreviewWire = {
          id: result.id,
          account_id: account_id_ref.current || "",
          thread_id: null,
          thread_message_count: null,
          subject: snap.subject,
          from_name: snap.from_name,
          from_address: snap.from_address,
          toAddr: snap.to,
          cc: snap.cc,
          bcc: snap.bcc,
          snippet: snap.body_text?.slice(0, 100) || null,
          folder: "drafts",
          is_read: 1,
          is_starred: 0,
          is_flagged: 0,
          sent_at: null,
          received_at: new Date().toISOString(),
          draft_mode: snap.mode,
          original_email_id: draft_original_email_id_ref.current || null,
        };
        setEmailsByFolder(prev => {
          let drafts = prev.drafts || [];
          if (oldId !== result.id) {
            drafts = drafts.filter((e: any) => e.id !== oldId);
          }
          const idx = drafts.findIndex((e: any) => e.id === result.id);
          if (idx >= 0) {
            const updated = [...drafts];
            updated[idx] = { ...updated[idx], ...preview };
            return { ...prev, drafts: updated };
          }
          return { ...prev, drafts: [preview, ...drafts] };
        });
      }

      try {
        saveDraft(emailKey, {
          attachments: snap.attachments.map((a: DraftAttachment) => ({ ...a, committed: true })),
          flushedAt: Date.now(),
          gmail_draft_id: gmail_draft_id_ref.current,
          updated_at: Date.now(),
        });
      } catch { console.warn("[draft] failed to save local storage after flush"); }

      return result;
    } catch (err) {
      setMutexState(draft_id, "idle");
      throw err;
    } finally {
      flushing_ref.current = false;
      setMutexState(draft_id, "idle");
    }
  }, [saveDraft, getDraft, setMutexState]);

  const loadDraft = useCallback(async (draft_id: string) => {
    const draft = await rpc_ref.current.request(messages.draft_get, { id: draft_id }) as DraftWire | null;
    if (!draft) return null;
    draft_id_ref.current = draft.id;
    if (draft.gmail_draft_id) {
      gmail_draft_id_ref.current = draft.gmail_draft_id;
    }
    setComposeState(prev => ({
      ...prev,
      ...(draft.mode ? { mode: draft.mode } : {}),
      from_address: draft.from_address ?? "",
      from_name: draft.from_name ?? "",
      ...(draft.subject ? { subject: draft.subject } : {}),
      toContacts: parse_email_string(draft.to || ""),
      ccContacts: parse_email_string(draft.cc || ""),
      bccContacts: parse_email_string(draft.bcc || ""),
      showCc: !!draft.cc,
      showBcc: !!draft.bcc,
      attachments: draft.attachments
        ? draft.attachments.map((a: any) => ({
            id: a.id,
            name: a.filename,
            mime_type: a.mime_type || "application/octet-stream",
            data: a.data || "",
            local_path: a.local_path,
            size: a.size || 0,
          }))
        : prev.attachments,
    }));
    if (draft.body_html) {
      if (editorRef.current) editorRef.current.innerHTML = draft.body_html;
    }
    setBody({
      body_html: draft.body_html || "",
      body_text: draft.body_text || "",
    });
    draft_original_email_id_ref.current = draft.original_email_id || null;
    loaded_gmail_message_id_ref.current = draft.gmail_message_id || null;
    if (draft.quote_text) {
      setLoadedQuoteText(draft.quote_text);
    }
    return draft;
  }, [editorRef, setComposeState, setBody, setLoadedQuoteText]);

  const resolveConflict = useCallback(async (choice: 'keep' | 'load_gmail') => {
    const fresh = conflict_draft_ref.current;
    if (!fresh) {
      setConflictDraft(null);
      return;
    }
    conflict_draft_ref.current = null;
    setConflictDraft(null);
    if (choice === 'keep') {
      setComposeState(prev => ({ ...prev, phase: "composing" }));
      flushBackend(true);
    } else {
      setReloading(true);
      try {
        setComposeState(prev => ({
          ...prev,
          ...(fresh.mode ? { mode: fresh.mode as DraftMode } : {}),
          from_address: fresh.from_address ?? "",
          from_name: fresh.from_name ?? "",
          ...(fresh.subject ? { subject: fresh.subject } : {}),
          toContacts: parse_email_string(fresh.to || ""),
          ccContacts: parse_email_string(fresh.cc || ""),
          bccContacts: parse_email_string(fresh.bcc || ""),
          showCc: !!fresh.cc,
          showBcc: !!fresh.bcc,
          attachments: fresh.attachments
            ? fresh.attachments.map((a: any) => ({
                id: a.id,
                name: a.filename,
                mime_type: a.mime_type || "application/octet-stream",
                data: a.data || "",
                local_path: a.local_path,
                size: a.size || 0,
              }))
            : prev.attachments,
        }));
        setBody({
          body_html: fresh.body_html || "",
          body_text: fresh.body_text || "",
        });
        loaded_gmail_message_id_ref.current = fresh.gmail_message_id || null;
        setComposeState(prev => ({ ...prev, phase: "composing" }));
      } finally {
        setReloading(false);
      }
    }
  }, [setComposeState, setBody, flushBackend]);

  const trigger_local_save = useCallback(() => {
    DEBUG && console.log("[draft:trigger_local_save]");
    if (!compose_ready_ref.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    dirty_ref.current = true;
    setStatus("saving");
    lsSave();
    setStatus("saved");
    saveTimerRef.current = setTimeout(() => setStatus("loaded"), 500);
  }, [lsSave]);

  const send = useCallback(async (scheduled_at?: number): Promise<SendResult> => {
    if (!is_loaded_ref.current) return { ok: false, error: "not_loaded" };
    if (!account_id_ref.current) return { ok: false, error: "no_account" };

    const s = compose_ref.current;
    const b = body_ref.current;
    if (!s) return { ok: false, error: "no_state" };
    const snap = snapshot(s, b);
    if (snap.allTo.length === 0) return { ok: false, error: "no_recipient" };

    if (!scheduled_at) setStatus("sending");

    const effectiveQuote = loaded_quote_text_ref.current || quote_text_ref.current || "";
    const fullHtml = effectiveQuote ? snap.body_html + effectiveQuote.replace(/\n/g, "<br>") : snap.body_html;
    const fullText = effectiveQuote ? snap.body_text + "\n" + effectiveQuote : snap.body_text;

    if (draft_id_ref.current) {
      setMutexState(draft_id_ref.current, "sending");
    }

    try {
      const original_email_id = (snap.mode === "reply" || snap.mode === "reply_all") ? (draft_original_email_id_ref.current || email_ref.current?.id) : undefined;

      if (gmail_draft_id_ref.current) {
        await rpc_ref.current.request(messages.outbox_enqueue, {
          account_id: account_id_ref.current,
          command: outbox_commands.draft_delete,
          payload: JSON.stringify({
            draft_id: draft_id_ref.current,
            gmail_draft_id: gmail_draft_id_ref.current,
          }),
        }).catch(() => {});
      }

      const { id: outboxId } = await rpc_ref.current.request(messages.outbox_enqueue, {
        account_id: account_id_ref.current,
        command: outbox_commands.send_email,
        scheduled_at,
        payload: JSON.stringify({
          to: snap.to,
          cc: snap.cc || undefined,
          bcc: snap.bcc || undefined,
          subject: snap.subject,
          body_html: fullHtml,
          body_text: fullText,
          from_address: snap.from_address || undefined,
          from_name: snap.from_name || undefined,
          attachments: snap.attachments.length > 0 ? snap.attachments : undefined,
          draft_id: draft_id_ref.current,
          original_email_id,
        }),
      });

      send_enqueued_ref.current = true;
      setStatus("loaded");
      return { ok: true, outboxId };
    } catch (err) {
      if (draft_id_ref.current) setMutexState(draft_id_ref.current, "idle");
      setStatus("loaded");
      return { ok: false, error: String(err) };
    }
  }, [deleteDraft, setMutexState]);

  const discard = useCallback(async () => {
    discarded_ref.current = true;
    const id = draft_id_ref.current;
    const emailKey = draft_original_email_id_ref.current || email_ref.current?.id;
    if (id) {
      setMutexState(id, "deleting");
      if (emailKey) deleteDraft(emailKey);
      try {
        await rpc_ref.current.request(messages.draft_delete, { id });
      } catch { console.warn("[draft] delete failed"); }
      setEmailsByFolder(prev => {
        const drafts = (prev.drafts || []).filter((e: any) => e.id !== id);
        return { ...prev, drafts };
      });
      draft_id_ref.current = null;
      gmail_draft_id_ref.current = null;
      setMutexState(id, "idle");
    }
    on_close_ref.current();
  }, [deleteDraft, setMutexState, setEmailsByFolder]);

  const flush_to_backend = useCallback(async (force?: boolean) => {
    DEBUG && console.log("[draft:flush_to_backend] called", { force, draft_id: draft_id_ref.current });
    if (!draft_id_ref.current) return;
    lsSave();
    const s = compose_ref.current;
    if (!s) return;
    const snap = snapshot(s, body_ref.current);
    if (has_draft_content(snap)) {
      try {
        await flushBackend(force);
        dirty_ref.current = false;
        return;
      } catch (e) {
        console.error("[draft] flush_to_backend failed, saving locally", e);
      }
    }
  }, [flushBackend, lsSave]);

  const save_draft = useCallback(async () => {
    setStatus("saving");
    try {
      await flush_to_backend(true);
      setStatus("saved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setStatus("loaded"), 500);
    } catch (e) {
      console.error("[draft] save failed", e);
      setStatus("loaded");
    }
  }, [flush_to_backend]);

  useEffect(() => {
    active_ref.current = true;
    return () => { active_ref.current = false; };
  }, []);

  useEffect(() => {
    if (committed) {
      const ourOriginalEmailId = draft_original_email_id_ref.current;
      const matchesDraftId = committed.draft_id === draft_id_ref.current;
      const matchesOriginalEmailId = ourOriginalEmailId && committed.original_email_id === ourOriginalEmailId;
      if (matchesDraftId || matchesOriginalEmailId) {
        gmail_draft_id_ref.current = committed.gmail_draft_id;
        if (committed.gmail_message_id) {
          loaded_gmail_message_id_ref.current = committed.gmail_message_id;
        }
      }
    }
  }, [committed]);

  useEffect(() => {
    const rpc = rpc_ref.current;
    if (!rpc) return;
    let lastEventTime = 0;
    const handler = (payload: { id: string }) => {
      DEBUG && console.log("[external_modified] event id=" + payload.id + " draft_id_ref=" + draft_id_ref.current + " loadedMsgId=" + loaded_gmail_message_id_ref.current);
      if (payload.id !== draft_id_ref.current) {
        DEBUG && console.log("[external_modified] skipped — id mismatch");
        return;
      }
      const now = Date.now();
      if (now - lastEventTime < 30000) {
        DEBUG && console.log("[external_modified] skipped — throttle (" + (now - lastEventTime) + "ms since last)");
        return;
      }
      lastEventTime = now;
      rpc.request(messages.draft_get, { id: payload.id }).then((fresh: DraftWire | null) => {
        DEBUG && console.log("[external_modified] draft_get returned gmail_message_id=" + (fresh?.gmail_message_id ?? "null") + " loaded_gmail_message_id_ref=" + loaded_gmail_message_id_ref.current);
        if (fresh && fresh.gmail_message_id && fresh.gmail_message_id !== loaded_gmail_message_id_ref.current) {
          DEBUG && console.log("[external_modified] TRIGGERING CONFLICT — gmail_message_id changed to " + fresh.gmail_message_id);
          loaded_gmail_message_id_ref.current = fresh.gmail_message_id;
          conflict_draft_ref.current = fresh;
          setConflictDraft(fresh);
          setComposeState(prev => ({ ...prev, phase: "conflicted" }));
        } else {
          DEBUG && console.log("[external_modified] NOT triggering conflict — gmail_message_id same or null");
        }
      }).catch(() => {});
    };
    rpc.addMessageListener(messages.draft_externally_modified, handler);
    return () => rpc.removeMessageListener(messages.draft_externally_modified, handler);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      flush_to_backend(true).catch(console.error);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flush_to_backend]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      active_ref.current = false;
      if (dirty_ref.current && draft_id_ref.current && !discarded_ref.current) {
        const s = compose_ref.current;
        const b = body_ref.current;
        if (s) {
          const snap = snapshot(s, b);
          const draft_id = draft_id_ref.current;
          const original_email_id = draft_original_email_id_ref.current || (snap.mode !== "new" ? email_ref.current?.id : undefined);
          const payload = {
            id: draft_id,
            account_id: account_id_ref.current,
            mode: snap.mode,
            to: snap.to,
            cc: snap.cc || undefined,
            bcc: snap.bcc || undefined,
            subject: snap.subject,
            body_html: snap.body_html,
            body_text: snap.body_text,
            from_address: snap.from_address || undefined,
            from_name: snap.from_name || undefined,
            original_email_id,
            quote_text: loaded_quote_text_ref.current || quote_text_ref.current || undefined,
            lastGmailMessageId: loaded_gmail_message_id_ref.current ?? undefined,
            force: true,
            attachments: snap.attachments,
          } as any;
          rpc_ref.current.request(messages.draft_save, payload).then(() => {
            dirty_ref.current = false;
          }).catch((e: any) => {
            console.error("[draft] unmount flush failed", e);
          });
        }
      }
      setBody({ body_html: "", body_text: "" });
      if (send_enqueued_ref.current) {
        const emailKey = draft_original_email_id_ref.current || email_ref.current?.id;
        if (emailKey) deleteDraft(emailKey);
      }
    };
  }, [setBody, deleteDraft]);

  const [resolvedDraftId, setResolvedDraftId] = useState<string | null>(initialDraftId ?? null);

  const pendingDraftId = useMemo(() => {
    if (initialDraftId) return initialDraftId;
    if (initialMode === "new" || !email || !account_id) return null;
    const folderDrafts = emailsByFolder["drafts"] || [];
    const match = folderDrafts.find(
      (e: EmailPreviewWire) => e.original_email_id === email.id && e.draft_mode === initialMode
    );
    if (match) return match.id;
    return null;
  }, [initialDraftId, email?.id, initialMode, account_id, emailsByFolder]);

  useEffect(() => {
    if (initialDraftId) {
      setResolvedDraftId(initialDraftId);
      return;
    }
    if (initialMode === "new" || !email || !account_id) {
      is_loaded_ref.current = true;
      setStatus("loaded");
      return;
    }

    if (is_loaded_ref.current) return;

    if (!pendingDraftId) {
      draft_original_email_id_ref.current = email.id;
      is_loaded_ref.current = true;
      setStatus("loaded");
      return;
    }

    setResolvedDraftId(pendingDraftId);
  }, [initialDraftId, pendingDraftId]);

  useEffect(() => {
    if (compose_ready_ref.current) return;
    if (initialMode === "new" || !email || !account_id) {
      compose_ready_ref.current = true;
      return;
    }
    if (initialDraftId || pendingDraftId) {
      if (is_loaded_ref.current) {
        compose_ready_ref.current = true;
      }
      return;
    }
    if (accountContacts.length > 0 && composeState.from_address) {
      compose_ready_ref.current = true;
    }
  }, [composeState.from_address, accountContacts, initialDraftId, pendingDraftId, initialMode, email?.id, account_id, is_loaded_ref.current]);

  useEffect(() => {
    if (!resolvedDraftId) return;
    if (is_loaded_ref.current && resolvedDraftId === draft_id_ref.current) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft(resolvedDraftId);
        if (cancelled) return;
        if (!draft) {
          is_loaded_ref.current = true;
          setStatus("loaded");
          return;
        }
        is_loaded_ref.current = true;
        setStatus("loaded");
      } catch (e) {
        console.error("[draft] load failed", e);
        is_loaded_ref.current = true;
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedDraftId, loadDraft]);

  const clearSendFlag = useCallback(() => { send_enqueued_ref.current = false; }, []);

  const hasDraft = !!pendingDraftId;
  const setDiscardAtom = useSetAtom(composeDiscardAtom);

  useEffect(() => {
    setDiscardAtom({ show: true, fn: discard });
  }, [discard, setDiscardAtom]);

  return {
    status,
    trigger_local_save,
    flush_to_backend,
    save_draft,
    send,
    discard,
    loadedDraftId: pendingDraftId,
    hasDraft,
    loadedQuoteText,
    conflictDraft,
    resolveConflict,
    reloading,
    clearSendFlag,
  };
}
