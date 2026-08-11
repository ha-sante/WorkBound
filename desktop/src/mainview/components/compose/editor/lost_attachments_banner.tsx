import { X } from "lucide-react";

type Props = {
  names: string[];
  onDismiss: () => void;
};

function LostAttachmentsBanner({ names, onDismiss }: Props) {
  return (
    <div className="flex items-start gap-4 px-6 py-2.5 bg-amber-50 border-y border-amber-200 shrink-0">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-amber-800 leading-snug">
          Due to a previous crash or force close, your attachments were lost.
          {names.length > 0 && (
            <span className="block mt-1">Lost files:{' '}
              <span className="font-medium">{names.join(", ")}</span>
            </span>
          )}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-amber-600 hover:text-amber-800 transition-colors cursor-pointer mt-0.5">
        <X size={14} />
      </button>
    </div>
  );
}

export default LostAttachmentsBanner;
