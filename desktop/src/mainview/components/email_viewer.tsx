const DEBUG = false;
const META_COMPENSATION_DELAY_MS = 220;

import { useState, useEffect, useRef, memo } from "react";
import { Download } from "lucide-react";
import {
  IconFile, IconFileTypePdf, IconPhoto, IconFileTypeTxt, IconFileSpreadsheet, IconZip, IconMarkdown,
  IconFileTypeJs, IconFileTypeCss, IconFileTypeHtml, IconFileMusic, IconVideo, IconCode
} from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { currentMailViewAtom, mail_body_cache_atom, savedFileToastAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import MailMeta from "./mail_meta";
import MailBody from "./mail_body";
import { format_file_size } from "../utils/mail_display_utils";
import { cache_mail_body, mail_body_cache_key, touch_mail_body_cache } from "../hooks/utils/mail_body_cache";

type Props = {
  email: EmailPreviewWire;
  onClose?: () => void;
  onOverflowChange?: (overflowPx: number) => void;
};

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
  const body_cache = useAtomValue(mail_body_cache_atom);
  const set_body_cache = useSetAtom(mail_body_cache_atom);
  const [fullEmail, setFullEmail] = useState<EmailRowWire | null>(null);
  const [attachments, setAttachments] = useState<AttachmentWire[]>([]);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [metaHidden, setMetaHidden] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const setSavedFileToast = useSetAtom(savedFileToastAtom);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = email.id;
    let active = true;

    const label = `email_load_${id.slice(0, 8)}`;
    console.time(label);
    setMetaHidden(false);

    const cache_key = mail_body_cache_key(email.account_id, id);
    const cached = body_cache.entries[cache_key];
    if (cached) {
      console.timeLog(label, 'cache hit');
      setBodyLoading(false);
      setFullEmail(cached.email);
      setAttachments(cached.attachments);
      set_body_cache((prev) => touch_mail_body_cache(prev, cache_key));
      setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: cached.email } : prev);
      console.timeEnd(label);
      return () => { active = false; };
    }

    console.timeLog(label, 'no cache, start fetch');
    setBodyLoading(true);
    const load_start = performance.now();

    rpc.request(messages.mail_get, { id }).then((data: unknown) => {
      if (!active) return;
      const elapsed = performance.now() - load_start;
      console.timeLog(label, `RPC done in ${elapsed.toFixed(0)}ms`);
      const result = data as MailGetResponse;
      if (result.email) {
        set_body_cache((prev) => cache_mail_body(prev, email.account_id, result.email!, result.attachments));
      }
      console.timeLog(label, 'set fullEmail');
      setFullEmail(result.email);
      setAttachments(result.attachments);
      setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: result.email } : prev);
    }).catch((e: unknown) => {
      if (!active) return;
      console.error(`${label} mail:get failed`, e);
      setFullEmail(null);
      setAttachments([]);
      setCurrentView(prev => prev?.email?.id === id ? { ...prev, fullEmail: null } : prev);
    }).finally(() => {
      if (!active) return;
      console.timeLog(label, 'bodyLoading=false');
      setBodyLoading(false);
      console.timeEnd(label);
    });

    return () => { active = false; };
  }, [email.id, email.account_id, setCurrentView, set_body_cache]);

  useEffect(() => {
    // animation of the top bar header - some code for consistency sake.
    const el = bodyRef.current;
    if (!el) return;
    let last_scroll_top = el.scrollTop;
    let meta_hidden = false;
    let compensation_timer: ReturnType<typeof setTimeout> | null = null;

    const schedule_compensation = (height: number, direction: 1 | -1) => {
      if (compensation_timer) clearTimeout(compensation_timer);
      compensation_timer = setTimeout(() => {
        compensation_timer = null;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + direction * height));
      }, META_COMPENSATION_DELAY_MS);
    };

    const update_meta_visibility = (hidden: boolean) => {
      if (hidden === meta_hidden) return;
      const height = hidden ? metaRef.current?.getBoundingClientRect().height ?? 0
        : metaRef.current?.scrollHeight ?? 0;
      meta_hidden = hidden;
      setMetaHidden(hidden);
      if (height > 0) schedule_compensation(height, hidden ? 1 : -1);
    };

    const on_scroll = () => {
      const scroll_top = el.scrollTop;
      if (scroll_top > last_scroll_top && scroll_top > 60) update_meta_visibility(true);
      if (scroll_top < last_scroll_top && scroll_top < 40) update_meta_visibility(false);
      last_scroll_top = scroll_top;
    };

    el.addEventListener("scroll", on_scroll, { passive: true });
    return () => { el.removeEventListener("scroll", on_scroll); if (compensation_timer) clearTimeout(compensation_timer); };
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
      DEBUG && console.log(`[email:${email.id.slice(0, 8)}] iframe body ${fullEmail.body_html.length}`);
    }
  }, [email.id, fullEmail?.body_html]);

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
            <MailMeta mail={email} loading={!showMeta} />
          </div>
        </div>
      </div>

      {/* email body */}
      <MailBody
        html={fullEmail?.body_html}
        text={fullEmail?.body_text}
        email_id={email.id}
        account_id={email.account_id}
        loading={bodyLoading}
        scrollContainerRef={bodyRef}
        onOverflowChange={onOverflowChange}
      />

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
                        <p className="text-text-secondary text-[10px] mt-[0.2]">{format_file_size(att.size)}</p>
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
