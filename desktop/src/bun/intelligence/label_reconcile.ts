import { rpc_send } from "../rpc";
import { messages } from "../../shared/rpc_messages";
import { logger } from "../utils/logger";
import { strip_label_ids_from_emails } from "../db/emails";
import { disable_prompts_by_label_ids } from "./prompts";
import { disable_template_entries_by_label_names } from "./templates";

export function reconcile_removed_labels(account_id: string, removed: { id: string; name: string }[]): void {
  if (removed.length === 0) return;
  strip_label_ids_from_emails(account_id, removed.map((r) => r.id));
  disable_prompts_by_label_ids(account_id, removed.map((r) => r.id));
  disable_template_entries_by_label_names(account_id, removed.map((r) => r.name));
  rpc_send(messages.labels_changed, { account_id });
  logger.info("labels", `removed ${removed.length} label(s) deleted in gmail account=${account_id.slice(0, 8)}`);
}