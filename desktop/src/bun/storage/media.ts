import { getDb } from "../db/client";
import { sql } from "drizzle-orm";
import { get_all_media } from "../db/attachments";
import type { AttachmentRow } from "../db/attachments";

type MediaType = "image" | "video" | "audio" | "file";

const MIME_PREFIX: Record<MediaType, string> = {
  image: "image/",
  video: "video/",
  audio: "audio/",
  file: "",
};

export function get_media_by_type(type: MediaType, opts: MediaQueryOpts): AttachmentRow[] {
  return get_all_media({
    ...opts,
    mime_type: type === "file" ? undefined : MIME_PREFIX[type],
  });
}

export function get_total_size(account_id: string): number {
  const row = getDb().get(sql`
    SELECT COALESCE(SUM(a.size), 0) AS total FROM attachments a
    JOIN emails e ON a.email_id = e.id
    WHERE e.account_id = ${account_id} AND a.is_downloaded = 1
  `) as { total: number };
  return row.total;
}
