import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";

type TipProps = {
  children: ReactNode;
};

export function Tip({ children }: TipProps) {
  return (
    <div className="flex items-start gap-2 rounded px-3 py-2.5 text-xs text-text-secondary">
      <Lightbulb size={14} className="shrink-0 text-text-secondary" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}
