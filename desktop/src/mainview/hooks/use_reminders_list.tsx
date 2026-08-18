import { useCallback, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { CalendarClock, X } from "lucide-react";
import { emailsByFolderAtom, command_k_modal_open_atom, command_k_modal_request_atom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { use_reminders } from "./use_reminders";
import { build_reminder_rows, row_email } from "../utils/mail_display_utils";

export function use_reminders_list(account_id: string | undefined, on_open_email: (email: EmailPreviewWire) => void) {
  const emails_by_folder = useAtomValue(emailsByFolderAtom);
  const set_command_open = useSetAtom(command_k_modal_open_atom);
  const set_command_request = useSetAtom(command_k_modal_request_atom);
  const { items, due_count } = use_reminders(account_id);

  const on_open_email_ref = useRef(on_open_email);
  on_open_email_ref.current = on_open_email;

  const rows = useMemo(() => build_reminder_rows(items, emails_by_folder), [items, emails_by_folder]);

  const open = useCallback((row: MailListRow) => {
    const email = row_email(row, emails_by_folder);
    if (email) on_open_email_ref.current(email);
  }, [emails_by_folder]);

  const actions_for = useCallback(
    (row: MailListRow) => {
      if (!("kind" in row) || row.kind !== "reminder" || !row.reminder) return null;
      const reminder = row.reminder;
      return (
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-black/5 hover:text-text-primary cursor-pointer"
            title="Postpone reminder"
            aria-label="Postpone reminder"
            onClick={(event) => {
              event.stopPropagation();
              set_command_request({
                mode: "reminder",
                account_id: reminder.account_id,
                email_id: reminder.email_id,
                thread_id: reminder.thread_id,
                reminder_id: reminder.id,
              });
              set_command_open(true);
            }}>
            <CalendarClock size={15} />
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-black/5 hover:text-text-primary cursor-pointer"
            title="Dismiss reminder"
            aria-label="Dismiss reminder"
            onClick={(event) => {
              event.stopPropagation();
              rpc.request(messages.reminders_update, { id: reminder.id, account_id: reminder.account_id, status: "dismissed" }).catch(() => {});
            }}>
            <X size={15} />
          </button>
        </div>
      );
    },
    [set_command_open, set_command_request],
  );

  return { rows, count: items.length, due_count, open, actions_for };
}
