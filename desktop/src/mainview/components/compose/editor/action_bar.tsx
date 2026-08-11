import { useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { currentMailComposeAtom } from "../../../state";
import { Send } from "lucide-react";
import { SOFT_LIMIT } from "./constants";

type Props = {
  onSend: () => void;
  onSendLater: (scheduled_at: number) => void;
  onPickFiles: () => void;
  onClose: () => void;
  showPicker: boolean;
  onTogglePicker: () => void;
};

function add_hour(h: number): number {
  const d = new Date();
  d.setHours(d.getHours() + h, 0, 0, 0);
  return d.getTime();
}

function next_hour(n: number): number {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function ComposeActionBar({ onSend, onSendLater, onPickFiles, onClose, showPicker, onTogglePicker }: Props) {
  const composeState = useAtomValue(currentMailComposeAtom);
  const phase = composeState.phase;
  const totalEstimatedSize = composeState.attachments.reduce((sum, a) => sum + a.size, 0);
  const [customTime, setCustomTime] = useState("");

  const isBlocked = totalEstimatedSize > SOFT_LIMIT || phase === "sending";

  const handleOption = useCallback((ts: number) => {
    onTogglePicker();
    onSendLater(ts);
  }, [onTogglePicker, onSendLater]);

  const handleCustom = useCallback(() => {
    if (!customTime) return;
    const ts = new Date(customTime).getTime();
    if (ts > Date.now()) {
      onTogglePicker();
      setCustomTime("");
      onSendLater(ts);
    }
  }, [customTime, onTogglePicker, onSendLater]);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <button
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-opacity cursor-pointer ${isBlocked ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-accent text-white hover:opacity-90"}`}
          onClick={isBlocked ? undefined : onSend}>
          {phase === "sending" ? (
            <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={15} />
          )}
          {phase === "sending" ? "Sending" : "Send"}
        </button>
        <div className="relative">
          <button
            onClick={onTogglePicker}
            disabled={isBlocked}
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send Later
          </button>
          {showPicker && (
            <div             className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-2 min-w-[180px]">
              <button onClick={() => handleOption(add_hour(1))} className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">In 1 hour</button>
              <button onClick={() => handleOption(add_hour(2))} className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">In 2 hours</button>
              <button onClick={() => handleOption(add_hour(4))} className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">In 4 hours</button>
              <button onClick={() => handleOption(add_hour(8))} className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">In 8 hours</button>
              <button onClick={() => handleOption(next_hour(1))} className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">Tomorrow</button>
              <div className="border-t border-slate-100 my-1" />
              <div className="px-3 py-1">
                <input
                  type="datetime-local"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1"
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                />
                <button
                  onClick={handleCustom}
                  disabled={!customTime}
                  className="mt-1 w-full text-xs px-2 py-1 rounded bg-accent text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  Pick time
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-8 flex-1 justify-end">
        <button
          onClick={onPickFiles}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
          Attach
        </button>
        <button
          className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          onClick={onClose}>
          Save & Close
        </button>
      </div>
    </div>
  );
}

export default ComposeActionBar;
