import { logger } from "../../utils/logger";
import { get_config } from "../../utils/config";
import { get_raw_db } from "../../db/client";
import { evict_viewable_body_cache } from "../../db/fts";
import { evict_stale_attachment_metadata, list_stale_attachment_paths } from "../../db/attachments";
import { delete_local_copy } from "../../storage/attachments";
import { get_body_cache_ms } from "./body_cache";

export async function evict_caches(): Promise<{ emails: number; attachments: number }> {
  const cutoff = new Date(Date.now() - get_body_cache_ms()).toISOString();
  logger.info("evictions", `evicting stale cache for emails before ${cutoff}`);

  const { emails } = evict_viewable_body_cache(cutoff);
  delete_stale_attachment_files(cutoff);
  const attachments = evict_stale_attachment_metadata(cutoff);

  const raw = get_raw_db();
  const freelistPages = (raw.query("PRAGMA freelist_count").get() as { "freelist_count": number })["freelist_count"];
  const pageSize = (raw.query("PRAGMA page_size").get() as { "page_size": number })["page_size"];
  const freelistMb = (freelistPages * pageSize) / 1048576;
  if (freelistMb > get_freelist_vacuum_threshold_mb()) {
    logger.info("evictions", `freelist=${freelistMb.toFixed(0)} MB exceeds threshold, running VACUUM`);
    raw.run("VACUUM");
    logger.info("evictions", "VACUUM complete");
  }

  return { emails, attachments };
}

function delete_stale_attachment_files(cutoff: string): void {
  const stale_attachment_ids = list_stale_attachment_paths(cutoff);
  for (const id of stale_attachment_ids) {
    delete_local_copy(id);
  }
}

function get_freelist_vacuum_threshold_mb(): number {
  return parseInt(get_config("DB_VACUUM_THRESHOLD"), 10) || 200;
}

const get_eviction_interval_ms = (): number => parseInt(get_config("CACHE_EVICTION_INTERVAL_MS"), 10) || 1800000;
const EVICTION_INTERVAL_MS = get_eviction_interval_ms();
let interval_id: ReturnType<typeof setInterval> | null = null;

export function start_cache_eviction() {
  if (interval_id) return;
  logger.info("evictions", `starting periodic eviction (interval=${EVICTION_INTERVAL_MS}ms)`);
  interval_id = setInterval(() => {
    evict_caches().catch((e) => logger.error("evictions", "eviction failed:", e));
  }, EVICTION_INTERVAL_MS);
}

export function stop_cache_eviction() {
  if (interval_id) {
    clearInterval(interval_id);
    interval_id = null;
    logger.info("evictions", "periodic eviction stopped");
  }
}