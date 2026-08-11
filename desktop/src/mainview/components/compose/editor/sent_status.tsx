import { useAtomValue } from "jotai";
import { currentMailComposeAtom } from "../../../state";
import { Send } from "lucide-react";

type Props = {
  onUndo: () => void;
  onClose: () => void;
};

function ComposeSentStatus({ onUndo, onClose }: Props) {
  const composeState = useAtomValue(currentMailComposeAtom);
  const { mode, countdown, phase } = composeState;
  if (phase !== "sent") return null;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <Send size={28} className="text-accent" />
      <p className="text-base font-semibold text-text-primary">{mode === "new" ? "Message" : mode === "reply" ? "Reply" : mode === "reply_all" ? "Reply All" : "Forward"} Sent</p>
      <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent/40 transition-[width] duration-100 ease-linear rounded-full"
          style={{ width: `${(countdown / 50) * 100}%` }}
        />
      </div>
      <div className="flex flex-col items-center gap-4 pt-2">
        <button
          onClick={onUndo}
          className="flex items-center justify-center px-5 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-text-primary hover:bg-slate-50 transition-colors cursor-pointer">
          Undo
        </button>
        <button
          onClick={onClose}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
          Close
        </button>
      </div>
    </div>
  );
}

export default ComposeSentStatus;
