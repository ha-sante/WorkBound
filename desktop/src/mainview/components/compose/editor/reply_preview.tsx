import { useRef, useEffect, useLayoutEffect } from "react";

type Props = {
  showPreview: boolean;
  quote_text: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
};

function ReplyPreview({ showPreview, quote_text, editorRef, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPreview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showPreview, onClose]);

  useEffect(() => {
    if (!showPreview) return;
    const handler = (e: MouseEvent) => {
      if (editorRef.current?.querySelector('[data-role="quote-pill"]')?.contains(e.target as Node)) return;
      if (popupRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPreview, editorRef, onClose]);

  useLayoutEffect(() => {
    if (!showPreview || !quote_text) return;
    const pillEl = editorRef.current?.querySelector('[data-role="quote-pill"]');
    const popup = popupRef.current;
    if (!pillEl || !popup) return;

    const rect = pillEl.getBoundingClientRect();
    const popupHeight = popup.offsetHeight;
    const gap = 4;
    const below = rect.bottom + gap + popupHeight;
    const above = rect.top - gap;

    if (below > window.innerHeight && above - popupHeight >= 0) {
      popup.style.top = `${rect.top - gap - popupHeight}px`;
    } else {
      popup.style.top = `${rect.bottom + gap}px`;
    }
    popup.style.left = `${rect.left}px`;
  }, [showPreview, quote_text, editorRef]);

  if (!showPreview || !quote_text) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 max-w-[400px] max-h-[320px] flex flex-col"
      style={{ top: 0, left: 0 }}>
      <div className="overflow-y-auto px-4 py-3 leading-relaxed">
        <div>
          <p className="text-[10px] text-text-secondary leading-snug">
            The previous messages are copied into the reply so the email
            remains self-contained and can carry its own conversation
            history. This is a long-standing convention used by email
            clients, not a requirement of the email protocol.
          </p>
          <button
            onClick={onClose}
            className="text-[10px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer mb-2">
            Close
          </button>
        </div>
        <div className="text-text-primary whitespace-pre-wrap text-[10px] font-mono leading-relaxed">
          {quote_text.replace(/^\n+/, "")}
        </div>
      </div>
    </div>
  );
}

export default ReplyPreview;
