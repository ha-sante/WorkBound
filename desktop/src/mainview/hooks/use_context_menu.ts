import { useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { emailsByFolderAtom, copyToastAtom, messageToastAtom, notesAtom, savedFileToastAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { outbox_commands } from "@/shared/outbox_commands";
import { move_email_folder } from "./email_utils";
import { rpc } from "../rpc";

function find_one(
  map: Record<string, EmailPreviewWire[]>,
  id: string,
): EmailPreviewWire | undefined {
  for (const list of Object.values(map)) {
    const found = list.find((e) => e.id === id);
    if (found) return found;
  }
}

type EmailActionData = {
  email_id?: string;
  account_id?: string;
  folder?: string;
  is_read?: boolean;
  is_flagged?: boolean;
};

export function useContextMenu() {
  const setCopyToast = useSetAtom(copyToastAtom);
  const setMessageToast = useSetAtom(messageToastAtom);
  const setSavedFileToast = useSetAtom(savedFileToastAtom);
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const setNotes = useSetAtom(notesAtom);
  const emailsByFolder = useAtomValue(emailsByFolderAtom);

  const handleEmailAction = useCallback(
    (action: string, data: EmailActionData) => {
      const { email_id, account_id, folder: fromFolder } = data;
      if (!email_id || !account_id) return;

      const email = find_one(emailsByFolder, email_id);
      if (!email) return;

      const is_read = email.is_read === 1;
      const is_flagged = email.is_flagged === 1;

      let command: OutboxCommand = outbox_commands.label_update;
      let payload: Record<string, unknown> = {};
      let targetFolder = fromFolder ?? email.folder;
      const updates: Record<string, unknown> = {};

      switch (action) {
        case "toggle-read":
          command = is_read ? outbox_commands.mark_as_unread : outbox_commands.mark_as_read;
          payload = is_read
            ? { add_label_ids: ["UNREAD"], remove_label_ids: [] }
            : { add_label_ids: [], remove_label_ids: ["UNREAD"] };
          updates.is_read = is_read ? 0 : 1;
          break;

        case "toggle-important":
          command = outbox_commands.toggle_important;
          payload = is_flagged
            ? { add_label_ids: [], remove_label_ids: ["IMPORTANT"] }
            : { add_label_ids: ["IMPORTANT"], remove_label_ids: [] };
          updates.is_flagged = is_flagged ? 0 : 1;
          break;

        case "archive":
          command = outbox_commands.move_to_archive;
          payload = { add_label_ids: [], remove_label_ids: ["INBOX"] };
          targetFolder = "all";
          break;

        case "delete":
          command = outbox_commands.delete_email;
          payload = {};
          targetFolder = "bin";
          updates.is_read = 1;
          break;

        case "not-spam":
        case "restore":
          command = action === "not-spam" ? outbox_commands.move_to_inbox : outbox_commands.untrash;
          payload = action === "not-spam"
            ? { add_label_ids: ["INBOX"], remove_label_ids: ["SPAM", "UNREAD"] }
            : { add_label_ids: ["INBOX"], remove_label_ids: ["TRASH"] };
          targetFolder = "inbox";
          break;

        case "mark-spam":
        case "mark-phishing":
        case "block-sender":
          command = action === "mark-spam"
            ? outbox_commands.mark_as_spam
            : outbox_commands.mark_as_phishing;
          payload = { add_label_ids: ["SPAM"], remove_label_ids: ["INBOX", "UNREAD"] };
          targetFolder = "spam";
          break;

        default:
          return;
      }

      rpc.request(messages.outbox_enqueue, {
        account_id,
        command,
        payload: JSON.stringify(payload),
        extras: JSON.stringify({ email_id, providerMessageId: email_id }),
      }).catch((err: any) => console.error("[ctxMenu] outbox_enqueue", err));

      setEmailsByFolder((prev) =>
        move_email_folder(prev, email_id, fromFolder ?? email.folder, targetFolder, updates),
      );
    },
    [setEmailsByFolder, emailsByFolder],
  );

  useEffect(() => {
    const kill = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", kill, { capture: true });

    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.ownerDocument !== document) return;
      if (el.closest("[data-ctx]")) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text) {
        rpc.request(messages.context_menu_show, { kind: "text", x: e.clientX, y: e.clientY, quote_text: text });
      }
    };
    document.addEventListener("contextmenu", onCtx);

    const onAction = (payload: ContextMenuActionWire) => {
      try {
        if (payload.action === "copy-link" || payload.action === "copy-image-url") {
          const d = payload.data as { url?: string } | undefined;
          setCopyToast(d?.url || "Link copied");
          return;
        }
        if (payload.action === "copy-text") {
          const d = payload.data as { text?: string } | undefined;
          const text = d?.text || window.getSelection()?.toString().trim();
          if (text) setCopyToast(text);
          return;
        }

        if (payload.action === "open-link") {
          setMessageToast("Opened in your default browser");
          return;
        }

        if (payload.action === "download-image" || payload.action === "save-image") {
          const d = payload.data as { filename?: string; savedTo?: string; error?: string } | undefined;
          if (d?.error) {
            console.error("[ctxMenu]", payload.action, d.error);
            setMessageToast(payload.action === "save-image" ? "Failed to save image" : "Failed to download image");
          } else if (d?.filename && d?.savedTo) {
            setSavedFileToast({ filename: d.filename, path: d.savedTo });
          } else {
            const label = payload.action === "save-image" ? "Saved image" : "Downloaded image";
            setMessageToast(d?.filename ? `${label} - ${d.filename}` : label);
          }
          return;
        }

        if (["toggle-read", "archive", "delete", "not-spam", "restore", "toggle-important", "mark-spam", "mark-phishing", "block-sender"].includes(payload.action)) {
          const d = payload.data as EmailActionData | undefined;
          if (d) handleEmailAction(payload.action, d);
          return;
        }

        if (payload.action === "add-note") {
          const d = payload.data as (EmailActionData & { quote_text?: string }) | undefined;
          if (d?.email_id) {
            const content = d?.quote_text || window.getSelection()?.toString().trim();
            if (content) {
              rpc.request(messages.notes_create, { email_id: d.email_id, account_id: d.account_id, content }).then((note: any) => {
                setMessageToast(content ? `Note added - ${content}` : "Note added");
                setNotes((prev) => [note as NoteWire, ...prev]);
              }).catch((err: unknown) => console.error("notes:create", err));
            }
          }
          return;
        }

        if (payload.action === "add-link-note") {
          const d = payload.data as { url?: string; email_id?: string; account_id?: string } | undefined;
          if (d?.url) {
            rpc.request(messages.notes_create, { email_id: d.email_id, account_id: d.account_id, content: d.url }).then((note: any) => {
              setMessageToast(`Note added - ${d.url}`);
              setNotes((prev) => [note as NoteWire, ...prev]);
            }).catch((err: unknown) => console.error("notes:create", err));
          }
          return;
        }
      } catch (err) {
        console.error("context_menu:action error", err);
      }
    };
    rpc.addMessageListener(messages.context_menu_action, onAction);
    return () => {
      document.removeEventListener("contextmenu", kill, { capture: true });
      document.removeEventListener("contextmenu", onCtx);
      rpc.removeMessageListener(messages.context_menu_action, onAction);
    };
  }, [setCopyToast, setMessageToast, setSavedFileToast, handleEmailAction]);
}
