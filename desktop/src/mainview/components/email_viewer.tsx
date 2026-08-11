const DEBUG = false;

import { useState, useEffect, useRef, memo } from "react";
import { Download } from "lucide-react";
import { IconFile, IconFileTypePdf, IconPhoto, IconFileTypeTxt, IconFileSpreadsheet, IconZip, IconMarkdown, IconFileTypeJs, IconFileTypeCss, IconFileTypeHtml, IconFileMusic, IconVideo, IconCode } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { currentMailViewAtom, savedFileToastAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { EmailBodyIFrame } from "./email_body_iframe";
import { format_date_full } from "@/shared/datetime";
import { rpc } from "../rpc";

const emailCache = new Map<string, { email: EmailRowWire; attachments: AttachmentWire[] }>();

type Props = {
  email: EmailPreviewWire;
  onClose?: () => void;
  onOverflowChange?: (overflowPx: number) => void;
};

function format_size(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachment_icon(mime_type: string | null) {
  const m = mime_type ?? "";
  if (m === "application/pdf") return { icon: IconFileTypePdf, bg: "bg-red-100", color: "text-red-700" };
  if (m.startsWith("image/")) return { icon: IconPhoto, bg: "bg-blue-100", color: "text-blue-700" };
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("csv")) return { icon: IconFileSpreadsheet, bg: "bg-emerald-100", color: "text-emerald-700" };
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("7z") || m.includes("gzip") || m.includes("compress")) return { icon: IconZip, bg: "bg-orange-100", color: "text-orange-700" };
  if (m.includes("markdown") || m.endsWith("md")) return { icon: IconMarkdown, bg: "bg-blue-100", color: "text-blue-700" };
  if (m.includes("javascript") || m.includes("ecmascript") || m === "text/jsx" || m === "text/tsx") return { icon: IconFileTypeJs, bg: "bg-yellow-100", color: "text-yellow-700" };
  if (m.includes("css")) return { icon: IconFileTypeCss, bg: "bg-indigo-100", color: "text-indigo-700" };
  if (m.includes("html")) return { icon: IconFileTypeHtml, bg: "bg-orange-100", color: "text-orange-700" };
  if (m.startsWith("audio/")) return { icon: IconFileMusic, bg: "bg-purple-100", color: "text-purple-700" };
  if (m.startsWith("video/")) return { icon: IconVideo, bg: "bg-pink-100", color: "text-pink-700" };
  if (m.includes("text/") || m.includes("document") || m.includes("word") || m.includes("rtf")) return { icon: IconFileTypeTxt, bg: "bg-amber-100", color: "text-amber-700" };
  if (m.includes("json") || m.includes("xml") || m.includes("yaml") || m.includes("toml")) return { icon: IconCode, bg: "bg-gray-100", color: "text-gray-700" };
  return { icon: IconFile, bg: "bg-gray-100", color: "text-gray-600" };
}

function EmailViewer({ email, onClose, onOverflowChange }: Props) {
  const setCurrentView = useSetAtom(currentMailViewAtom);
  const [fullEmail, setFullEmail] = useState<EmailRowWire | null>(null);
  const [attachments, setAttachments] = useState<AttachmentWire[]>([]);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [metaHidden, setMetaHidden] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const setSavedFileToast = useSetAtom(savedFileToastAtom);
  const prevIdRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const loadStartRef = useRef<number>(0);

  useEffect(() => {
    const id = email.id;
    if (id === prevIdRef.current) return;
    prevIdRef.current = id;

    const label = `email_load_${id.slice(0, 8)}`;
    console.time(label);
    setMetaHidden(false);

    const cached = emailCache.get(id);
    if (cached) {
      console.timeLog(label, 'cache hit');
      setFullEmail(cached.email);
      setAttachments(cached.attachments);
      setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: cached.email } : prev);
      console.timeEnd(label);
      return;
    }

    console.timeLog(label, 'no cache, start fetch');
    setBodyLoading(true);
    loadStartRef.current = performance.now();

    rpc.request(messages.mail_get, { id })
      .then((data: unknown) => {
        const elapsed = performance.now() - loadStartRef.current;
        console.timeLog(label, `RPC done in ${elapsed.toFixed(0)}ms`);
        const result = data as MailGetResponse;
        if (result.email) emailCache.set(id, { email: result.email, attachments: result.attachments });
        console.timeLog(label, 'set fullEmail');
        setFullEmail(result.email);
        setAttachments(result.attachments);
        setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: result.email } : prev);
      })
      .catch((e: unknown) => {
        console.error(`${label} mail:get failed`, e);
        setFullEmail(null);
        setAttachments([]);
        setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: null } : prev);
      })
      .finally(() => {
        console.timeLog(label, 'bodyLoading=false');
        setBodyLoading(false);
        console.timeEnd(label);
      });
  }, [email.id, setCurrentView]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const label = `email_scroll_${email.id.slice(0, 8)}`;
    let lastY = el.scrollTop;
    let hidden = false;
    let scrollCount = 0;
    let compTimer: ReturnType<typeof setTimeout> | null = null;
    const compensate_meta = (dH: number, dir: 1 | -1) => {
      if (compTimer) clearTimeout(compTimer);
      compTimer = setTimeout(() => {
        compTimer = null;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dir * dH));
      }, 220);
    };
    const onScroll = () => {
      scrollCount++;
      const y = el.scrollTop;
      if (scrollCount <= 3 || scrollCount % 20 === 0) {
        DEBUG && console.log(`[${label}] scroll #${scrollCount} top=${y} lastY=${lastY} hidden=${hidden} scrollH=${el.scrollHeight} clientH=${el.clientHeight}`);
      }
      if (y > lastY && y > 60) {
        if (!hidden) {
          hidden = true;
          const dH = metaRef.current?.getBoundingClientRect().height ?? 0;
          setMetaHidden(true);
          if (dH > 0) compensate_meta(dH, 1);
        }
      } else if (y < lastY && y < 40) {
        if (hidden) {
          hidden = false;
          const dH = metaRef.current?.scrollHeight ?? 0;
          setMetaHidden(false);
          if (dH > 0) compensate_meta(dH, -1);
        }
      }
      lastY = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (compTimer) clearTimeout(compTimer);
    };
  }, [email.id]);

  const download_attachment = async (att: AttachmentWire) => {
    DEBUG && console.log("[download_attachment]", { id: att.id, filename: att.filename, local_path: att.local_path });
    setDownloadingId(att.id);
    try {
      if (att.local_path) {
        DEBUG && console.log("[download_attachment] file is local — revealing");
        await rpc.request(messages.reveal_in_finder, { path: att.local_path });
        setSavedFileToast({ filename: att.filename, path: att.local_path, isLocal: true });
      } else {
        DEBUG && console.log("[download_attachment] no local_path — calling attachment:save");
        const result = await rpc.request(messages.attachment_save, { id: att.id });
        if (result.cancelled) return;
        setSavedFileToast({ filename: att.filename, path: result.savedTo! });
      }
    } catch (e) {
      console.error("download failed", e);
    } finally {
      setDownloadingId(null);
    }
  };



  useEffect(() => {
    if (fullEmail?.body_html) {
      console.timeLog(`email_load_${email.id.slice(0, 8)}`, `iframe rendering (body_html length=${fullEmail.body_html.length})`);
    }
  });

  const hasFrom = email.from_name || email.from_address;
  const showMeta = fullEmail?.to || fullEmail?.cc || fullEmail?.sent_at;

  return (
    <div ref={bodyRef} className="flex-1 overflow-y-auto min-h-0 overflow-hidden rounded-t-xl" style={{ overflowAnchor: 'none' }}>
      {/* subject — pill animation on scroll */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-10 bg-white/95 overflow-hidden rounded-t-xl"
        style={{
          top: metaHidden ? 16 : 0,
          borderRadius: metaHidden ? 9999 : 0,
          marginLeft: metaHidden ? 12 : 0,
          marginRight: metaHidden ? 12 : 0,
          boxShadow: metaHidden ? '0 4px 20px rgba(0,0,0,0.12)' : 'none',
          transition: 'all 0.2s ease-in-out',
        }}>
        <div className={metaHidden ? '' : 'border-b border-slate-50'}>
          <div
            className="flex items-start justify-between px-6"
            style={{
              paddingTop: metaHidden ? 8 : 20,
              paddingBottom: metaHidden ? 8 : 12,
              transition: 'all 0.2s ease-in-out',
            }}>
            <div className="min-w-0 flex-1 mr-4">
              <h2 className="text-md font-semibold text-text-primary truncate">
                {email.subject || "(No subject)"}
              </h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l10 10M15 5l-10 10" />
                </svg>
              </button>
            )}
          </div>

          {/* meta — hides on parent scroll */}
          <div
            ref={metaRef}
            className="transition-all duration-200 ease-in-out overflow-hidden"
            style={{
              maxHeight: metaHidden ? 0 : 200,
              opacity: metaHidden ? 0 : 1,
            }}>
            <div className="px-6 pt-1 pb-3 space-y-1 text-xs">
              <div className="flex overflow-hidden">
                <span className="text-text-secondary w-16 shrink-0 text-xs">From</span>
                <span className="text-text-primary truncate text-xs flex-1 min-w-0">
                  {hasFrom ? `${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}` : "—"}
                </span>
              </div>
              {showMeta ? (
                <>
                  <div className="flex overflow-hidden">
                    <span className="text-text-secondary w-16 shrink-0 text-xs">To</span>
                    <span className="text-text-primary truncate text-xs flex-1 min-w-0">{fullEmail!.to || "—"}</span>
                  </div>
                  {fullEmail!.cc && (
                    <div className="flex overflow-hidden">
                      <span className="text-text-secondary w-16 shrink-0 text-xs">CC</span>
                      <span className="text-text-primary truncate text-xs flex-1 min-w-0">{fullEmail!.cc}</span>
                    </div>
                  )}
                  <div className="flex overflow-hidden">
                    <span className="text-text-secondary w-16 shrink-0 text-xs">Date</span>
                    <span className="text-text-primary text-xs">{format_date_full(fullEmail!.sent_at || fullEmail!.received_at)}</span>
                  </div>
                </>
              ) : (
                <div className="flex overflow-hidden">
                  <span className="text-text-secondary w-16 shrink-0 text-xs">To</span>
                  <span className="text-text-secondary italic text-xs">Loading...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* email body */}
      <div className="!rounded-xl !overflow-hidden">
        {fullEmail?.body_html ? (
          <EmailBodyIFrame
            html={fullEmail.body_html}
            email_id={email.id}
            account_id={email.account_id}
            scrollContainerRef={bodyRef}
            onOverflowChange={onOverflowChange}
          />
        ) : fullEmail?.body_text ? (
          <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed px-6 py-4">
            {fullEmail.body_text}
          </pre>
        ) : bodyLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-secondary italic">No body content</p>
          </div>
        )}
      </div>

      {/* attachments */}
      <div>
        {attachments.length > 0 && (
          <div className="px-6 py-4 border-t border-border-subtle">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Attachments ({attachments.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((att) => {
                const def = attachment_icon(att.mime_type);
                const Icon = def.icon;
                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm min-w-0">
                    <div className={`${def.bg} rounded-md p-1.5 shrink-0 ${def.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-text-primary font-medium truncate text-[12px]">{att.filename}</p>
                      {att.size !== null && att.size !== undefined && (
                        <p className="text-text-secondary text-[10px] mt-[0.2]">{format_size(att.size)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => download_attachment(att)}
                      disabled={downloadingId === att.id}
                      className="text-text-secondary hover:text-text-primary disabled:text-gray-300 transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-gray-200/60 shrink-0"
                      title="Download">
                      {downloadingId === att.id ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(EmailViewer);
