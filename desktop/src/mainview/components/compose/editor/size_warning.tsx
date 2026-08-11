import { useAtomValue } from "jotai";
import { currentMailComposeAtom } from "../../../state";
import { SOFT_LIMIT } from "./constants";

function SizeWarning() {
  const composeState = useAtomValue(currentMailComposeAtom);
  const totalEstimatedSize = composeState.attachments.reduce((sum, a) => sum + a.size, 0);
  if (totalEstimatedSize <= SOFT_LIMIT) return null;

  return (
    <div className="flex items-center gap px-6 py-2 bg-amber-50 border-y border-amber-200 shrink-0">
      <span className="text-[11px] text-amber-800 leading-snug">
        Total size exceeds {SOFT_LIMIT / (1024 * 1024)}MB — remove large files and add a cloud drive share link instead.
      </span>
    </div>
  );
}

export default SizeWarning;
