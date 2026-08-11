import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { get_attachment, update_attachment } from "../../db/attachments";
import { get_email } from "../../db/emails";
import { get_downloads_dir } from "../../utils/platform";
import { existsSync, writeFileSync, readFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { download_attachment } from "../../providers/gmail/api";
import { withGmailAuth } from "../../providers/gmail/auth";

export default {
  [messages.attachment_download]: async (params: EntityId) => {
    const att = get_attachment(params.id);
    if (!att) throw new Error(`Attachment not found: ${params.id}`);

    if (att.local_path && existsSync(att.local_path) && (att.size === null || statSync(att.local_path).size === att.size)) {
      const buf = readFileSync(att.local_path);
      const data = buf.toString("base64");
      logger.info("rpc", `attachment:download id=${params.id} filename=${att.filename} (local)`);
      return { data, mime_type: att.mime_type ?? "application/octet-stream", filename: att.filename };
    }
    if (att.local_path) {
      logger.info("rpc", `attachment:download: local_path check failed id=${params.id} exists=${existsSync(att.local_path)} sizeMatch=${att.size === null || statSync(att.local_path).size === att.size} path=${att.local_path}`);
    } else {
      logger.info("rpc", `attachment:download: local_path null id=${params.id}`);
    }

    if (att.cache_path && existsSync(att.cache_path) && (att.size === null || statSync(att.cache_path).size === att.size)) {
      const buf = readFileSync(att.cache_path);
      const data = buf.toString("base64");
      logger.info("rpc", `attachment:download id=${params.id} filename=${att.filename} (cached)`);
      return { data, mime_type: att.mime_type ?? "application/octet-stream", filename: att.filename };
    }
    if (att.cache_path) {
      logger.info("rpc", `attachment:download: cache_path check failed id=${params.id} exists=${existsSync(att.cache_path)} sizeMatch=${att.size === null || statSync(att.cache_path).size === att.size} path=${att.cache_path}`);
    } else {
      logger.info("rpc", `attachment:download: cache_path null id=${params.id}`);
    }

    const emailRow = get_email(att.email_id);
    if (!emailRow?.account_id) throw new Error("Email or account not found");

    const remote_url = att.remote_url;
    if (!remote_url || !remote_url.startsWith("gmail://")) {
      logger.info("rpc", `attachment:download: unsupported remote_url id=${params.id} remote_url=${remote_url}`);
      throw new Error("Unsupported attachment source");
    }

    const parts = remote_url.slice(8).split("/");
    if (parts.length !== 2) throw new Error("Invalid remote URL");

    const buf = await withGmailAuth(emailRow.account_id, (token) =>
      download_attachment(token, parts[0], parts[1]),
    );

    const data = buf.toString("base64");
    return { data, mime_type: att.mime_type ?? "application/octet-stream", filename: att.filename };
  },

  [messages.attachment_save]: async (params: EntityId) => {
    let att = get_attachment(params.id);
    if (!att) {
      logger.error("rpc", `attachment:save: attachment not found id=${params.id}`);
      throw new Error(`Attachment not found: ${params.id}`);
    }
    logger.info("rpc", `attachment:save: start id=${params.id} filename=${att.filename}`);

    if (att.local_path) {
      if (!existsSync(att.local_path)) {
        logger.info("rpc", `attachment:save: local_path exists in db but file gone id=${params.id} path=${att.local_path}`);
      } else if (att.size !== null && statSync(att.local_path).size !== att.size) {
        logger.info("rpc", `attachment:save: local_path size mismatch id=${params.id} dbSize=${att.size} diskSize=${statSync(att.local_path).size}`);
      } else {
        return { savedTo: att.local_path, cancelled: false };
      }
    } else {
      logger.info("rpc", `attachment:save: local_path is null id=${params.id}`);
    }
    if (att.cache_path) {
      if (!existsSync(att.cache_path)) {
        logger.info("rpc", `attachment:save: cache_path exists in db but file gone id=${params.id} path=${att.cache_path}`);
      } else if (att.size !== null && statSync(att.cache_path).size !== att.size) {
        logger.info("rpc", `attachment:save: cache_path size mismatch id=${params.id} dbSize=${att.size} diskSize=${statSync(att.cache_path).size}`);
      } else {
        return { savedTo: att.cache_path, cancelled: false };
      }
    } else {
      logger.info("rpc", `attachment:save: cache_path is null id=${params.id}`);
    }

    logger.info("rpc", `attachment:save: not cached, downloading id=${params.id}`);
    try {
      const handlers = (await import("..")).handlers;
      const dl = await handlers[messages.attachment_download](params) as { data: string };
      const buf = Buffer.from(dl.data, "base64");
      const downloadsDir = get_downloads_dir();
      mkdirSync(downloadsDir, { recursive: true });

      let destPath = join(downloadsDir, att.filename);
      if (existsSync(destPath)) {
        const dotIdx = att.filename.lastIndexOf(".");
        if (dotIdx === -1) {
          let counter = 2;
          while (existsSync(destPath)) {
            destPath = join(downloadsDir, `${att.filename} (${counter})`);
            counter++;
          }
        } else {
          const name = att.filename.slice(0, dotIdx);
          const ext = att.filename.slice(dotIdx);
          let counter = 2;
          while (existsSync(destPath)) {
            destPath = join(downloadsDir, `${name} (${counter})${ext}`);
            counter++;
          }
        }
      }

      writeFileSync(destPath, buf);
      update_attachment(params.id, { cache_path: destPath });
      logger.info("rpc", `attachment:save: done id=${params.id} saved to ${destPath}`);
      return { savedTo: destPath, cancelled: false };
    } catch (e) {
      logger.error("rpc", `attachment:save: download failed id=${params.id}`, e);
      throw e;
    }
  },
};
