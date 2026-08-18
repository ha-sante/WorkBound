import { useAtomValue, useSetAtom } from "jotai";
import { composeMetaAtom, currentThreadViewAtom } from "../../../state";

function ComposeHeader() {
  const composeState = useAtomValue(composeMetaAtom);
  const currentThreadView = useAtomValue(currentThreadViewAtom);
  const setComposeState = useSetAtom(composeMetaAtom);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 shrink-0">
      <h3 className="text-sm font-semibold text-text-primary">
        {composeState.mode === "new" ? "New Mail"
          : composeState.mode === "reply" ? "Reply"
            : composeState.mode === "reply_all" ? "Reply All"
              : "Forward"}
      </h3>
      {(composeState.mode === "reply" || composeState.mode === "reply_all") && composeState.email && currentThreadView && (
        <span className="text-[11px] text-text-secondary truncate">
          Reply to #{currentThreadView.activeIndex + 1} of {currentThreadView.emails.length}
        </span>
      )}
      <div className="flex items-center gap-3">
        {composeState.phase !== "sent" && (
          <>
            <button
              onClick={() => setComposeState(prev => ({ ...prev, showCc: !prev.showCc }))}
              className={`text-xs font-medium transition-colors cursor-pointer ${composeState.showCc ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}>
              CC
            </button>
            <button
              onClick={() => setComposeState(prev => ({ ...prev, showBcc: !prev.showBcc }))}
              className={`text-xs font-medium transition-colors cursor-pointer ${composeState.showBcc ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}>
              BCC
            </button>
          </>
        )}
        {composeState.phase === "sent" && (
          <span className="text-[11px] text-text-secondary">{Math.ceil(composeState.countdown / 10)}s</span>
        )}
      </div>
    </div>
  );
}

export default ComposeHeader;
