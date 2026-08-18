import { Pencil, Send, X } from "lucide-react";
import { useScheduledActions } from "../hooks/use_scheduled_actions";

type Props = {
  item: OutboxItemWire;
  top?: number;
};

const btn_class = "w-9 h-9 flex items-center justify-center rounded-lg text-white bg-white/30 backdrop-blur-md border border-white/30 shadow-lg shadow-black/10 hover:bg-white/20 transition-colors cursor-pointer";

function ScheduledMailControlButtons({ item, top }: Props) {
  const { sendNow, edit, cancel } = useScheduledActions();

  return (
    <div
      className="absolute -right-12 flex flex-col gap-3 pointer-events-auto"
      style={top !== undefined ? { top } : undefined}>
      <button className={btn_class} onClick={() => sendNow(item)} title="Send now" aria-label="Send now">
        <Send size={16} />
      </button>
      <button className={btn_class} onClick={() => edit(item)} title="Edit scheduled email" aria-label="Edit scheduled email">
        <Pencil size={16} />
      </button>
      <button className={btn_class} onClick={() => cancel(item)} title="Cancel scheduled email" aria-label="Cancel scheduled email">
        <X size={16} />
      </button>
    </div>
  );
}

export default ScheduledMailControlButtons;
