const DEBUG = false;

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, IndentIncrease, IndentDecrease, Link, Unlink, X, Check, Image, AlignLeft, AlignCenter, AlignRight, Maximize2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IconWritingSign } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { build_pill_html } from "../../../utils/quote";
import { INLINE_STYLES, apply_inline_styles, add_inline_styles_to_html } from "../../../utils/email_html";
import { composeBodyAtom, composeCanUndoAtom, composeCanRedoAtom, composeUndoAtom, composeRedoAtom, signature_templatesAtom, email_templatesAtom } from "../../../state";

const HISTORY_DEBOUNCE_MS = 400;

type FormatAction = "bold" | "italic" | "underline" | "strike" | "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "blockquote" | "indent" | "outdent";

interface MdexEditorProps {
  quote_text?: string;
  editorRef?: React.RefObject<HTMLDivElement | null>;
  onAttachFiles?: (files: File[]) => void;
  onShowQuotePreview?: () => void;
  onBodyInput?: () => void;
  initialSignatureHtml?: string;
  initialHtml?: string;
  placeholder?: string;
}

type FormatBtnProps = {
  onClick: () => void;
  icon: LucideIcon | string;
  label: string;
  disabled?: boolean;
  size?: number;
};

interface MdexToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  editorEl: HTMLDivElement | null;
  onInsertImage: (file: File) => void;
  expandedImage: string | null;
  onExpand: (src: string | null) => void;
  onShowQuotePreview?: () => void;
}

const pillDraggingRef = { current: false };

function style_list(listEl: Element | null): void {
  if (!listEl) return;
  apply_inline_styles(listEl);
  listEl.querySelectorAll("li").forEach(apply_inline_styles);
}

function FormatBtn({ onClick, icon, label, disabled, size }: FormatBtnProps) {
  if (typeof icon === "string") {
    return (
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title={label}
        className={`p-1 rounded transition-colors cursor-pointer ${disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}>
        <span className="text-xs leading-none font-semibold">{icon}</span>
      </button>
    );
  }
  const IconCmp = icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      className={`p-1 rounded transition-colors cursor-pointer ${disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}>
      <IconCmp size={size ?? 15} />
    </button>
  );
}

function MdexToolbar({ editorRef, editorEl, onInsertImage, expandedImage, onExpand, onShowQuotePreview }: MdexToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRangeRef = useRef<Range | null>(null);
  const linkingRef = useRef(false);

  const [imageMode, setImageMode] = useState(false);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const imageModeRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setHandlePos] = useState({ lt: 0, ll: 0, rt: 0, rl: 0, h: 20 });
  const [showResizeBar, setShowResizeBar] = useState(false);
  const resizeHoverRef = useRef<ReturnType<typeof setTimeout>>();

  const format = useCallback(
    (action: FormatAction) => {
      editorEl?.focus();

      const get_anchor = () => window.getSelection()?.anchorNode;

      const get_closest = <T extends Element>(sel: string) =>
        (get_anchor()?.nodeType === Node.ELEMENT_NODE
          ? (get_anchor() as Element).closest(sel)
          : (get_anchor()?.parentElement as Element)?.closest?.(sel)) as T | null;

      const unwrap_heading = () => {
        const heading = get_closest("h1, h2, h3");
        if (!heading) return;
        const parent = heading.parentNode;
        if (!parent) return;
        while (heading.firstChild) parent.insertBefore(heading.firstChild, heading);
        heading.remove();
      };

      switch (action) {
        case "bold":
          document.execCommand("bold");
          break;
        case "italic":
          document.execCommand("italic");
          break;
        case "underline":
          document.execCommand("underline");
          break;
        case "strike":
          document.execCommand("strikeThrough");
          break;
        case "p":
        case "h1":
        case "h2":
        case "h3": {
          const li = get_closest<HTMLLIElement>("li");
          if (li) {
            const existing = li.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3");
            if (existing) {
              while (existing.firstChild) li.insertBefore(existing.firstChild, existing);
              existing.remove();
            }

            const sizes: Record<string, string> = { p: "14px", h1: "20px", h2: "18px", h3: "16px" };
            const weights: Record<string, string> = { p: "400", h1: "700", h2: "600", h3: "600" };
            li.style.fontSize = sizes[action];
            li.style.fontWeight = weights[action];
            apply_inline_styles(li);

            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(range);
          } else {
            document.execCommand("formatBlock", false, action);
            const el = get_closest(`${action === "p" ? "p,div" : action}`);
            if (el) apply_inline_styles(el);
          }
          break;
        }
        case "blockquote": {
          const existing = get_closest("blockquote");
          if (existing) {
            const parent = existing.parentNode;
            if (parent) {
              while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
              existing.remove();
            }
          } else {
            document.execCommand("formatBlock", false, "blockquote");
            const bq = get_closest("blockquote");
            if (bq) apply_inline_styles(bq);
          }
          break;
        }
        case "ul":
          unwrap_heading();
          document.execCommand("insertUnorderedList");
          style_list(get_closest("ul, ol"));
          break;
        case "ol":
          unwrap_heading();
          document.execCommand("insertOrderedList");
          style_list(get_closest("ul, ol"));
          break;
        case "indent":
          document.execCommand("indent");
          break;
        case "outdent":
          document.execCommand("outdent");
          break;
      }
      editorEl?.focus();
    },
    [editorEl],
  );

  const handle_link = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();

    const anchor = sel.anchorNode;
    const a = anchor?.nodeType === Node.ELEMENT_NODE
      ? (anchor as Element).closest("a")
      : (anchor?.parentElement as Element)?.closest?.("a");
    setLinkUrl(a?.getAttribute("href") || "");
    linkingRef.current = true;
    setLinking(true);
  }, []);

  const apply_link = useCallback(() => {
    if (!linkUrl) return;
    editorEl?.focus();
    const sel = window.getSelection();
    if (!sel || !savedRangeRef.current) return;

    const range = savedRangeRef.current;
    const text = range.toString();
    if (!text) return;

    const a = document.createElement("a");
    a.href = linkUrl;
    a.style.color = "#2563eb";
    a.style.textDecoration = "underline";
    a.textContent = text;

    range.deleteContents();
    range.insertNode(a);

    range.setStartAfter(a);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    linkingRef.current = false;
    setLinking(false);
    setVisible(false);
  }, [linkUrl, editorEl]);

  const remove_link = useCallback(() => {
    editorEl?.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (savedRangeRef.current) sel.addRange(savedRangeRef.current);
    document.execCommand("unlink");
    linkingRef.current = false;
    setLinking(false);
  }, [editorEl]);

  const cancel_link = useCallback(() => {
    linkingRef.current = false;
    setLinking(false);
    setLinkUrl("");
  }, []);

  const handle_file_select = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    onInsertImage(file);
    setVisible(false);
  }, [onInsertImage]);

  const update_handle_pos = () => {
    const img = selectedImageRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    const h = Math.max(20, r.height * 0.35);
    setHandlePos({
      lt: r.top + (r.height - h) / 2,
      ll: r.left - 4,
      rt: r.top + (r.height - h) / 2,
      rl: r.right - 4,
      h,
    });
  };

  const align_image = useCallback((align: "left" | "center" | "right") => {
    const img = selectedImageRef.current;
    if (!img) return;
    img.style.cssFloat = "";
    img.style.display = "block";
    if (align === "right") {
      img.style.margin = "4px 0 4px auto";
    } else if (align === "center") {
      img.style.margin = "4px auto";
    } else {
      img.style.margin = "4px 0";
    }
    update_handle_pos();
    editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [editorRef]);

  const delete_image = useCallback(() => {
    const img = selectedImageRef.current;
    if (!img) return;
    img.remove();
    imageModeRef.current = false;
    setImageMode(false);
    selectedImageRef.current = null;
    editorRef.current?.focus();
    editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [editorRef]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handler = () => {
      if (linkingRef.current || imageModeRef.current || pillDraggingRef.current) return;

      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
        setVisible(false);
        return;
      }

      if (sel.isCollapsed) {
        setVisible(false);
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setPos({
        top: rect.top - 40,
        left: rect.left + rect.width / 2,
      });
      setVisible(true);
    };

    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [editorRef]);

  useEffect(() => {
    if (!editorEl) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (linkingRef.current) return;
      if (target.getAttribute?.("data-role") === "quote-pill") {
        onShowQuotePreview?.();
        return;
      }
      if (target.tagName === "IMG") {
        e.stopPropagation();
        selectedImageRef.current = target as HTMLImageElement;
        imageModeRef.current = true;
        setImageMode(true);
        setShowResizeBar(true);
        const rect = (target as HTMLImageElement).getBoundingClientRect();
        const h = Math.max(20, rect.height * 0.35);
        setPos({ top: rect.top - 40, left: rect.left + rect.width / 2 });
        setHandlePos({
          lt: rect.top + (rect.height - h) / 2,
          ll: rect.left - 4,
          rt: rect.top + (rect.height - h) / 2,
          rl: rect.right - 4,
          h,
        });
      } else if (imageModeRef.current) {
        imageModeRef.current = false;
        setImageMode(false);
        selectedImageRef.current = null;
        setShowResizeBar(false);
      }
    };

    const hover_handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && target === selectedImageRef.current) {
        clearTimeout(resizeHoverRef.current);
        setShowResizeBar(true);
      }
    };

    const leave_handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const related = e.relatedTarget as HTMLElement | null;
      if (target.tagName === "IMG" && target === selectedImageRef.current) {
        if (!related || !related.closest?.(".resize-bar")) {
          clearTimeout(resizeHoverRef.current);
          resizeHoverRef.current = setTimeout(() => setShowResizeBar(false), 200);
        }
      }
    };

    editorEl.addEventListener("click", handler);
    editorEl.addEventListener("mouseover", hover_handler);
    editorEl.addEventListener("mouseout", leave_handler);
    return () => {
      editorEl.removeEventListener("click", handler);
      editorEl.removeEventListener("mouseover", hover_handler);
      editorEl.removeEventListener("mouseout", leave_handler);
    };
  }, [editorEl, onShowQuotePreview]);

  useEffect(() => {
    if (!editorEl) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "IMG") return;
      onExpand((target as HTMLImageElement).src);
    };
    editorEl.addEventListener("dblclick", handler);
    return () => editorEl.removeEventListener("dblclick", handler);
  }, [editorEl, onExpand]);

  useEffect(() => {
    if (!imageMode || !editorEl) return;
    const update = () => {
      const img = selectedImageRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      const h = Math.max(20, r.height * 0.35);
      setHandlePos({
        lt: r.top + (r.height - h) / 2,
        ll: r.left - 4,
        rt: r.top + (r.height - h) / 2,
        rl: r.right - 4,
        h,
      });
    };
    update();
    window.addEventListener("scroll", update);
    editorEl.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    if (selectedImageRef.current) ro.observe(selectedImageRef.current);
    return () => {
      window.removeEventListener("scroll", update);
      editorEl.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [imageMode, editorEl]);

  useEffect(() => {
    if (!imageMode || !editorEl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        imageModeRef.current = false;
        setImageMode(false);
        selectedImageRef.current = null;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [imageMode, editorEl]);

  useEffect(() => {
    if (!imageMode || !editorEl) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (editorEl.contains(target)) return;
      if ((target as HTMLElement)?.closest?.(".image-toolbar, .resize-bar")) return;
      imageModeRef.current = false;
      setImageMode(false);
      setShowResizeBar(false);
      selectedImageRef.current = null;
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [imageMode, editorEl]);

  const start_resize = useCallback((e: React.MouseEvent, side: "left" | "right") => {
    e.preventDefault();
    const img = selectedImageRef.current;
    if (!img) return;
    const origW = img.offsetWidth;
    const rect = img.getBoundingClientRect();
    const on_move = (me: MouseEvent) => {
      let newW: number;
      if (side === "right") {
        newW = origW + (me.clientX - rect.right);
      } else {
        newW = origW + (rect.left - me.clientX);
      }
      newW = Math.max(30, Math.min(newW, 1000));
      img.style.width = `${newW}px`;
      img.style.height = "auto";
      const r = img.getBoundingClientRect();
      const h = Math.max(20, r.height * 0.35);
      setHandlePos({
        lt: r.top + (r.height - h) / 2,
        ll: r.left - 4,
        rt: r.top + (r.height - h) / 2,
        rl: r.right - 4,
        h,
      });
    };
    const on_up = () => {
      document.removeEventListener("mousemove", on_move);
      document.removeEventListener("mouseup", on_up);
      editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("mousemove", on_move);
    document.addEventListener("mouseup", on_up);
  }, [editorRef]);

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handle_file_select} />

      {linking && (
        <div
          className="fixed z-[9999] flex items-center gap-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1.5"
          style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-48 px-2 py-0.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-400"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); apply_link(); }
              if (e.key === "Escape") cancel_link();
            }}
          />
          <FormatBtn onClick={apply_link} icon={Check} label="Apply" />
          <FormatBtn onClick={remove_link} icon={Unlink} label="Remove" />
          <FormatBtn onClick={cancel_link} icon={X} label="Cancel" />
        </div>
      )}

      {imageMode && (
        <>
          <div
            className="fixed z-[9999] flex items-center gap-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1.5 image-toolbar"
            style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}>
            <FormatBtn onClick={() => align_image("left")} icon={AlignLeft} label="Align left" />
            <FormatBtn onClick={() => align_image("center")} icon={AlignCenter} label="Center" />
            <FormatBtn onClick={() => align_image("right")} icon={AlignRight} label="Align right" />
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <FormatBtn onClick={() => { if (selectedImageRef.current) onExpand(selectedImageRef.current.src); }} icon={Maximize2} label="Expand" />
            <FormatBtn onClick={delete_image} icon={X} label="Delete" />
          </div>
          {showResizeBar && selectedImageRef.current && editorEl && (() => {
            const r = selectedImageRef.current!.getBoundingClientRect();
            const containerRect = editorEl.parentElement!.getBoundingClientRect();
            const gripH = Math.max(40, r.height * 0.4);
            return (
              <>
                <div
                  className="absolute flex items-center cursor-ew-resize resize-bar"
                  style={{ top: r.top - containerRect.top, left: r.left - containerRect.left - 8, height: r.height, width: 6 }}
                  onMouseDown={(e) => start_resize(e, "left")}
                  onMouseEnter={() => { clearTimeout(resizeHoverRef.current); setShowResizeBar(true); }}>
                  <div
                    className="w-2 bg-slate-500 border border-white rounded shadow-md cursor-ew-resize"
                    style={{ height: gripH }}
                  />
                </div>
                <div
                  className="absolute flex items-center cursor-ew-resize resize-bar"
                  style={{ top: r.top - containerRect.top, left: r.right - containerRect.left + 2, height: r.height, width: 6 }}
                  onMouseDown={(e) => start_resize(e, "right")}
                  onMouseEnter={() => { clearTimeout(resizeHoverRef.current); setShowResizeBar(true); }}>
                  <div
                    className="w-2 bg-slate-500 border border-white rounded shadow-md cursor-ew-resize"
                    style={{ height: gripH }}
                  />
                </div>
              </>
            );
          })()}
        </>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center"
          onClick={() => onExpand(null)}>
          <img
            src={expandedImage}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {!linking && !imageMode && visible && (
        <div
          className="fixed z-[100] flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-slate-200 px-1 py-1"
          style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}>
          <FormatBtn onClick={() => format("bold")} icon={Bold} label="Bold" />
          <FormatBtn onClick={() => format("italic")} icon={Italic} label="Italic" />
          <FormatBtn onClick={() => format("underline")} icon={Underline} label="Underline" />
          <FormatBtn onClick={() => format("strike")} icon={Strikethrough} label="Strikethrough" />
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <FormatBtn onClick={() => format("p")} icon="P" label="Paragraph" />
          <FormatBtn onClick={() => format("h1")} icon="H1" label="Heading 1" />
          <FormatBtn onClick={() => format("h2")} icon="H2" label="Heading 2" />
          <FormatBtn onClick={() => format("h3")} icon="H3" label="Heading 3" />
          <FormatBtn onClick={() => format("blockquote")} icon={Quote} label="Quote" size={13} />
          <FormatBtn onClick={handle_link} icon={Link} label="Link" size={13} />
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <FormatBtn onClick={() => format("ul")} icon={List} label="Bullet List" />
          <FormatBtn onClick={() => format("ol")} icon={ListOrdered} label="Numbered List" />
          <FormatBtn onClick={() => format("indent")} icon={IndentIncrease} label="Indent" />
          <FormatBtn onClick={() => format("outdent")} icon={IndentDecrease} label="Outdent" />
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <FormatBtn onClick={() => fileInputRef.current?.click()} icon={Image} label="Image" />
        </div>
      )}
    </>
  );
}

  const MdexEditor = ({ quote_text = "", editorRef, onAttachFiles, onShowQuotePreview, onBodyInput, initialSignatureHtml, initialHtml, placeholder = "Write your message..." }: MdexEditorProps) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  const draggedPillRef = useRef<HTMLElement | null>(null);
  const injectedRef = useRef(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ top: number; left: number } | null>(null);
  const [slashFilter, setSlashFilter] = useState("");
  const slashBlockRef = useRef<HTMLElement | null>(null);
  const slashFileInputRef = useRef<HTMLInputElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  const body = useAtomValue(composeBodyAtom);
  const signature_templates = useAtomValue(signature_templatesAtom);
  const email_templates = useAtomValue(email_templatesAtom);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const setCanUndoAtom = useSetAtom(composeCanUndoAtom);
  const setCanRedoAtom = useSetAtom(composeCanRedoAtom);
  const setUndoAtom = useSetAtom(composeUndoAtom);
  const setRedoAtom = useSetAtom(composeRedoAtom);

  useEffect(() => {
    setCanUndoAtom(canUndo);
  }, [canUndo]);

  useEffect(() => {
    setCanRedoAtom(canRedo);
  }, [canRedo]);

  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const push_snapshot = useCallback((html: string) => {
    const prev = historyRef.current[indexRef.current];
    if (html === prev) return;
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(html);
    if (historyRef.current.length > 10) historyRef.current.shift();
    indexRef.current = historyRef.current.length - 1;
    setCanUndo(indexRef.current > 0);
    setCanRedo(false);
  }, []);

  const save_snapshot = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const div = internalRef.current;
      if (!div) return;
      push_snapshot(div.innerHTML);
    }, HISTORY_DEBOUNCE_MS);
  }, [push_snapshot]);

  const save_snapshot_immediate = useCallback(() => {
    clearTimeout(debounceRef.current);
    const div = internalRef.current;
    if (!div) return;
    push_snapshot(div.innerHTML);
  }, [push_snapshot]);

  const undo = useCallback(() => {
    const div = internalRef.current;
    if (!div || indexRef.current <= 0) return;
    indexRef.current--;
    div.innerHTML = historyRef.current[indexRef.current];
    div.focus();
    setCanUndo(indexRef.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const div = internalRef.current;
    if (!div || indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current++;
    div.innerHTML = historyRef.current[indexRef.current];
    div.focus();
    setCanUndo(true);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  useEffect(() => {
    setUndoAtom({ current: undo });
    setRedoAtom({ current: redo });
    return () => {
      setUndoAtom({ current: () => {} });
      setRedoAtom({ current: () => {} });
      setCanUndoAtom(false);
      setCanRedoAtom(false);
    };
  }, [undo, redo, setUndoAtom, setRedoAtom, setCanUndoAtom, setCanRedoAtom]);

  const insert_image_file = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const div = internalRef.current;
      if (!div) return;
      div.focus();
      document.execCommand("insertHTML", false, `<img style="${INLINE_STYLES.img}" src="${reader.result}" />`);
      save_snapshot_immediate();
    };
    reader.readAsDataURL(file);
  }, [save_snapshot_immediate]);

  const slashItems = useMemo(() => {
    const items: { action: string; icon: any; label: string }[] = [
      { action: "p", icon: "P" as const, label: "Text" },
      { action: "h1", icon: "H1" as const, label: "Heading 1" },
      { action: "h2", icon: "H2" as const, label: "Heading 2" },
      { action: "h3", icon: "H3" as const, label: "Heading 3" },
      { action: "ul", icon: List, label: "Bullet List" },
      { action: "ol", icon: ListOrdered, label: "Numbered List" },
      { action: "blockquote", icon: Quote, label: "Quote" },
      { action: "image", icon: Image, label: "Image" },
    ];
    if (signature_templates.some(t => t.body)) {
      items.push({ action: "---", icon: "" as const, label: "" });
    }
    for (const tpl of signature_templates) {
      if (tpl.body) {
        items.push({ action: `sig|${tpl.id}`, icon: IconWritingSign, label: tpl.name });
      }
    }
    if (email_templates.length > 0) {
      items.push({ action: "---", icon: "" as const, label: "" });
    }
    for (const tpl of email_templates) {
      items.push({ action: `tpl|${tpl.id}`, icon: IconWritingSign, label: tpl.name });
    }
    return items;
  }, [signature_templates, email_templates]);

  const exec_slash_action = useCallback((action: string) => {
    const block = slashBlockRef.current;
    if (!block) return;
    const div = internalRef.current;
    if (!div) return;

    block.textContent = "";
    setSlashMenu(null);
    setSlashFilter("");
    slashBlockRef.current = null;
    div.focus();

    if (action.startsWith("sig|")) {
      const templateId = action.slice(4);
      const template = signature_templates.find(t => t.id === templateId);
      if (template?.body) {
        const range = document.createRange();
        range.setStart(block, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("insertHTML", false, `<div data-signature="${template.id}" style="margin:8px 0">${template.body}</div>`);
        save_snapshot_immediate();
      }
      return;
    }

    if (action.startsWith("tpl|")) {
      const templateId = action.slice(4);
      const template = email_templates.find(t => t.id === templateId);
      if (template?.body) {
        const range = document.createRange();
        range.setStart(block, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("insertHTML", false, template.body);
        save_snapshot_immediate();
      }
      return;
    }

    if (action === "image") {
      slashFileInputRef.current?.click();
      return;
    }

    const range = document.createRange();
    range.setStart(block, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const get_closest = <T extends Element>(sel: string) =>
      (window.getSelection()?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (window.getSelection()!.anchorNode as Element).closest(sel)
        : (window.getSelection()?.anchorNode?.parentElement as Element)?.closest?.(sel)) as T | null;

    if (action === "ul") {
      document.execCommand("insertUnorderedList");
      style_list(get_closest("ul, ol"));
    } else if (action === "ol") {
      document.execCommand("insertOrderedList");
      style_list(get_closest("ul, ol"));
    } else {
      document.execCommand("formatBlock", false, action);
      const el = get_closest(`${action === "p" ? "p,div" : action}`);
      if (el) apply_inline_styles(el);
    }
    save_snapshot_immediate();
  }, [save_snapshot_immediate, signature_templates, email_templates]);

  const handle_key_down = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.key !== "Tab") return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const node = sel.anchorNode;
    if (!node) return;

    const internalEl = internalRef.current;
    if (!internalEl) return;

    const block =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element).closest("li, p, div, h1, h2, h3, blockquote")
        : (node.parentElement as Element)?.closest?.("li, p, div, h1, h2, h3, blockquote");
    if (!block) return;
    if (block === internalEl) {
      const hasBlocks = internalEl.querySelector("p, div, li, h1, h2, h3, ol, ul");
      if (hasBlocks) return;
    }

    const text = block.textContent?.trim() || "";

    if (text === "-" || text === "*") {
      e.preventDefault();
      replace_with_list(block, internalEl, false, "");
    } else if (text === "1.") {
      e.preventDefault();
      replace_with_list(block, internalEl, true, "");
    }
  }, [undo, redo]);

  const handle_key_up = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "/" && !slashMenu) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const node = sel.anchorNode;
      if (node?.nodeType !== Node.TEXT_NODE) return;
      if (node.textContent !== "/" || sel.anchorOffset !== 1) return;

      const block = (node.parentElement as Element)?.closest?.("li, p, div, h1, h2, h3, blockquote");
      if (!block) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      slashBlockRef.current = block as HTMLElement;
      setSlashFilter("");
      setSlashMenu({ top: rect.bottom + 4, left: rect.left });
      return;
    }

    if (slashMenu) {
      const block = slashBlockRef.current;
      if (!block) return;
      const text = block.textContent || "";
      if (!text.startsWith("/")) {
        setSlashMenu(null);
        setSlashFilter("");
        slashBlockRef.current = null;
        return;
      }
      setSlashFilter(text.slice(1));
    }
  }, [slashMenu]);

  const handle_slash_file_select = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    insert_image_file(file);
  }, [insert_image_file]);

  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSlashMenu(null);
        setSlashFilter("");
        slashBlockRef.current = null;
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const filtered = slashItems.filter((item) =>
          (slashFilter === "" || item.label.toLowerCase().includes(slashFilter.toLowerCase())) && item.action !== "---"
        );
        if (filtered.length > 0) {
          exec_slash_action(filtered[0].action);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [slashMenu, slashFilter, exec_slash_action]);

  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e: MouseEvent) => {
      if (slashMenuRef.current?.contains(e.target as Node)) return;
      setSlashMenu(null);
      setSlashFilter("");
      slashBlockRef.current = null;
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [slashMenu]);

  const handle_drag_start = useCallback((e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute?.("data-role") === "quote-pill") {
      draggedPillRef.current = target;
      pillDraggingRef.current = true;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    }
  }, []);

  const handle_drag_over = useCallback((e: React.DragEvent) => {
    if (draggedPillRef.current) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handle_drag_end = useCallback(() => {
    draggedPillRef.current = null;
    pillDraggingRef.current = false;
  }, []);

  const handle_drop = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (draggedPillRef.current) {
      const pill = draggedPillRef.current;
      draggedPillRef.current = null;

      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range) return;

      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const outerWrapper = pill.closest('[contenteditable="false"]') as HTMLElement | null;
      if (outerWrapper?.parentElement) {
        const clone = outerWrapper.cloneNode(true) as HTMLElement;
        range.insertNode(clone);
        outerWrapper.parentElement.removeChild(outerWrapper);
      }
      save_snapshot_immediate();
      return;
    }

    const allFiles = Array.from(e.dataTransfer.files);
    DEBUG && console.log("[mdex] drop fired, files:", allFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    const imageFiles = allFiles.filter((f) => f.type.startsWith("image/"));
    const nonImageFiles = allFiles.filter((f) => !f.type.startsWith("image/"));
    DEBUG && console.log("[mdex] drop - images:", imageFiles.length, "non-images:", nonImageFiles.length);
    imageFiles.forEach((f) => insert_image_file(f));
    if (nonImageFiles.length) {
      DEBUG && console.log("[mdex] drop - routing non-image files to onAttachFiles:", nonImageFiles.map((f) => f.name));
      onAttachFiles?.(nonImageFiles);
    }
  }, [insert_image_file, onAttachFiles, save_snapshot_immediate]);

  const handle_paste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    DEBUG && console.log("[mdex] paste fired, clipboard items:", items.map((i) => ({ kind: i.kind, type: i.type })));
    const imageItems = items.filter((i) => i.type.startsWith("image/"));
    const nonImageFileItems = items.filter((i) => i.kind === "file" && !i.type.startsWith("image/"));
    const htmlItem = items.find((i) => i.type === "text/html");
    if (imageItems.length || nonImageFileItems.length || htmlItem) {
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) insert_image_file(file);
      });
      if (nonImageFileItems.length) {
        const files = nonImageFileItems.map((i) => i.getAsFile()).filter((f): f is File => f !== null);
        DEBUG && console.log("[mdex] paste - routing non-image files to onAttachFiles:", files.map((f) => f.name));
        onAttachFiles?.(files);
      }
      if (htmlItem) {
        htmlItem.getAsString((html) => {
          const processed = add_inline_styles_to_html(html);
          document.execCommand("insertHTML", false, processed);
          save_snapshot_immediate();
        });
      } else if (!imageItems.length) {
        const textItem = items.find((i) => i.type === "text/plain");
        if (textItem) {
          textItem.getAsString((text) => {
            document.execCommand("insertText", false, text);
            save_snapshot_immediate();
          });
        }
      }
    }
  }, [insert_image_file, onAttachFiles, save_snapshot_immediate]);

  const set_ref = useCallback(
    (node: HTMLDivElement | null) => {
      (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (editorRef) (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setEditorEl(node);
    },
    [editorRef],
  );

  const replace_with_list = (block: Element, container: HTMLElement, ordered: boolean, content: string) => {
    const list = document.createElement(ordered ? "ol" : "ul");
    const li = document.createElement("li");
    if (content) li.textContent = content;
    apply_inline_styles(list);
    apply_inline_styles(li);
    list.appendChild(li);

    if (block === container) {
      container.innerHTML = "";
      container.appendChild(list);
    } else {
      block.replaceWith(list);
    }

    const range = document.createRange();
    const textNode = li.firstChild;
    if (textNode) {
      range.setStart(textNode, (textNode as Text).length);
    } else {
      range.setStart(li, 0);
    }
    range.collapse(true);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  useEffect(() => {
    const div = internalRef.current;
    if (!div) return;

    if (!injectedRef.current) {
      injectedRef.current = true;

      if (initialHtml !== undefined) {
        div.innerHTML = add_inline_styles_to_html(initialHtml);
        if (!div.firstChild) {
          const d = document.createElement("div");
          d.innerHTML = "<br>";
          div.appendChild(d);
        }
      } else if (body.body_html || body.body_text) {
        div.innerHTML = body.body_html ? add_inline_styles_to_html(body.body_html) : "";
      } else {
        for (let i = 0; i < 9; i++) {
          const d = document.createElement("div");
          d.innerHTML = "<br>";
          div.appendChild(d);
        }

        const pillHtml = build_pill_html(quote_text);
        if (pillHtml && !div.querySelector('[data-role="quote-pill"]')) {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = pillHtml;
          while (wrapper.firstChild) div.appendChild(wrapper.firstChild);
          const spacer = document.createElement("div");
          spacer.innerHTML = "<br>";
          div.appendChild(spacer);
        }
      }

      save_snapshot_immediate();
      div.focus();
      const range = document.createRange();
      range.setStart(div.firstChild!, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    const before_input_handler = (e: Event) => {
      const ie = e as InputEvent;

      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;

      const node = sel.anchorNode;
      if (!node) return;

      const block =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element).closest("li, p, div, h1, h2, h3, blockquote")
          : (node.parentElement as Element)?.closest?.("li, p, div, h1, h2, h3, blockquote");
      if (!block) return;
      if (block === div) {
        const hasBlocks = div.querySelector("p, div, li, h1, h2, h3, ol, ul");
        if (hasBlocks) return;
      }

      const tag = block.tagName;
      const text = block.textContent || "";

      DEBUG && console.log(
        "[mdex] beforeinput",
        "inputType:", ie.inputType,
        "data:", ie.data,
        "block:", tag,
        "blockText:", JSON.stringify(text.slice(0, 50)),
      );

      // Empty list item + Enter → exit list
      if (tag === "LI" && text.trim() === "" && ie.inputType === "insertParagraph") {
        e.preventDefault();
        const p = document.createElement("div");
        p.innerHTML = "<br>";
        apply_inline_styles(p);
        block.replaceWith(p);
        const range = document.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        DEBUG && console.log("[mdex] exited list (empty LI)");
        return;
      }
      if (tag === "LI") return;

      // Empty blockquote + Enter → exit quote
      if (tag === "BLOCKQUOTE" && text.trim() === "" && ie.inputType === "insertParagraph") {
        e.preventDefault();
        const p = document.createElement("div");
        p.innerHTML = "<br>";
        apply_inline_styles(p);
        block.replaceWith(p);
        const range = document.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        DEBUG && console.log("[mdex] exited blockquote (empty)");
        return;
      }

      // Blockquote + Enter → exit blockquote to new line below
      if (tag === "BLOCKQUOTE" && ie.inputType === "insertParagraph") {
        e.preventDefault();
        const p = document.createElement("div");
        p.innerHTML = "<br>";
        apply_inline_styles(p);
        block.parentNode?.insertBefore(p, block.nextSibling);
        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        return;
      }

      // Enter on pattern → handled via Tab key only
    };

    div.addEventListener("beforeinput", before_input_handler);
    return () => {
      div.removeEventListener("beforeinput", before_input_handler);
    };
  }, [body.body_html, body.body_text, quote_text, initialHtml, save_snapshot_immediate]);

  const signatureInsertedRef = useRef(false);

  useEffect(() => {
    if (!initialSignatureHtml || signatureInsertedRef.current) return;
    const div = internalRef.current;
    if (!div) return;
    signatureInsertedRef.current = true;

    const quotePill = div.querySelector('[data-role="quote-pill"]');
    const range = document.createRange();
    if (quotePill && quotePill.parentNode) {
      range.setStartBefore(quotePill);
    } else {
      range.setStart(div, div.childNodes.length);
    }
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    document.execCommand("insertHTML", false, initialSignatureHtml);
    save_snapshot_immediate();

    const firstChild = div.firstChild;
    if (firstChild) {
      const r = document.createRange();
      r.setStart(firstChild, 0);
      r.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }, [initialSignatureHtml, save_snapshot_immediate]);

  return (
    <div className="relative h-full flex flex-col overflow-visible">
      <div
        ref={set_ref}
        contentEditable
        suppressContentEditableWarning
        onDragStart={handle_drag_start}
        onDragOver={handle_drag_over}
        onDragEnd={handle_drag_end}
        onDrop={handle_drop}
        onPaste={handle_paste}
        onKeyDown={handle_key_down}
        onKeyUp={handle_key_up}
        onInput={() => { onBodyInput?.(); save_snapshot(); }}
        className="flex-1 h-full outline-none text-sm leading-relaxed px-0 overflow-x-hidden overflow-y-auto"
        data-placeholder={placeholder}
      />
      <input ref={slashFileInputRef} type="file" accept="image/*" hidden onChange={handle_slash_file_select} />

      {slashMenu && (
        <div
          ref={slashMenuRef}
          className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px]"
          style={{ top: slashMenu.top, left: slashMenu.left }}
        >
          {(() => {
            const filtered = slashItems.filter((item) =>
              slashFilter === "" || item.label.toLowerCase().includes(slashFilter.toLowerCase())
            );
            return filtered.length > 0
              ? filtered.map((item) =>
                  item.action === "---" ? (
                    <div key="sep" className="border-t border-slate-200 my-1" />
                  ) : (
                    <button
                      key={item.action}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec_slash_action(item.action)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-primary hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {typeof item.icon === "string" ? (
                        <span className="text-xs leading-none font-semibold w-5 text-center text-slate-500">{item.icon}</span>
                      ) : (
                        <span className="w-5 flex items-center justify-center text-slate-500">
                          <item.icon size={14} />
                        </span>
                      )}
                      <span>{item.label}</span>
                    </button>
                  )
                )
              : (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSlashMenu(null)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  Close menu
                </button>
              );
          })()}
        </div>
      )}
      <MdexToolbar
        editorRef={internalRef}
        editorEl={editorEl}
        onInsertImage={insert_image_file}
        expandedImage={expandedImage}
        onExpand={setExpandedImage}
        onShowQuotePreview={onShowQuotePreview}
      />
    </div>
  );
};

export { MdexEditor, MdexToolbar };
export type { MdexEditorProps };
