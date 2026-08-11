import { messages } from "../../../shared/rpc_messages";
import { ContextMenu, type ApplicationMenuItemConfig } from "electrobun/bun";
import { set_last_ctx_menu } from "..";
import { logger } from "../../utils/logger";

export default {
  [messages.context_menu_show]: async (params: ContextMenuShowParams) => {
    logger.info("rpc", `context_menu:show kind=${params.kind} email_id=${params.email_id} folder=${params.folder} quote_text=${params.quote_text ? params.quote_text.slice(0, 40) : ""}`);
    set_last_ctx_menu({ kind: params.kind, url: params.url ?? "", quote_text: params.quote_text });

    const items: ApplicationMenuItemConfig[] = [];

    if (params.kind === "link") {
      items.push(
        { label: "⎘ Copy Link", action: "copy-link", data: { url: params.url } },
        { type: "separator" },
        { label: "↗ Open in Browser", action: "open-link", data: { url: params.url } },
        { type: "separator" },
        { label: "+ Add as Note", action: "add-link-note", data: { url: params.url, email_id: params.email_id, account_id: params.account_id } },
      );
    } else if (params.kind === "image") {
      const url = params.url ?? "";
      if (url.startsWith("data:")) {
        items.push(
          { label: "↓ Save Image", action: "save-image", data: { url } },
        );
      } else {
        items.push(
          { label: "⎘ Copy Image URL", action: "copy-image-url", data: { url } },
          { label: "↓ Download Image", action: "download-image", data: { url } },
        );
      }
    } else if (params.kind === "text") {
      items.push(
        { label: "⎘ Copy", action: "copy-text" },
      );
      if (params.email_id) {
        items.push(
          { type: "separator" },
          { label: "+ Add Note", action: "add-note", data: { email_id: params.email_id, account_id: params.account_id, quote_text: params.quote_text } },
        );
      }
    } else if (params.kind === "email") {
      const readLabel = params.is_read ? "○ Mark as Unread" : "◉ Mark as Read";
      const importantLabel = params.is_flagged ? "◉ Mark Not Important" : "◉ Mark as Important";
      const folder = params.folder ?? "inbox";
      const d = { email_id: params.email_id, account_id: params.account_id, folder, is_read: params.is_read, is_flagged: params.is_flagged };
      const addNoteItem = { label: "+ Add Note", action: "add-note", data: d };

      if (folder === "inbox") {
        items.push(
          { label: readLabel, action: "toggle-read", data: d },
          { label: importantLabel, action: "toggle-important", data: d },
          { type: "separator" },
          { label: "⚠ Mark as Spam", action: "mark-spam", data: d },
          { label: "⚠ Mark as Phishing", action: "mark-phishing", data: d },
          { label: "⊘ Block Sender", action: "block-sender", data: d },
          { type: "separator" },
          { label: "☰ Archive Message", action: "archive", data: d },
          { label: "✕ Delete Message", action: "delete", data: d },
          { type: "separator" },
          addNoteItem,
        );
      } else if (folder === "sent") {
        items.push(
          { label: readLabel, action: "toggle-read", data: d },
          { label: importantLabel, action: "toggle-important", data: d },
          { type: "separator" },
          { label: "☰ Archive Message", action: "archive", data: d },
          { label: "✕ Delete Message", action: "delete", data: d },
          { type: "separator" },
          addNoteItem,
        );
      } else if (folder === "drafts") {
        items.push(
          { label: "✕ Delete Message", action: "delete", data: d },
          { type: "separator" },
          addNoteItem,
        );
      } else if (folder === "spam") {
        items.push(
          { label: readLabel, action: "toggle-read", data: d },
          { label: importantLabel, action: "toggle-important", data: d },
          { type: "separator" },
          { label: "◉ Mark Not Spam", action: "not-spam", data: d },
          { type: "separator" },
          { label: "✕ Delete Message", action: "delete", data: d },
          { type: "separator" },
          addNoteItem,
        );
      } else if (folder === "bin") {
        items.push(
          { label: readLabel, action: "toggle-read", data: d },
          { label: importantLabel, action: "toggle-important", data: d },
          { type: "separator" },
          { label: "↩ Restore", action: "restore", data: d },
          { type: "separator" },
          addNoteItem,
        );
      }
    }

    ContextMenu.showContextMenu(items);
    return { success: true };
  },
};
