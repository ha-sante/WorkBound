import { memo } from "react";
import { format_date_full } from "@/shared/datetime";
import { parse_send_payload } from "../utils/scheduled_send";

type Props = {
  mail: EmailPreviewWire | EmailRowWire | OutboxItemWire;
  loading?: boolean;
  className?: string;
};

function MailMeta({ mail, loading, className }: Props) {
  if (loading) return null;

  const is_scheduled = "payload" in mail && "scheduled_at" in mail;
  const source: Record<string, any> = (
    is_scheduled ? parse_send_payload((mail as OutboxItemWire).payload) : mail
  ) as Record<string, any>;

  const from_name = source.from_name ?? "";
  const from_address = source.from_address ?? "";
  const to = source.to ?? source.toAddr ?? "";
  const cc = source.cc ?? "";
  const bcc = source.bcc ?? "";
  const scheduled_at = is_scheduled ? (mail as OutboxItemWire).scheduled_at : null;
  const date = scheduled_at
    ? format_date_full(new Date(scheduled_at).toISOString())
    : format_date_full(source.sent_at || source.received_at);

  const from = from_name ? `${from_name} <${from_address}>` : from_address;

  return (
    <div className={`px-6 pt-1 pb-3 space-y-1 text-xs ${className ?? ""}`}>
      <div className="flex overflow-hidden">
        <span className="text-text-secondary w-16 shrink-0 text-xs">From</span>
        <span className="text-text-primary truncate text-xs flex-1 min-w-0">{from || "—"}</span>
      </div>
      <div className="flex overflow-hidden">
        <span className="text-text-secondary w-16 shrink-0 text-xs">To</span>
        <span className="text-text-primary truncate text-xs flex-1 min-w-0">{to || "—"}</span>
      </div>
      {cc && (
        <div className="flex overflow-hidden">
          <span className="text-text-secondary w-16 shrink-0 text-xs">CC</span>
          <span className="text-text-primary truncate text-xs flex-1 min-w-0">{cc}</span>
        </div>
      )}
      {bcc && (
        <div className="flex overflow-hidden">
          <span className="text-text-secondary w-16 shrink-0 text-xs">BCC</span>
          <span className="text-text-primary truncate text-xs flex-1 min-w-0">{bcc}</span>
        </div>
      )}
      <div className="flex overflow-hidden">
        <span className="text-text-secondary w-16 shrink-0 text-xs">Date</span>
        <span className="text-text-primary truncate text-xs flex-1 min-w-0">{date || "—"}</span>
      </div>
    </div>
  );
}

export default memo(MailMeta);
