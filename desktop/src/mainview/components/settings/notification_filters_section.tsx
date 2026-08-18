import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { FilterControlBar } from "../filters/filter_control_bar";

type Props = {
  account_id: string;
  disabled?: boolean;
};

export function NotificationFiltersSection({ account_id, disabled = false }: Props) {
  const [filters, set_filters] = useState<NotificationFilterWire[]>([]);
  const [loaded, set_loaded] = useState(false);
  const [form_open, set_form_open] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);
  const [draft_name, set_draft_name] = useState("");
  const [draft_clauses, set_draft_clauses] = useState<ClientFilterClause[]>([]);

  useEffect(() => {
    let cancelled = false;
    set_loaded(false);
    rpc.request(messages.notification_filters_list, { account_id })
      .then((next) => {
        if (!cancelled) set_filters(next ?? []);
      })
      .catch(() => {
        if (!cancelled) set_filters([]);
      })
      .finally(() => {
        if (!cancelled) set_loaded(true);
      });
    return () => { cancelled = true; };
  }, [account_id]);

  function persist(next: NotificationFilterWire[]) {
    set_filters(next);
    rpc.request(messages.notification_filters_replace, { account_id, filters: next }).catch(() => {});
  }

  function open_new() {
    set_editing_id(null);
    set_draft_name("");
    set_draft_clauses([]);
    set_form_open(true);
  }

  function open_edit(filter: NotificationFilterWire) {
    set_editing_id(filter.id);
    set_draft_name(filter.name);
    set_draft_clauses(filter.clauses);
    set_form_open(true);
  }

  function close_form() {
    set_form_open(false);
    set_editing_id(null);
    set_draft_name("");
    set_draft_clauses([]);
  }

  function save_filter() {
    const name = draft_name.trim();
    if (!name || draft_clauses.length === 0) return;
    if (editing_id) {
      persist(filters.map((filter) => filter.id === editing_id
        ? { ...filter, name, clauses: draft_clauses }
        : filter));
    } else {
      persist([...filters, {
        id: crypto.randomUUID(),
        name,
        icon_name: "ListFilter",
        clauses: draft_clauses,
        enabled: true,
        position: filters.length,
      }]);
    }
    close_form();
  }

  function delete_filter(id: string) {
    persist(filters.filter((filter) => filter.id !== id).map((filter, index) => ({ ...filter, position: index })));
  }

  function toggle_filter(id: string) {
    persist(filters.map((filter) => filter.id === id ? { ...filter, enabled: !filter.enabled } : filter));
  }

  if (!loaded) return <p className="text-xs text-text-tertiary">Loading notification filters...</p>;

  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-text-primary">Notify me about</p>
          <p className="text-xs text-text-secondary mt-0.5">Add email conditions that should trigger a notification.</p>
        </div>
        <button
          onClick={open_new}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={14} /> Add filter
        </button>
      </div>

      <div className="border border-border-subtle rounded divide-y divide-border-subtle">
        {filters.map((filter) => (
          <div key={filter.id} className={`${filter.enabled ? "" : "opacity-50"}`}>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-sm text-text-primary truncate">{filter.name}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggle_filter(filter.id)} disabled={disabled} className="p-1 rounded hover:bg-black/[0.05] cursor-pointer text-text-secondary disabled:cursor-not-allowed" title={filter.enabled ? "Disable filter" : "Enable filter"} aria-label={filter.enabled ? "Disable filter" : "Enable filter"}>
                  {filter.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={() => open_edit(filter)} disabled={disabled} className="p-1 rounded hover:bg-black/[0.05] cursor-pointer text-text-secondary disabled:cursor-not-allowed" aria-label="Edit filter">
                  <Pencil size={13} />
                </button>
                <button onClick={() => delete_filter(filter.id)} disabled={disabled} className="p-1 rounded hover:bg-red-50 cursor-pointer text-red-500 disabled:cursor-not-allowed" aria-label="Delete filter">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {form_open && (
        <div className="mt-3 border border-border-subtle rounded p-4 space-y-4">
          <input
            value={draft_name}
            onChange={(event) => set_draft_name(event.target.value)}
            placeholder="Filter name"
            className="w-full px-3 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <FilterControlBar selectable_folder={false} folder="__all__" on_folder_change={() => {}} clauses={draft_clauses} on_clauses_change={set_draft_clauses} />
          <div className="flex items-center justify-end gap-2">
            <button onClick={close_form} className="px-3 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer">Cancel</button>
            <button onClick={save_filter} disabled={!draft_name.trim() || draft_clauses.length === 0} className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-40">Save filter</button>
          </div>
        </div>
      )}
    </div>
  );
}
