import { useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  Search,
  Plus,
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  ListFilter,
  icons as lucide_icons,
} from "lucide-react";
import {
  filtered_views_enabled_atom,
  filtered_views_atom_for,
  active_filtered_view_atom,
} from "../../state";
import { FilterControlBar } from "../filters/filter_control_bar";
import { LabelIconPickerPopover } from "./label_icon_picker";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { pref_keys } from "@/shared/pref_keys";

const FOLDER_LABELS: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  spam: "Spam",
  bin: "Bin",
  __all__: "All Mail",
};

function folder_label(folder: string): string {
  return FOLDER_LABELS[folder] ?? folder;
}

type Props = {
  account_id: string;
};

export function FilteredViewsSection({ account_id }: Props) {
  const views_atom = useMemo(() => filtered_views_atom_for(account_id), [account_id]);
  const [views, set_views] = useAtom(views_atom);
  const [enabled, set_enabled] = useAtom(filtered_views_enabled_atom);
  const [active_view_id, set_active_view_id] = useAtom(active_filtered_view_atom);

  const sorted_views = useMemo(
    () => [...views].sort((a, b) => a.position - b.position),
    [views],
  );

  const persist_views = (next: FilteredViewWire[]) => {
    set_views(next);
    rpc.request(messages.filtered_views_replace, { account_id, views: next }).catch(() => {});
  };

  const toggle_enabled = () => {
    const next = !enabled;
    set_enabled(next);
    rpc.request(messages.prefs_set, { key: pref_keys.filtered_views_enabled, value: next }).catch(() => {});
  };

  const [form_open, set_form_open] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);
  const [draft_name, set_draft_name] = useState("");
  const [draft_icon, set_draft_icon] = useState("ListFilter");
  const [draft_clauses, set_draft_clauses] = useState<ClientFilterClause[]>([]);
  const [draft_folder, set_draft_folder] = useState("inbox");

  const [icon_picker_open, set_icon_picker_open] = useState(false);
  const [icon_search, set_icon_search] = useState("");

  const [drag_index, set_drag_index] = useState<number | null>(null);
  const [drag_over_index, set_drag_over_index] = useState<number | null>(null);

  const DraftIcon = (lucide_icons as Record<string, any>)[draft_icon] ?? null;

  function reset_form() {
    set_form_open(false);
    set_editing_id(null);
    set_draft_name("");
    set_draft_icon("ListFilter");
    set_draft_clauses([]);
    set_draft_folder("inbox");
    set_icon_picker_open(false);
    set_icon_search("");
  }

  function open_new() {
    reset_form();
    set_form_open(true);
  }

  function open_edit(view: FilteredViewWire) {
    set_form_open(true);
    set_editing_id(view.id);
    set_draft_name(view.name);
    set_draft_icon(view.icon_name);
    set_draft_clauses(view.clauses);
    set_draft_folder(view.folder);
    set_icon_picker_open(false);
    set_icon_search("");
  }

  function save_view() {
    const name = draft_name.trim();
    if (!name) return;
    if (editing_id) {
      persist_views(
        views.map((v) =>
          v.id === editing_id
            ? {
                ...v,
                name,
                icon_name: draft_icon ?? v.icon_name,
                clauses: draft_clauses,
                folder: draft_folder,
              }
            : v,
        ),
      );
    } else {
      const view: FilteredViewWire = {
        id: crypto.randomUUID(),
        name,
        icon_name: draft_icon,
        clauses: draft_clauses,
        folder: draft_folder,
        visible: true,
        position: views.length,
      };
      persist_views([...views, view]);
    }
    reset_form();
  }

  function delete_view(id: string) {
    if (id === active_view_id) set_active_view_id(null);
    persist_views(
      views.filter((v) => v.id !== id).map((v, i) => ({ ...v, position: i })),
    );
  }

  function toggle_visible(id: string) {
    const view = views.find((v) => v.id === id);
    if (view?.visible && id === active_view_id) set_active_view_id(null);
    persist_views(
      views.map((v) => (v.id === id ? { ...v, visible: !v.visible } : v)),
    );
  }

  function reorder_views(from: number, to: number) {
    if (from === to) return;
    const next = [...views];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist_views(next.map((v, i) => ({ ...v, position: i })));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Save filters as clickable views in your sidebar.
        </p>
        <button
          onClick={toggle_enabled}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
            enabled ? "bg-blue-600" : "bg-gray-300"
          }`}>
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {sorted_views.length === 0 ? (
            <p className="text-xs text-text-tertiary">No views yet. Create one below.</p>
          ) : (
            <div className="border border-border-subtle rounded divide-y divide-border-subtle">
              {sorted_views.map((view, index) => {
                const IconComp = (lucide_icons as Record<string, any>)[view.icon_name];
                return (
                  <div
                    key={view.id}
                    data-view-row
                    onDragOver={(e) => {
                      e.preventDefault();
                      set_drag_over_index(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag_index !== null) reorder_views(drag_index, index);
                      set_drag_index(null);
                      set_drag_over_index(null);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 group ${
                      drag_over_index === index ? "bg-black/[0.04]" : ""
                    } ${drag_index === index ? "opacity-50" : ""}`}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        set_drag_index(index);
                        const row = e.currentTarget.closest("[data-view-row]") as HTMLElement | null;
                        if (row) {
                          const ghost = row.cloneNode(true) as HTMLElement;
                          ghost.querySelectorAll("[data-no-drag-ghost]").forEach((n) => n.remove());
                          const rect = row.getBoundingClientRect();
                          ghost.style.cssText +=
                            "position:fixed;left:-10000px;top:-10000px;background:#fff;" +
                            "border:1px solid #e5e7eb;border-radius:0;box-shadow:0 8px 24px rgba(0,0,0,0.15);" +
                            `width:${rect.width}px;opacity:0.95;z-index:9999;`;
                          document.body.appendChild(ghost);
                          e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
                          requestAnimationFrame(() => ghost.remove());
                        }
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", view.id);
                      }}
                      onDragEnd={() => {
                        set_drag_index(null);
                        set_drag_over_index(null);
                      }}
                      className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-black/[0.05]"
                      data-no-drag-ghost
                      title="Drag to reorder"
                    >
                      <GripVertical size={14} className="text-text-secondary" />
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                      {IconComp ? (
                        <IconComp size={14} className="text-text-secondary shrink-0" />
                      ) : (
                        <ListFilter size={14} className="text-text-secondary shrink-0" />
                      )}
                      <span className="text-sm text-text-primary truncate">{view.name}</span>
                    </span>
                    <span className="text-[11px] text-text-tertiary shrink-0">
                      {folder_label(view.folder)}
                    </span>
                    <button
                      onClick={() => toggle_visible(view.id)}
                      title={view.visible ? "Hide view" : "Show view"}
                      data-no-drag-ghost
                      className="p-1 rounded hover:bg-black/[0.05] cursor-pointer text-text-secondary shrink-0"
                    >
                      {view.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => open_edit(view)}
                      title="Edit view"
                      data-no-drag-ghost
                      className="p-1 rounded hover:bg-black/[0.05] cursor-pointer text-text-secondary shrink-0"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => delete_view(view.id)}
                      title="Delete view"
                      data-no-drag-ghost
                      className="p-1 rounded hover:bg-red-50 cursor-pointer text-red-500 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={open_new}
            className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary"
          >
            <Plus size={14} />
            New view
          </button>

          {form_open && (
            <div className="border border-border-subtle rounded p-4 space-y-4">
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    set_icon_picker_open((prev) => {
                      const next = !prev;
                      if (next) set_icon_search("");
                      return next;
                    });
                  }}
                  className="px-2 py-1.5 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer flex items-center gap-1 shrink-0"
                  title="Pick an icon"
                >
                  {DraftIcon ? (
                    <DraftIcon size={14} className="text-text-secondary" />
                  ) : (
                    <Search size={14} className="text-text-secondary" />
                  )}
                </button>

                <input
                  value={draft_name}
                  onChange={(e) => set_draft_name(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save_view();
                  }}
                  placeholder="View name"
                  className="flex-1 px-3 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />

                <LabelIconPickerPopover
                  open={icon_picker_open}
                  icon_search={icon_search}
                  on_icon_search_change={set_icon_search}
                  on_icon_pick={(icon_name) => set_draft_icon(icon_name ?? "ListFilter")}
                  on_open_change={set_icon_picker_open}
                />
              </div>

              <FilterControlBar
                selectable_folder={true}
                folder={draft_folder}
                on_folder_change={set_draft_folder}
                clauses={draft_clauses}
                on_clauses_change={set_draft_clauses}
                disabled={false}
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={reset_form}
                  className="px-3 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={save_view}
                  disabled={!draft_name.trim()}
                  className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {editing_id ? "Save changes" : "Create view"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
