import { useState, useRef, useEffect, cloneElement, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right";
type Align = "start" | "center" | "end";

type TooltipProps = {
  children: ReactElement;
  content: ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
};

const alignmentOffset = (triggerRect: DOMRect, popupRect: DOMRect, align: Align): number => {
  if (align === "start") return 0;
  if (align === "end") return triggerRect.width - popupRect.width;
  return (triggerRect.width - popupRect.width) / 2;
};

export function Tooltip({ children, content, side = "top", align = "center", sideOffset = 6 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePos = () => {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;

      const tr = trigger.getBoundingClientRect();
      const pr = popup.getBoundingClientRect();

      const left = side === "right"
        ? tr.right + sideOffset
        : tr.left + alignmentOffset(tr, pr, align);
      const top = side === "right"
        ? tr.top + (tr.height - pr.height) / 2
        : side === "top"
          ? tr.top - pr.height - sideOffset
          : tr.bottom + sideOffset;

      setPos({ left: Math.max(4, left), top: Math.max(4, top) });
    };

    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, side, align, sideOffset]);

  const trigger = cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent) => {
      setOpen(true);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setOpen(false);
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      setOpen(true);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setOpen(false);
      children.props.onBlur?.(e);
    },
  });

  return (
    <>
      {trigger}
      {open && content && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] px-2 py-1 rounded-md bg-white text-gray-900 text-xs shadow-lg pointer-events-none whitespace-nowrap"
          style={{ top: pos.top, left: pos.left }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}