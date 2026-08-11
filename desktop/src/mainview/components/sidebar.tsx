import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { Inbox, Send, Trash2, ChevronRight, ChevronLeft, GlobeX, ListFilter, CalendarClock, Loader2, RefreshCw, icons as lucide_icons } from "lucide-react";
import { Setting2 } from "iconsax-reactjs";
import { IconWritingSign, IconInfoSquareRounded } from '@tabler/icons-react';
import { messages } from "@/shared/rpc_messages";
import { sidebarWidthAtom, sidebarOpenAtom, hydrate_sidebar_state } from "../atoms/sidebar";
import { Tooltip } from "./ui/tooltip";
import { rpc } from "../rpc";
import { filtered_views_enabled_atom, filtered_views_atom_for } from "../state";
import { percent_progress } from "../utils/percent";
import type { SyncEngineState } from "../hooks/sync_state";
import Avatar from "./avatar";
import AvatarImage from "./avatar_image";

const THRESHOLD = 90;

const mailItems = [
  { label: "Inbox", folder: "inbox", icon: Inbox },
  { label: "Sent", folder: "sent", icon: Send },
  { label: "Drafts", folder: "drafts", icon: IconWritingSign },
  { label: "Spam", folder: "spam", icon: IconInfoSquareRounded },
  { label: "Bin", folder: "bin", icon: Trash2 },
];

type Props = {
  user: AccountRowWire;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenDeveloper: () => void;
  onRetryBackfill: () => void;
  currentFolder: string;
  onFolderChange: (folder: string) => void;
  active_view_id: string | null;
  onViewSelect: (view_id: string) => void;
  scheduled_count: number;
  backfill: SyncEngineState["backfill"];
};

function Sidebar({ user, onOpenSettings, onOpenProfile, onOpenDeveloper, onRetryBackfill, currentFolder, onFolderChange, active_view_id, onViewSelect, scheduled_count, backfill }: Props) {
  const [width, setWidth] = useAtom(sidebarWidthAtom);
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const [dragCompact, setDragCompact] = useState<boolean | undefined>(undefined);
  const [online, setOnline] = useState(true);
  const [hovered, setHovered] = useState(false);
  const asideRef = useRef<HTMLDivElement>(null);
  const dragWidthRef = useRef<number | null>(null);
  const effectiveWidth = dragWidthRef.current ?? (isOpen ? width : 60);
  const isCompact = dragCompact ?? !isOpen;

  const [views_enabled] = useAtom(filtered_views_enabled_atom);
  const views_atom = useMemo(() => filtered_views_atom_for(user.id), [user.id]);
  const [views] = useAtom(views_atom);
  const visible_views = useMemo(
    () => views.filter((v) => v.visible).sort((a, b) => a.position - b.position),
    [views],
  );

  const mail_items = useMemo(() => {
    const items = [...mailItems];
    if (scheduled_count > 0) {
      items.splice(3, 0, { label: "Scheduled", folder: "scheduled", icon: CalendarClock });
    }
    return items;
  }, [scheduled_count]);

  useEffect(() => {
    hydrate_sidebar_state();
  }, []);

  useEffect(() => {
    rpc.request(messages.set_traffic_lights, { visible: !isCompact }).catch(() => {});
  }, [isCompact]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  function handle_pointer_down(e: React.PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = width;
    let lastWidth = startWidth;
    let crossedThresh = lastWidth < THRESHOLD;

    function handle_pointer_move(e: PointerEvent) {
      lastWidth = Math.max(60, Math.min(240, startWidth + e.clientX - startX));
      dragWidthRef.current = lastWidth;
      if (asideRef.current) {
        asideRef.current.style.width = `${lastWidth}px`;
      }
      const nowCompact = lastWidth < THRESHOLD;
      if (nowCompact !== crossedThresh) {
        crossedThresh = nowCompact;
        setDragCompact(nowCompact);
      }
    }

    function handle_pointer_up() {
      handle.removeEventListener("pointermove", handle_pointer_move);
      handle.removeEventListener("pointerup", handle_pointer_up);
      dragWidthRef.current = null;
      setDragCompact(undefined);
      setWidth(lastWidth);
      setIsOpen(lastWidth > THRESHOLD);
    }

    handle.addEventListener("pointermove", handle_pointer_move);
    handle.addEventListener("pointerup", handle_pointer_up);
  }

  return (
    <aside
      ref={asideRef}
      className="sidebar-panel"
      style={{ width: `${effectiveWidth}px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div className="sidebar-resize-handle" onPointerDown={handle_pointer_down} />
      <div
        className="electrobun-webkit-app-region-drag relative flex flex-col items-center min-h-[40px] shrink-0 z-[30] cursor-default mt-1"
        onDoubleClick={() => rpc.request(messages.toggle_zoom)}>
        {!isCompact && hovered && (
          <button
            className="no-drag absolute top-1 right-2 flex items-center justify-center w-7 h-7 rounded-md hover:bg-black/5 text-sidebar-text transition-colors cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); setWidth(60); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Collapse sidebar">
            <ChevronLeft size={16} className="shrink-0" />
          </button>
        )}
        {isCompact && (
          <button
            className="no-drag flex items-center justify-center w-10 h-10 mt-2 rounded-md hover:bg-black/5 text-sidebar-text transition-colors cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setIsOpen(true); setWidth(240); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Expand sidebar">
            <ChevronRight size={20} className="shrink-0" />
          </button>
        )}
      </div>
      {!isCompact ? (
        <Avatar name={user.name ?? ""} email={user.email} avatar_url={user.avatar_url ?? undefined} onClick={onOpenProfile} />
      ) : (
        <div className="flex justify-center mt-3 shrink-0">
          <button onClick={onOpenProfile} className="cursor-pointer">
            <AvatarImage
              url={user.avatar_url}
              name={user.name}
              email={user.email}
              imgClassName="w-7 h-7 rounded-full shrink-0"
              initialsClassName="w-7 h-7 rounded-full border border-[#DEDEDC] flex items-center justify-center text-text-secondary text-[11px] font-medium shrink-0"
            />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto pt-4">
        {!isCompact && (
          <p className="text-xs font-medium text-sidebar-text uppercase tracking-wider px-5 mb-2">
            Mail
          </p>
        )}
        <nav className={`space-y-1 ${!isCompact ? "px-2" : "px-1 flex flex-col items-center"}`}>
          {mail_items.map(({ label, folder, icon: Icon }) => (
            <button
              key={label}
              onClick={() => onFolderChange(folder)}
              className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
                !isCompact
                  ? "w-full gap-3 px-3 py-1.5 text-sm"
                  : "justify-center p-2 w-10 h-10"
              } ${
                !active_view_id && currentFolder === folder
                  ? "bg-black/10 text-[#37352F] font-medium"
                  : "text-sidebar-text"
              }`}
              title={isCompact ? label : undefined}>
              <Icon size={!isCompact ? 16 : 20} className="text-sidebar-text shrink-0" />
              {!isCompact && <span className="sidebar_font">{label}</span>}
              {!isCompact && folder === "scheduled" && scheduled_count > 0 && (
                <span className="ml-auto text-[10px] font-medium text-sidebar-text bg-black/5 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {scheduled_count}
                </span>
              )}
            </button>
          ))}
        </nav>
        {views_enabled && visible_views.length > 0 && (
          <>
            <hr className="mx-2 my-3 border-border-subtle" />
            {!isCompact && (
              <p className="text-xs font-medium text-sidebar-text uppercase tracking-wider px-5 mb-2">
                Views
              </p>
            )}
            <nav className={`space-y-1 ${!isCompact ? "px-2" : "px-1 flex flex-col items-center"}`}>
              {visible_views.map((view) => {
                const IconComp = (lucide_icons as Record<string, any>)[view.icon_name];
                const Icon = IconComp ?? ListFilter;
                const active = active_view_id === view.id;
                return (
                  <button
                    key={view.id}
                    onClick={() => onViewSelect(view.id)}
                    className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
                      !isCompact
                        ? "w-full gap-3 px-3 py-1.5 text-sm"
                        : "justify-center p-2 w-10 h-10"
                    } ${
                      active
                        ? "bg-black/10 text-[#37352F] font-medium"
                        : "text-sidebar-text"
                    }`}
                    title={isCompact ? view.name : undefined}>
                    <Icon size={!isCompact ? 16 : 20} className="text-sidebar-text shrink-0" />
                    {!isCompact && <span className="sidebar_font truncate">{view.name}</span>}
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </div>
      <div className="shrink-0">
        {!online && (
          <div className={!isCompact ? "px-2" : "px-1 flex justify-center"}>
            <Tooltip
              content="You are currently offline, any actions you create will be synced when back online."
              side="right"
              align="start">
              <button
                className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
                  !isCompact ? "w-full gap-3 px-3 py-1.5 text-sm" : "justify-center p-2 w-10 h-10"
                } text-sidebar-text`}>
                <GlobeX size={!isCompact ? 16 : 20} className="shrink-0" />
                {!isCompact && <span className="sidebar_font">Offline</span>}
              </button>
            </Tooltip>
          </div>
        )}
        {(backfill.status === "syncing" || backfill.status === "error") && (
          <div className={!isCompact ? "px-2" : "px-1 flex justify-center"}>
            <Tooltip
              content={backfill.status === "error"
                ? `Backfill paused • ${backfill.total.toLocaleString()}${backfill.totalMessages ? ` / ${backfill.totalMessages.toLocaleString()}` : ""} synced${backfill.error ? ` • ${backfill.error}` : ""} • Click to resume`
                : backfill.totalMessages ? ` ${backfill.total.toLocaleString()} / ${backfill.totalMessages.toLocaleString()}` : "…"}
              side="right"
              align="start">
              {backfill.status === "error" ? (
                <button
                  onClick={onRetryBackfill}
                  className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
                    !isCompact ? "w-full gap-3 px-3 py-1.5 text-sm" : "justify-center p-2 w-10 h-10"
                  } text-sidebar-text`}>
                  <RefreshCw size={!isCompact ? 16 : 20} className="shrink-0" />
                  {!isCompact && <span className="sidebar_font">Resume backfill</span>}
                </button>
              ) : (
                <button
                  onClick={onOpenDeveloper}
                  className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
                    !isCompact ? "w-full gap-3 px-3 py-1.5 text-sm" : "justify-center p-2 w-10 h-10"
                  } text-sidebar-text`}>
                  <Loader2 size={!isCompact ? 16 : 20} className="shrink-0 animate-spin" />
                  {!isCompact && <span className="sidebar_font">Backfilling…</span>}
                  {!isCompact && backfill.totalMessages != null && backfill.totalMessages > 0 && (
                    <span className="ml-auto text-[10px] font-medium text-sidebar-text bg-black/5 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {percent_progress(backfill.total, backfill.totalMessages)}%
                    </span>
                  )}
                </button>
              )}
            </Tooltip>
          </div>
        )}
        <div className={!isCompact ? "px-2 py-3" : "px-1 py-3 flex justify-center"}>
          <button
            onClick={onOpenSettings}
            className={`flex items-center rounded-md hover:bg-black/5 transition-colors cursor-pointer ${
              !isCompact ? "w-full gap-3 px-3 py-1.5 text-sm" : "justify-center p-2 w-10 h-10"
            } text-sidebar-text`}
            title={isCompact ? "Settings" : undefined}>
            <Setting2 size={!isCompact ? 16 : 20} className="text-sidebar-text shrink-0" />
            {!isCompact && <span className="sidebar_font">Settings</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
