import { Undo, Redo, Trash2, Save, Check } from "lucide-react";
import { useAtomValue } from "jotai";
import { composeDiscardAtom, composeSaveAtom, composeMetaAtom } from "../state";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

const btnClass = "w-9 h-9 flex items-center justify-center rounded-lg text-white bg-white/30 backdrop-blur-md border border-white/30 shadow-lg shadow-black/10 hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

function MailComposerControlButtons({ canUndo, canRedo, onUndo, onRedo }: Props) {
  const { fn: onDiscard } = useAtomValue(composeDiscardAtom);
  const { status: saveStatus, fn: onSave } = useAtomValue(composeSaveAtom);
  const phase = useAtomValue(composeMetaAtom).phase;
  const inactive = phase === "sending" || phase === "sent";
  return (
    <div className="absolute -right-12 top-24 -translate-y-1/2 flex flex-col gap-3">
      <button className={btnClass} onClick={onUndo} disabled={inactive || !canUndo} title="Undo">
        <Undo size={15} />
      </button>
      <button className={btnClass} onClick={onRedo} disabled={inactive || !canRedo} title="Redo">
        <Redo size={15} />
      </button>
      <button className={btnClass} onClick={onSave} title="Save draft">
        {saveStatus === "saving" ? (
          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : saveStatus === "saved" ? (
          <Check size={15} />
        ) : (
          <Save size={15} />
        )}
      </button>
      <button className={btnClass} onClick={onDiscard} title="Delete draft">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default MailComposerControlButtons;