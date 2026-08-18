import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { composeMetaAtom } from "../../../state";

type Props = {
  triggerLocalSave: () => void;
};

function ComposeSubjectField({ triggerLocalSave }: Props) {
  const composeState = useAtomValue(composeMetaAtom);
  const setComposeState = useSetAtom(composeMetaAtom);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setComposeState(prev => ({ ...prev, subject: e.target.value }));
    triggerLocalSave();
  }, [triggerLocalSave]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-text-secondary w-10 shrink-0">Subj</span>
      <input
        className="flex-1 text-sm text-text-primary bg-transparent outline-none border-b border-slate-100 pb-1 focus:border-accent transition-colors"
        value={composeState.subject}
        onChange={handleChange}
      />
    </div>
  );
}

export default ComposeSubjectField;
