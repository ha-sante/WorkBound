import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

type Props = {
  onContinue: () => void;
};

type Phase = "moving" | "restarting" | "failed";

function AppSetupMoveScreen({ onContinue }: Props) {
  const [phase, setPhase] = useState<Phase>("moving");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await rpc.request(messages.app_setup_move_to_applications);
        if (cancelled) return;
        if (res.success) {
          setPhase("restarting");
          // The old process should quit itself shortly after the new instance
          // confirms. If it doesn't, proceed into the app anyway.
          setTimeout(() => {
            if (!cancelled) onContinue();
          }, 10000);
        } else {
          setPhase("failed");
          setError(res.error ?? "Couldn't move WorkBound to Applications.");
        }
      } catch (e) {
        if (cancelled) return;
        setPhase("failed");
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onContinue]);

  return (
    <div className="h-screen flex flex-col sidebar_parent">
      <div className="electrobun-webkit-app-region-drag h-9 cursor-default select-none shrink-0" />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[360px] text-center">
          <h1 className="text-2xl font-semibold text-text-primary mb-6">Installing WorkBound</h1>

          {phase === "moving" && (
            <>
              <Loader2 className="mx-auto animate-spin text-gray-400" size={22} />
              <p className="text-sm text-text-secondary mt-4">
                Moving WorkBound to your Applications folder…
              </p>
            </>
          )}

          {phase === "restarting" && (
            <>
              <Loader2 className="mx-auto animate-spin text-gray-400" size={22} />
              <p className="text-sm text-text-secondary mt-4">Restarting from Applications…</p>
            </>
          )}

          {phase === "failed" && (
            <>
              <p className="text-xs text-red-500 mb-4">{error}</p>
              <button
                onClick={onContinue}
                className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppSetupMoveScreen;
