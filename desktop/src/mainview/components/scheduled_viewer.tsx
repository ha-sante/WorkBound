import { memo } from "react";
import { useAtom } from "jotai";
import { currentScheduledViewAtom } from "../state";
import { parse_send_payload } from "../utils/scheduled_send";
import { format_file_size } from "../utils/mail_display_utils";
import MailMeta from "./mail_meta";
import MailBody from "./mail_body";

function ScheduledViewer({ onClose }: { onClose: () => void }) {
  const [scheduledView] = useAtom(currentScheduledViewAtom);
  if (!scheduledView) return null;

  const item = scheduledView.item;
  const payload = parse_send_payload(item.payload);
  const subject = payload.subject ?? item.subject ?? "";
  const body_html = payload.body_html ?? "";
  const body_text = payload.body_text ?? "";
  const attachments: AttachmentPayload[] = payload.attachments ?? [];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0 border-b border-slate-50">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-md font-semibold text-text-primary truncate min-w-0">{subject || "(No subject)"}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 5l10 10M15 5l-10 10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <MailMeta mail={item} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <MailBody html={body_html} text={body_text} email_id={item.id} account_id={item.account_id} />
      </div>

      {attachments.length > 0 && (
        <div className="px-6 py-4 border-t border-border-subtle shrink-0">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((att, i) => (
              <div
                key={att.name || i}
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm min-w-0">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-text-primary font-medium truncate text-[12px]">{att.name}</p>
                  <p className="text-text-secondary text-[10px]">{format_file_size(att.size)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ScheduledViewer);
