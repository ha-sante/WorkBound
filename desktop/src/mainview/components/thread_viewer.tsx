import { useEffect, useRef, useMemo, useState, memo } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Clock, Pencil, Send, X } from "lucide-react";
import { currentThreadViewAtom } from "../state";
import { format_time, format_date } from "@/shared/datetime";
import { useOutboxItems } from "../hooks/use_outbox_items";
import { useScheduledActions } from "../hooks/use_scheduled_actions";
import { parse_send_payload } from "../utils/scheduled_send";
import EmailViewer from "./email_viewer";
import AvatarImage from "./avatar_image";

type Props = {
  onActiveCardMove?: (rect: { top: number; height: number }) => void;
  maxHeightVh?: number;
  compact?: boolean;
};

function ThreadViewer({ onActiveCardMove, maxHeightVh, compact }: Props) {
  const [threadView, setThreadView] = useAtom(currentThreadViewAtom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onActiveCardMoveRef = useRef(onActiveCardMove);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const { items: pendingItems } = useOutboxItems({ thread_id: threadView?.thread_id });
  const { edit, cancel, sendNow } = useScheduledActions();

  useEffect(() => {
    onActiveCardMoveRef.current = onActiveCardMove;
  }, [onActiveCardMove]);

  useEffect(() => {
    setExpandedItemId(null);
    setHiddenExpanded(false);
  }, [threadView?.thread_id]);

  useEffect(() => {
    if (compact) setExpandedItemId(null);
  }, [compact]);

  if (!threadView) return null;

  const handle_card_click = (index: number) => {
    setExpandedItemId(null);
    setThreadView(prev => prev ? { ...prev, activeIndex: index } : prev);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-active="true"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [threadView.activeIndex]);

  useEffect(() => {
    const report = () => {
      const container = scrollRef.current;
      const activeEl = container?.querySelector(`[data-active="true"]`);
      if (!container || !activeEl) return;
      const rect = activeEl.getBoundingClientRect();
      onActiveCardMoveRef.current?.({ top: rect.top, height: rect.height });
    };

    report();
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener("scroll", report, { passive: true });
    const ro = new ResizeObserver(report);
    Array.from(container.children).forEach((child) => ro.observe(child));
    return () => {
      container.removeEventListener("scroll", report);
      ro.disconnect();
    };
  }, [threadView.activeIndex]);

  const colors = [
    "text-indigo-500", "text-amber-500", "text-emerald-500", "text-rose-500",
    "text-blue-500", "text-fuchsia-500", "text-teal-500", "text-orange-500",
  ];

  const avatarColors = [
    "bg-indigo-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500",
    "bg-blue-500", "bg-fuchsia-500", "bg-teal-500", "bg-orange-500",
  ];

  const uniqueSenders = threadView.emails.reduce<{ name: string; address: string; avatar_url?: string | null }[]>((acc, te) => {
    const addr = te.email.from_address || "";
    if (addr && !acc.some(s => s.address === addr)) {
      acc.push({ name: te.email.from_name || addr, address: addr, avatar_url: te.email.avatar_url ?? null });
    }
    return acc;
  }, []);

  const scheduledPending = pendingItems.filter(
    (i) => i.command === "send_email" && i.scheduled_at && (i.status === "queued" || i.status === "sending"),
  );

  type MergedEntry =
    | { kind: "email"; index: number; sortMs: number }
    | { kind: "pending"; item: OutboxItemWire; sortMs: number };

  const merged = useMemo<MergedEntry[]>(() => {
    const emails: MergedEntry[] = threadView.emails.map((te, index) => ({
      kind: "email",
      index,
      sortMs: new Date(te.email.received_at || te.email.sent_at || "").getTime() || 0,
    }));
    const pending: MergedEntry[] = scheduledPending.map((item) => ({
      kind: "pending",
      item,
      sortMs: item.scheduled_at ?? item.created_at,
    }));
    return [...emails, ...pending].sort((a, b) => a.sortMs - b.sortMs);
  }, [threadView.emails, scheduledPending]);

  const rowHeightPx = 36;
  const containerH = (window.innerHeight * (maxHeightVh ?? 85)) / 100;
  const activeReservePx = Math.max(containerH * 0.45, 180);
  const threadPadPx = 24;
  const budgetPx = Math.max(0, containerH - activeReservePx - threadPadPx);
  const maxCollapsedRows = Math.max(0, Math.floor(budgetPx / rowHeightPx) - 1);
  const activeIndex = threadView.activeIndex;
  const totalCollapsed = Math.max(0, threadView.emails.length - (activeIndex >= 0 ? 1 : 0));
  const hiddenCount = Math.max(0, totalCollapsed - maxCollapsedRows);
  const hiddenIndexes = new Set<number>();
  {
    let hidden = 0;
    for (let i = 0; i < threadView.emails.length && hidden < hiddenCount; i++) {
      if (i === activeIndex) continue;
      hiddenIndexes.add(i);
      hidden++;
    }
  }

  return (
    <div className="flex flex-col w-full pointer-events-auto">
      <AnimatePresence>
        {!compact && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden flex flex-col items-center gap-1 px-4 pb-3 pt-1">
            <div className="flex items-center justify-center">
              {uniqueSenders.map((sender, i) => (
                <AvatarImage
                  key={sender.address}
                  url={sender.avatar_url}
                  name={sender.name}
                  email={sender.address}
                  imgClassName={`w-7 h-7 rounded-full shrink-0 ring-2 ring-white ${i > 0 ? '-ml-2' : ''}`}
                  initialsClassName={`w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[11px] font-medium shrink-0 ring-2 ring-white ${i > 0 ? '-ml-2' : ''}`}
                  alt={sender.name}
                  style={{ zIndex: uniqueSenders.length - i }}
                />
              ))}
            </div>
            <span className="text-[11px] text-white font-medium" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {uniqueSenders.map(s => s.name).join(", ")}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {hiddenCount > 0 && (
        <button
          onClick={() => setHiddenExpanded(v => !v)}
          className="flex items-center justify-center gap-1 self-center shrink-0 mb-2 cursor-pointer select-none hover:opacity-80 transition-opacity"
        >
          <ChevronDown size={13} className={`text-white/80 transition-transform duration-200 ${hiddenExpanded ? "rotate-180" : ""}`} />
          <span className="text-xs text-white/90 font-medium">
            {hiddenExpanded
              ? `Hide ${hiddenCount} older ${hiddenCount === 1 ? "message" : "messages"}`
              : `Show ${hiddenCount} older ${hiddenCount === 1 ? "message" : "messages"}`}
          </span>
        </button>
      )}
      <div ref={scrollRef} className="flex flex-col gap-1 w-full overflow-y-auto pb-3" style={{ height: `calc(${maxHeightVh ?? 85}vh - ${hiddenCount > 0 ? 26 : 0}px)` }}>
        {merged.map((entry) => {
          if (entry.kind === "email") {
            const index = entry.index;
            if (!hiddenExpanded && hiddenIndexes.has(index)) return null;
            const is_active = index === threadView.activeIndex;
            const zIndex = index + 1;

            return (
              <div
                key={threadView.emails[index].email.id}
                data-active={is_active ? "true" : undefined}
                onClick={() => !is_active && handle_card_click(index)}
                style={{ zIndex }}
                className={`
                  bg-white/90 rounded-lg relative
                  ${is_active ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'cursor-pointer hover:bg-gray-50'}
                `}>
                {is_active ? (
                  <EmailViewer email={threadView.emails[index].email} />
                ) : (
                  <div className="flex items-center px-4 h-8 text-sm text-text-primary shrink-0 select-none">
                    <span className={`${colors[index % colors.length]} w-4 text-center text-xs font-semibold shrink-0`}>
                      {index + 1}
                    </span>
                    <span className="font-medium truncate min-w-[50px]">
                      {threadView.emails[index].email.from_name || threadView.emails[index].email.from_address || "Unknown"}
                    </span>
                    <span className="text-text-tertiary mx-1 shrink-0">·</span>
                    <span className="truncate text-text-secondary min-w-0 text-ellipsis">
                      {threadView.emails[index].email.snippet || threadView.emails[index].email.subject}
                    </span>
                    <span className="shrink-0 text-xs text-text-tertiary whitespace-nowrap ml-auto min-w-[68px] text-right">
                      {format_time(threadView.emails[index].email.sent_at || threadView.emails[index].email.received_at)}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          const item = entry.item;
          const payload = parse_send_payload(item.payload);
          const isExpanded = expandedItemId === item.id;

          return (
            <div
              key={`pending-${item.id}`}
              onClick={() => {
                if (isExpanded) return;
                setExpandedItemId(item.id);
                setThreadView(prev => prev ? { ...prev, activeIndex: -1 } : prev);
              }}
              className={`
                bg-white/90 rounded-lg relative border
                ${isExpanded
                  ? 'flex-1 min-h-0 flex flex-col overflow-hidden border-border-subtle'
                  : 'cursor-pointer hover:bg-gray-50 border-transparent'}
              `}
            >
              {isExpanded ? (
                <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="px-6 pt-5 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={13} className="text-accent shrink-0" />
                      <span className="text-xs text-text-secondary uppercase tracking-wider">Scheduled send</span>
                      <span className="text-xs text-text-secondary ml-auto whitespace-nowrap">{format_date(new Date(item.scheduled_at!).toISOString())}</span>
                    </div>
                    <h2 className="text-md font-semibold text-text-primary truncate">
                      {payload.subject || "Scheduled email"}
                    </h2>
                  </div>
                  <div className="px-6 pt-1 pb-3 space-y-1 text-xs">
                    <div className="flex overflow-hidden">
                      <span className="text-text-secondary w-16 shrink-0 text-xs">Sends</span>
                      <span className="text-text-primary truncate text-xs flex-1 min-w-0">{format_date(new Date(item.scheduled_at!).toISOString())}</span>
                    </div>
                    <div className="flex overflow-hidden">
                      <span className="text-text-secondary w-16 shrink-0 text-xs">To</span>
                      <span className="text-text-primary truncate text-xs flex-1 min-w-0">{payload.to || "—"}</span>
                    </div>
                    {payload.cc && (
                      <div className="flex overflow-hidden">
                        <span className="text-text-secondary w-16 shrink-0 text-xs">Cc</span>
                        <span className="text-text-primary truncate text-xs flex-1 min-w-0">{payload.cc}</span>
                      </div>
                    )}
                  </div>
                  {payload.body_text && (
                    <div className="px-6 pb-4">
                      <div className="text-text-tertiary text-sm line-clamp-2 whitespace-pre-line">{payload.body_text}</div>
                    </div>
                  )}
                </div>
                <div className="shrink-0 px-6 pb-5 pt-1 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); sendNow(item); }}
                      className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <Send size={15} /> Send now
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); edit(item); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-text-primary hover:bg-black/[0.04] transition-colors cursor-pointer"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancel(item); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-text-primary hover:bg-black/[0.04] transition-colors cursor-pointer"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center px-4 h-8 text-sm text-text-primary shrink-0 select-none">
                  <Clock size={13} className="text-accent mr-2 shrink-0" />
                  <span className="font-medium text-text-primary shrink-0">Scheduled</span>
                  <span className="text-text-tertiary mx-1 shrink-0">·</span>
                  <span className="truncate text-text-secondary min-w-0 text-ellipsis">
                    {payload.subject || payload.to || "Scheduled email"}
                  </span>
                  <span className="shrink-0 text-xs text-text-secondary whitespace-nowrap ml-auto min-w-[68px] text-right">
                    {format_date(new Date(item.scheduled_at!).toISOString())}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ThreadViewer);
