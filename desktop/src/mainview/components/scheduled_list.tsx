import { memo } from "react";
import { format_date } from "@/shared/datetime";
import { useScheduledActions } from "../hooks/use_scheduled_actions";
import { parse_send_payload } from "../utils/scheduled_send";

type Props = {
  items: OutboxItemWire[];
};

function ScheduledList({ items }: Props) {
  const { cancel, sendNow } = useScheduledActions();

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-text-secondary">No scheduled emails</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white w-full max-w-full overflow-auto pb-10">
      {items.map((item) => {
        const payload = parse_send_payload(item.payload);
        const failed = item.status === "failed";
        const to_name = payload.to ? String(payload.to).split(",")[0].trim() : "No Recipients";
        return (
          <div
            key={item.id}
            className="group flex items-center gap-[6px] px-5 py-2 cursor-default w-full transition-colors hover:bg-gray-50">
            <span className="min-w-0 w-3/12 pr-3 flex items-baseline gap-1">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary shrink-0">To</span>
              <span className="text-sm truncate text-text-primary">{to_name}</span>
            </span>

            <div className="text-xs text-text-secondary min-w-0 w-6/12 flex items-center gap-[6px]">
              <span className="min-w-0 flex-1 truncate">
                {payload.subject && (
                  <span className="font-medium text-text-primary">{payload.subject}</span>
                )}
                {payload.subject && payload.body_text && <span> </span>}
                {payload.body_text && <span>{payload.body_text}</span>}
              </span>
              {failed && (
                <span className="shrink-0 text-[10px] font-medium text-rose-500 px-1.5 py-0.5 rounded bg-rose-500/10">
                  Failed
                </span>
              )}
            </div>

            <span className="min-w-0 w-3/12 ml-auto flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary shrink-0">Sends</span>
              <span className="text-xs text-text-secondary tabular-nums truncate">
                {format_date(item.scheduled_at ? new Date(item.scheduled_at).toISOString() : null)}
              </span>
            </span>

            <div className="flex items-center gap-4 ml-5 shrink-0">
              <button
                onClick={() => sendNow(item)}
                className="text-xs font-medium text-text-secondary hover:underline transition-colors cursor-pointer">
                Send now
              </button>
              <button
                onClick={() => cancel(item)}
                className="text-xs text-text-secondary hover:text-text-primary hover:underline transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ScheduledList);
