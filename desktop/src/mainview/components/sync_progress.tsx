import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";

export type BackfillSyncState = {
  status: "idle" | "syncing" | "done" | "error";
  total: number;
};

type Props = {
  backfill: BackfillSyncState;
};

function SyncProgress({ backfill }: Props) {
  if (backfill.status !== "syncing" && backfill.status !== "done") return null;

  const [dots, setDots] = useState("");

  useEffect(() => {
    if (backfill.status !== "syncing") {
      setDots("");
      return;
    }
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [backfill.status]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center justify-center text-center">
        {backfill.status === "syncing" && (
          <div className="animate-bounce">
            <ArrowDownToLine size={32} className="text-text-secondary" />
          </div>
        )}
        <p className="text-sm text-text-secondary mt-5">
          {backfill.status === "done"
            ? "All mail synced."
            : backfill.total > 0
              ? `Synced ${backfill.total} emails`
              : "Syncing your recent mail"}
          {backfill.status === "syncing" && <span className="inline-block w-6 text-left">{dots}</span>}
        </p>
      </div>
    </div>
  );
}

export default SyncProgress;
