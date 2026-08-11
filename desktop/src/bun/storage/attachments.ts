import { join } from "path";
import { mkdirSync, existsSync, writeFileSync, rmSync } from "fs";
import { getDb } from "../db/client";
import { sql } from "drizzle-orm";
import { get_attachment, update_attachment } from "../db/attachments";
import type { AttachmentRow } from "../db/attachments";
import { get_storage_dir } from "../utils/platform";

const STORAGE_DIR = get_storage_dir();

export function get_local_path(attachment: AttachmentRow): string {
  if (attachment.cache_path && existsSync(attachment.cache_path)) {
    return attachment.cache_path;
  }
  return join(STORAGE_DIR, attachment.id, attachment.filename);
}

export async function download_attachment(attachment: AttachmentRow, data: Buffer): Promise<string> {
  mkdirSync(STORAGE_DIR, { recursive: true });
  const dir = join(STORAGE_DIR, attachment.id);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, attachment.filename);
  writeFileSync(filePath, data);
  update_attachment(attachment.id, { cache_path: filePath });
  return filePath;
}

export function get_total_cache_size(): number {
  const row = getDb().get(sql`
    SELECT COALESCE(SUM(size), 0) AS total FROM attachments WHERE cache_path IS NOT NULL
  `) as { total: number };
  return row.total;
}

export function delete_local_copy(attachment_id: string) {
  const attachment = get_attachment(attachment_id);
  if (!attachment) return;
  const dir = join(STORAGE_DIR, attachment.id);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch { /* file likely doesn't exist */ }
  update_attachment(attachment_id, { cache_path: null });
}
