import { Utils, ContextMenu } from "electrobun/bun";
import { messages } from "../../shared/rpc_messages";
import { outbox_commands } from "../../shared/outbox_commands";
import { get_downloads_dir } from "../utils/platform";
import { get_email } from "../db/emails";
import { insert_outbox } from "../db/outbox";
import { delete_draft } from "../db/drafts";
import { logger } from "../utils/logger";
import mailHandlers from "./handlers/mail";
import threadHandlers from "./handlers/threads";
import attachmentHandlers from "./handlers/attachments";
import accountHandlers from "./handlers/accounts";
import syncHandlers from "./handlers/sync";
import authHandlers from "./handlers/auth";
import outboxHandlers from "./handlers/outbox";
import contactHandlers from "./handlers/contacts";
import contextMenuHandlers from "./handlers/context_menu";
import fileHandlers from "./handlers/files";
import diagnosticHandlers from "./handlers/diagnostics";
import sendAsHandlers from "./handlers/send_as";
import signatureHandlers from "./handlers/signatures";
import draftHandlers from "./handlers/drafts";
import notesHandlers from "./handlers/notes";
import filteredViewsHandlers from "./handlers/filtered_views";
import notificationFiltersHandlers from "./handlers/notification_filters";
import templatesHandlers from "./handlers/templates";
import filtersHandlers from "./handlers/filters";
import labelsHandlers from "./handlers/labels";
import intelligenceHandlers from "./handlers/intelligence";
import configHandlers from "./handlers/config";
import imageHandlers from "./handlers/images";
import devHandlers from "./handlers/dev";
import notificationsHandlers from "./handlers/notifications";
import appSetupHandlers from "./handlers/app_setup";
import updatesHandlers from "./handlers/updates";
import remindersHandlers from "./handlers/reminders";
import shortcutsHandlers from "./handlers/shortcuts";

import { writeFileSync } from "fs";
import { join } from "path";

let _rpc: { send: (msg: string, payload?: unknown) => void } | null = null;
export function set_rpc(rpc: { send: (msg: string, payload?: unknown) => void }) {
  _rpc = rpc;
}
export function rpc_send(msg: string, payload?: unknown) {
  _rpc?.send(msg, payload);
}

let lastCtxMenu: { kind: string; url: string; quote_text?: string } | null = null;
export function set_last_ctx_menu(v: typeof lastCtxMenu) {
  lastCtxMenu = v;
}

ContextMenu.on("context-menu-clicked", (event: unknown) => {
  const ev = event as { data: { action: string; data?: Record<string, unknown> } };
  const { action } = ev.data;
  const payload = ev.data.data || {};
  const payloadData = payload as { email_id?: string; quote_text?: string; text?: string };
  logger.info("rpc", `context_menu:action action=${action} email_id=${payloadData.email_id} quote_text=${((lastCtxMenu?.quote_text || payloadData.quote_text) ?? "").slice(0, 40)}`);
  const url = (payload?.url as string) || lastCtxMenu?.url || "";

  if (action === "copy-link" || action === "copy-image-url") {
    Utils.clipboardWriteText(url);
    _rpc?.send(messages.context_menu_action, { action, data: { url } });
    return;
  }

  if (action === "copy-text") {
    const text = payloadData.text || lastCtxMenu?.quote_text || "";
    if (text) {
      Utils.clipboardWriteText(text);
      _rpc?.send(messages.context_menu_action, { action, data: { text } });
    } else {
      _rpc?.send(messages.context_menu_action, { action });
    }
    return;
  }

  if (action === "open-link") {
    Utils.openExternal(url);
    _rpc?.send(messages.context_menu_action, { action, data: { url } });
    return;
  }

  if (action === "download-image") {
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const originalUrl = new URL(url).searchParams.get("url") || url;
        const name = originalUrl.split("/").pop()?.split("?")[0] || "image.jpg";
        const dest = join(get_downloads_dir(), name);
        writeFileSync(dest, Buffer.from(buf));
        _rpc?.send(messages.context_menu_action, { action, data: { savedTo: dest, filename: name } });
      } catch (e) {
        _rpc?.send(messages.context_menu_action, { action, data: { error: String(e) } });
      }
    })();
    return;
  }

  if (action === "save-image") {
    (async () => {
      try {
        const match = url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) throw new Error("Unsupported data URI");
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const data = match[2];
        const name = `image-${Date.now()}.${ext}`;
        const dest = join(get_downloads_dir(), name);
        writeFileSync(dest, Buffer.from(data, "base64"));
        _rpc?.send(messages.context_menu_action, { action, data: { savedTo: dest, filename: name } });
      } catch (e) {
        _rpc?.send(messages.context_menu_action, { action, data: { error: String(e) } });
      }
    })();
    return;
  }

  // Draft delete: route through frontend via context_menu:action
      if (action === "delete") {
    const email_id = payload?.email_id as string | undefined;
    if (email_id) {
      const row = get_email(email_id);
      if (row?.folder === "drafts") {
        delete_draft(email_id);
        insert_outbox({
          id: crypto.randomUUID(),
          account_id: row.account_id,
          command: outbox_commands.draft_delete,
          payload: JSON.stringify({ gmail_draft_id: row.gmail_draft_id ?? null }),
          status: "queued",
          created_at: Date.now(),
        });
        _rpc?.send(messages.email_command, {
          cmd: "draft-deleted",
          email_id,
        });
        return;
      }
    }
  }

  if (action === "add-note") {
    _rpc?.send(messages.context_menu_action, { action, data: { ...payload, quote_text: lastCtxMenu?.quote_text || "" } });
    return;
  }

  if (action === "add-link-note") {
    _rpc?.send(messages.context_menu_action, { action, data: { ...payload, url: lastCtxMenu?.url || "" } });
    return;
  }

  _rpc?.send(messages.context_menu_action, { action, data: payload });
});

export const handlers = {
  ...mailHandlers,
  ...threadHandlers,
  ...attachmentHandlers,
  ...accountHandlers,
  ...syncHandlers,
  ...authHandlers,
  ...outboxHandlers,
  ...contactHandlers,
  ...contextMenuHandlers,
  ...fileHandlers,
  ...diagnosticHandlers,
  ...sendAsHandlers,
  ...signatureHandlers,
  ...draftHandlers,
  ...notesHandlers,
  ...filteredViewsHandlers,
  ...notificationFiltersHandlers,
  ...templatesHandlers,
  ...filtersHandlers,
  ...labelsHandlers,
  ...intelligenceHandlers,
  ...configHandlers,
  ...imageHandlers,
  ...devHandlers,
  ...notificationsHandlers,
  ...appSetupHandlers,
  ...updatesHandlers,
  ...remindersHandlers,
  ...shortcutsHandlers,
};
