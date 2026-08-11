import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { reveal_file, get_downloads_dir } from "../../utils/platform";
import { ATTACHMENT_SIZE_LIMIT } from "../../utils/constants";
import { Utils } from "electrobun/bun";
import { homedir } from "os";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export default {
  [messages.reveal_in_finder]: async (params: { path: string }) => {
    logger.info("rpc", `reveal:inFinder path=${params.path}`);
    reveal_file(params.path);
    return { success: true };
  },

  [messages.url_open]: async (params: { url: string }) => {
    logger.info("rpc", `url:open url=${params.url}`);
    const success = Utils.openExternal(params.url);
    return { success };
  },

  [messages.file_save]: async (params: { filename: string; content: string }) => {
    const downloadsDir = get_downloads_dir();
    mkdirSync(downloadsDir, { recursive: true });

    let destPath = join(downloadsDir, params.filename);
    if (existsSync(destPath)) {
      const dotIdx = params.filename.lastIndexOf(".");
      if (dotIdx === -1) {
        let counter = 2;
        while (existsSync(destPath)) {
          destPath = join(downloadsDir, `${params.filename} (${counter})`);
          counter++;
        }
      } else {
        const name = params.filename.slice(0, dotIdx);
        const ext = params.filename.slice(dotIdx);
        let counter = 2;
        while (existsSync(destPath)) {
          destPath = join(downloadsDir, `${name} (${counter})${ext}`);
          counter++;
        }
      }
    }

    writeFileSync(destPath, params.content, "utf-8");
    logger.info("rpc", `file:save saved to ${destPath}`);
    return { savedTo: destPath, cancelled: false };
  },

  [messages.file_pick]: async () => {
    const paths = await Utils.openFileDialog({
      startingFolder: homedir(),
      allowedFileTypes: "*",
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: true,
    });
    if (!paths || paths.length === 0) return { files: [] };
    logger.info("rpc", `file:pick count=${paths.length} first=${paths[0]}`);

    const results = await Promise.all(paths.map(async (filePath) => {
      const f = Bun.file(filePath);
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length > ATTACHMENT_SIZE_LIMIT) {
        const name = filePath.split("/").pop() || "untitled";
        logger.warn("rpc", `file:pick skipping oversized: ${name} (${bytes.length} bytes)`);
        return null;
      }
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const ext = filePath.includes(".") ? filePath.split(".").pop()!.toLowerCase() : "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
        doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        zip: "application/zip", gz: "application/gzip", tar: "application/x-tar",
        mp3: "audio/mpeg", mp4: "video/mp4", mov: "video/quicktime",
        txt: "text/plain", html: "text/html", css: "text/css", js: "text/javascript",
        json: "application/json", csv: "text/csv",
      };
      return {
        name: filePath.split("/").pop() || "untitled",
        mime_type: mimeMap[ext] || "application/octet-stream",
        data: btoa(binary),
        local_path: filePath,
        size: bytes.length,
      };
    }));
    const files = results.filter((r): r is NonNullable<typeof r> => r !== null);
    return { files };
  },

  [messages.clipboard_write]: async (params: { text: string }) => {
    Utils.clipboardWriteText(params.text);
    return { success: true };
  },
};
