import { useCallback, useEffect, useMemo, useRef } from "react";
import { messages } from "@/shared/rpc_messages";
import { useAlertToast } from "../hooks/use_alert_toast";
import { type MenuItem } from "../components/mail_viewer_control_buttons";
import { MailCheck, Flag, Archive, ShieldAlert, ShieldOff, UserX, Download, Trash2, Inbox, RotateCcw } from "lucide-react";
import { rpc } from "../rpc";
import { enqueue_email_action } from "./email_actions";

const folderMenus: Record<string, MenuItem[]> = {
  inbox: [
    { type: "action", label: "", Icon: MailCheck, action: "toggle-read" },
    { type: "action", label: "", Icon: Flag, action: "toggle-important" },
    { type: "separator" },
    { type: "action", label: "Mark as Spam", Icon: ShieldAlert, action: "mark-spam" },
    { type: "action", label: "Mark as Phishing", Icon: ShieldOff, action: "mark-phishing" },
    { type: "action", label: "Block Sender", Icon: UserX, action: "block-sender" },
    { type: "separator" },
    { type: "action", label: "Download Message", Icon: Download, action: "download" },
    { type: "separator" },
    { type: "action", label: "Archive Message", Icon: Archive, action: "archive" },
    { type: "action", label: "Delete Message", Icon: Trash2, action: "delete" },
  ],
  sent: [
    { type: "action", label: "", Icon: MailCheck, action: "toggle-read" },
    { type: "action", label: "", Icon: Flag, action: "toggle-important" },
    { type: "separator" },
    { type: "action", label: "Download Message", Icon: Download, action: "download" },
    { type: "separator" },
    { type: "action", label: "Archive Message", Icon: Archive, action: "archive" },
    { type: "action", label: "Delete Message", Icon: Trash2, action: "delete" },
  ],
  drafts: [
    { type: "action", label: "Download Message", Icon: Download, action: "download" },
    { type: "separator" },
    { type: "action", label: "Delete Message", Icon: Trash2, action: "delete" },
  ],
  spam: [
    { type: "action", label: "", Icon: MailCheck, action: "toggle-read" },
    { type: "action", label: "", Icon: Flag, action: "toggle-important" },
    { type: "separator" },
    { type: "action", label: "Mark Not Spam", Icon: Inbox, action: "not-spam" },
    { type: "separator" },
    { type: "action", label: "Download Message", Icon: Download, action: "download" },
    { type: "separator" },
    { type: "action", label: "Delete Message", Icon: Trash2, action: "delete" },
  ],
  bin: [
    { type: "action", label: "", Icon: MailCheck, action: "toggle-read" },
    { type: "action", label: "", Icon: Flag, action: "toggle-important" },
    { type: "separator" },
    { type: "action", label: "Restore", Icon: RotateCcw, action: "restore" },
    { type: "separator" },
    { type: "action", label: "Download Message", Icon: Download, action: "download" },
  ],
};

type UseEmailActionsParams = {
  email: EmailPreviewWire | null;
  onAction?: (email_id: string, action: string, value?: number) => void;
  onOptimisticStarChange?: (newStarred: boolean) => void;
  onSavedFileChange?: (file: { filename: string; path: string }) => void;
};

export function use_email_actions({ email, onAction, onOptimisticStarChange, onSavedFileChange }: UseEmailActionsParams) {
  const readMarkedRef = useRef<string | null>(null);
  const { alert } = useAlertToast();

  useEffect(() => {
    if (!email || email.is_read === 1) return;
    if (readMarkedRef.current === email.id) return;
    readMarkedRef.current = email.id;
    enqueue_email_action(email, "mark_read");
    onAction?.(email.id, "mark_read");
  }, [email?.id]);

  const handle_toggle_read = useCallback(() => {
    if (!email) return;
    const is_read = email.is_read === 1;
    enqueue_email_action(email, is_read ? "mark_unread" : "mark_read");
    onAction?.(email.id, is_read ? "mark_unread" : "mark_read");
  }, [email, onAction]);

  const handle_toggle_important = useCallback(() => {
    if (!email) return;
    const newImportant = enqueue_email_action(email, "toggle_important") ?? 0;
    onAction?.(email.id, "toggle_important", newImportant);
  }, [email, onAction]);

  const handle_mark_spam = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "mark_spam");
    onAction?.(email.id, "mark_spam");
  }, [email, onAction]);

  const handle_mark_phishing = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "mark_phishing");
    onAction?.(email.id, "mark_phishing");
  }, [email, onAction]);

  const handle_block_sender = useCallback(() => {
    if (!email?.from_address) return;
    enqueue_email_action(email, "block_sender");
    onAction?.(email.id, "block_sender");
  }, [email, onAction]);

  const handle_delete = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "delete");
    onAction?.(email.id, "delete");
  }, [email, onAction]);

  const handle_archive = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "archive");
    onAction?.(email.id, "archive");
  }, [email, onAction]);

  const handle_not_spam = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "not_spam");
    onAction?.(email.id, "not_spam");
  }, [email, onAction]);

  const handle_restore = useCallback(() => {
    if (!email) return;
    enqueue_email_action(email, "restore");
    onAction?.(email.id, "restore");
  }, [email, onAction]);

  const handle_starred_change = useCallback(
    (newStarred: boolean) => {
      if (!email) return;
      onOptimisticStarChange?.(newStarred);
      enqueue_email_action(email, "toggle_starred", newStarred ? 1 : 0);
      onAction?.(email.id, "toggle_starred", newStarred ? 1 : 0);
    },
    [email, onAction, onOptimisticStarChange],
  );

  const handle_download_message = useCallback(async () => {
    if (!email) return;
    try {
      const res = await rpc.request(messages.mail_download_eml, { id: email.id }) as unknown as { savedTo: string };
      if (res.savedTo) onSavedFileChange?.({ filename: `${email.subject || "email"}.eml`, path: res.savedTo });
    } catch (e) {
      console.error("download failed", e);
      alert("Download failed", "error");
    }
  }, [rpc, email, onSavedFileChange, alert]);

  const handle_menu_action = useCallback((action: string) => {
    if (!email) return;
    switch (action) {
      case "toggle-read": handle_toggle_read(); break;
      case "toggle-important": handle_toggle_important(); break;
      case "mark-spam": handle_mark_spam(); break;
      case "mark-phishing": handle_mark_phishing(); break;
      case "block-sender": handle_block_sender(); break;
      case "download": handle_download_message(); break;
      case "archive": handle_archive(); break;
      case "delete": handle_delete(); break;
      case "not-spam": handle_not_spam(); break;
      case "restore": handle_restore(); break;
    }
  }, [email, handle_toggle_read, handle_toggle_important, handle_mark_spam, handle_mark_phishing, handle_block_sender, handle_download_message, handle_archive, handle_delete, handle_not_spam, handle_restore]);

  const items = useMemo(() => {
    const base = folderMenus[email?.folder ?? "inbox"] ?? folderMenus.inbox;
    const is_readVal = (email?.is_read ?? 0) === 1;
    return base.map((item) => {
      if (item.type !== "action") return item;
      if (item.action === "toggle-read") return { ...item, label: is_readVal ? "Mark as Unread" : "Mark as Read" };
      if (item.action === "toggle-important") return { ...item, label: email?.is_flagged === 1 ? "Mark Not Important" : "Mark as Important" };
      return item;
    });
  }, [email?.folder, email?.is_read, email?.is_flagged]);

  const starred = email?.is_starred === 1;
  const important = email?.is_flagged === 1;

  return {
    items,
    starred,
    important,
    handle_toggle_read,
    handle_toggle_important,
    handle_mark_spam,
    handle_mark_phishing,
    handle_block_sender,
    handle_download_message,
    handle_delete,
    handle_archive,
    handle_not_spam,
    handle_restore,
    handle_starred_change,
    handle_menu_action,
  };
}
