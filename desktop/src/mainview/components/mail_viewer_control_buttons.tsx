import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronUp,
  ChevronDown,
  Star,
  MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MenuItem =
  | { type: "action"; label: string; Icon: LucideIcon; action: string }
  | { type: "separator" };

type Props = {
  starred: boolean;
  items: MenuItem[];
  onAction: (action: string) => void;
  onStarredChange: (starred: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
  top?: number;
};

const btnClass = "w-9 h-9 flex items-center justify-center rounded-lg text-white bg-white/30 backdrop-blur-md border border-white/30 shadow-lg shadow-black/10 hover:bg-white/20 transition-colors cursor-pointer";

const menuItemClass = "flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer rounded-lg";

const compactItemClass = "flex items-center justify-center w-9 h-9 text-white hover:bg-white/10 transition-colors cursor-pointer rounded-lg";

const MailViewerControlButtons = ({ starred, items, onAction, onStarredChange, onPrev, onNext, className, top }: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [flip, setFlip] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handle_open = () => {
    setMenuOpen(true);
    setCompact(false);
    setFlip(false);
    requestAnimationFrame(() => {
      const el = menuElRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const view = window.innerWidth;
      const overflowRight = rect.right > view;
      const overflowLeft = rect.left < 0;
      if (overflowRight || overflowLeft) {
        setCompact(true);
        setFlip(true);
      }
    });
  };

  return (
    <div className={`absolute -right-12 flex flex-col gap-3 pointer-events-auto ${className ?? ""}`} style={top !== undefined ? { top } : undefined}>
      <button className={`${btnClass} ${!onPrev ? "!opacity-30 !pointer-events-none" : ""}`} onClick={() => onPrev?.()}>
        <ChevronUp size={16} />
      </button>
      <button className={`${btnClass} ${!onNext ? "!opacity-30 !pointer-events-none" : ""}`} onClick={() => onNext?.()}>
        <ChevronDown size={16} />
      </button>
      <button className={btnClass} onClick={() => onStarredChange(!starred)}>
        <Star size={16} className={starred ? "text-yellow-400" : ""} fill={starred ? "#facc15" : "none"} />
      </button>
      <div className="relative" ref={menuRef}>
        <button className={btnClass} onClick={() => (menuOpen ? setMenuOpen(false) : handle_open())}>
          <MoreHorizontal size={16} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuElRef}
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.12 }}
              className={`absolute top-full mt-2 ${flip ? "right-0" : "left-0"} ${compact ? "w-9" : "w-48"} ${compact ? "py-0.5" : "py-1"} ${compact ? "rounded-lg" : "rounded-xl"} bg-white/30 backdrop-blur-md border border-white/30 shadow-lg shadow-black/10 overflow-hidden z-10`}>
              {items.map((item, i) => {
                if (item.type === "separator") {
                  return <div key={i} className={compact ? "mx-1 my-1 h-px bg-white/20" : "mx-2 my-1 h-px bg-white/20"} />;
                }
                return (
                  <button
                    key={i}
                    className={compact ? compactItemClass : menuItemClass}
                    title={item.label}
                    onClick={() => { setMenuOpen(false); onAction(item.action); }}
                  >
                    <item.Icon size={compact ? 16 : 15} />
                    {!compact && <span>{item.label}</span>}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MailViewerControlButtons;
