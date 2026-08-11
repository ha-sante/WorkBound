import { Reply, Forward } from "lucide-react";

type Props = {
  onReply: () => void;
  onForward: () => void;
  hasReplyDraft?: boolean;
  hasForwardDraft?: boolean;
};

const btnClass =
  "w-[100px] flex items-center justify-center gap-2 px-2 py-1 rounded-lg text-sm font-medium text-white bg-white/30 backdrop-blur-md border border-white/30 shadow-lg shadow-black/10 hover:bg-white/20 transition-colors cursor-pointer";

const dotClass = "w-2 h-2 rounded-full bg-white/70 inline-block shrink-0";

function MailViewerActionButtons({ onReply, onForward, hasReplyDraft, hasForwardDraft }: Props) {
  return (
    <div className="flex items-center justify-center gap-3 my-4 pointer-events-auto">
      <button className={btnClass} onClick={onReply}>
        <Reply size={15} />
        Reply
        {hasReplyDraft && <span className={dotClass} />}
      </button>
      <button className={btnClass} onClick={onForward}>
        <Forward size={15} />
        Forward
        {hasForwardDraft && <span className={dotClass} />}
      </button>
    </div>
  );
}

export default MailViewerActionButtons;
