import { useAtomValue } from "jotai";
import { composeMetaAtom } from "../../../state";
import { Send } from "lucide-react";
import { SOFT_LIMIT } from "./constants";

type Props = {
  onSend: () => void;
  onSendLater: () => void;
  onPickFiles: () => void;
  onClose: () => void;
};

function ComposeActionBar({ onSend, onSendLater, onPickFiles, onClose }: Props) {
  const compose_state = useAtomValue(composeMetaAtom);
  const phase = compose_state.phase;
  const total_estimated_size = compose_state.attachments.reduce((sum, a) => sum + a.size, 0);
  const is_blocked = total_estimated_size > SOFT_LIMIT || phase === "sending";

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <button
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-opacity cursor-pointer ${is_blocked ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-accent text-white hover:opacity-90"}`}
          onClick={is_blocked ? undefined : onSend}
        >
          {phase === "sending" ? (
            <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={15} />
          )}
          {phase === "sending" ? "Sending" : "Send"}
        </button>
        <button
          onClick={onSendLater}
          disabled={is_blocked}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send Later
        </button>
      </div>
      <div className="flex items-center gap-8 flex-1 justify-end">
        <button onClick={onPickFiles} className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
          Attach
        </button>
        <button className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer" onClick={onClose}>
          Save & Close
        </button>
      </div>
    </div>
  );
}

export default ComposeActionBar;
