import { messages } from "@/shared/rpc_messages";
import { outbox_commands } from "@/shared/outbox_commands";
import { rpc } from "../../rpc";

type ActionSpec = {
  command: string;
  payload: Record<string, unknown>;
  extras?: Record<string, string>;
};

const current_starred = (email: EmailPreviewWire): number => email.is_starred ?? 0;
const current_flagged = (email: EmailPreviewWire): number => email.is_flagged ?? 0;
const toggle_value = (current: number, value?: number): number => value ?? 1 - current;

const action_specs: Record<string, (email: EmailPreviewWire, value?: number) => ActionSpec> = {
  mark_read: () => ({
    command: outbox_commands.mark_as_read,
    payload: { add_label_ids: [], remove_label_ids: ["UNREAD"] },
  }),
  mark_unread: () => ({
    command: outbox_commands.mark_as_unread,
    payload: { add_label_ids: ["UNREAD"], remove_label_ids: [] },
  }),
  toggle_important: (email, value) => {
    const new_flagged = toggle_value(current_flagged(email), value);
    return {
      command: outbox_commands.toggle_important,
      payload: new_flagged
        ? { add_label_ids: ["IMPORTANT"], remove_label_ids: [] }
        : { add_label_ids: [], remove_label_ids: ["IMPORTANT"] },
    };
  },
  mark_spam: () => ({
    command: outbox_commands.mark_as_spam,
    payload: { add_label_ids: ["SPAM"], remove_label_ids: ["INBOX", "UNREAD"] },
  }),
  mark_phishing: () => ({
    command: outbox_commands.mark_as_phishing,
    payload: { add_label_ids: ["SPAM"], remove_label_ids: ["INBOX", "UNREAD"] },
  }),
  block_sender: (email) => ({
    command: outbox_commands.block_sender,
    payload: {
      criteria: { from: email.from_address },
      action: { add_label_ids: ["SPAM"] },
    },
    extras: { senderEmail: email.from_address ?? "" },
  }),
  delete: () => ({ command: outbox_commands.delete_email, payload: {} }),
  archive: () => ({
    command: outbox_commands.move_to_archive,
    payload: { add_label_ids: [], remove_label_ids: ["INBOX"] },
  }),
  not_spam: () => ({
    command: outbox_commands.move_to_inbox,
    payload: { add_label_ids: ["INBOX"], remove_label_ids: ["SPAM", "UNREAD"] },
  }),
  restore: () => ({
    command: outbox_commands.untrash,
    payload: { add_label_ids: ["INBOX"], remove_label_ids: ["TRASH"] },
  }),
  toggle_starred: (email, value) => {
    const new_starred = toggle_value(current_starred(email), value);
    return {
      command: outbox_commands.toggle_starred,
      payload: new_starred
        ? { add_label_ids: ["STARRED"], remove_label_ids: [] }
        : { add_label_ids: [], remove_label_ids: ["STARRED"] },
    };
  },
};

const toggle_values: Record<string, (email: EmailPreviewWire, value?: number) => number> = {
  toggle_starred: (email, value) => toggle_value(current_starred(email), value),
  toggle_important: (email, value) => toggle_value(current_flagged(email), value),
};

export function enqueue_email_action(email: EmailPreviewWire, action: string, value?: number): number | undefined {
  const spec_builder = action_specs[action];
  if (!spec_builder) return undefined;
  const spec = spec_builder(email, value);
  rpc.request(messages.outbox_enqueue, {
    account_id: email.account_id,
    command: spec.command,
    payload: JSON.stringify(spec.payload),
    extras: JSON.stringify({
      email_id: email.id,
      providerMessageId: email.id,
      ...spec.extras,
    }),
  }).catch((err: any) => console.error("[enqueue] outbox_enqueue failed", err));
  return toggle_values[action]?.(email, value);
}
