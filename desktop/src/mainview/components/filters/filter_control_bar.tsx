import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { X, Plus, Filter, CalendarDays, Folder, Inbox, Tag, Users, Link2 } from "lucide-react";
import { labelsAtom } from "../../state";
import { Popover } from "../popover";

const FOLDER_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "sent", label: "Sent" },
  { value: "drafts", label: "Drafts" },
  { value: "spam", label: "Spam" },
  { value: "bin", label: "Bin" },
  { value: "__all__", label: "All Mail" },
];

type Props = {
  selectable_folder: boolean;
  folder: string;
  on_folder_change: (folder: string) => void;
  clauses: ClientFilterClause[];
  on_clauses_change: (clauses: ClientFilterClause[]) => void;
  disabled?: boolean;
};

const FIELD_LABELS: Record<ClientFilterClause["field"], string> = {
  category: "Category",
  label: "Label",
  is_unread: "Unread",
  has_attachments: "Has attachments",
  from: "From",
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
  subject: "Subject",
  date: "Date",
};

const TEXT_OPS: ClientFilterClause["op"][] = [
  "contains",
  "not_contains",
  "eq",
  "neq",
];

const MEMBERSHIP_OPS: ClientFilterClause["op"][] = ["is", "is_not"];
const BOOLEAN_OPS: ClientFilterClause["op"][] = ["eq", "neq"];
const DATE_OPS: ClientFilterClause["op"][] = ["after", "before", "range"];

function make_clause_id() {
  return crypto.randomUUID();
}

function clause_summary(clause: ClientFilterClause, maps: {
  category_id_to_name: Record<string, string>;
  label_id_to_name: Record<string, string>;
}): string {
  const field = clause.field;

  if (field === "is_unread") {
    const target = clause.value_boolean;
    const is_unread = target === true;
    const name = is_unread ? "Unread" : "Read";
    if (clause.op === "eq") return name;
    return is_unread ? "Not unread" : "Not read";
  }

  if (field === "has_attachments") {
    const target = clause.value_boolean;
    const has = target === true;
    const name = has ? "Has attachments" : "No attachments";
    if (clause.op === "eq") return name;
    return has ? "No attachments" : "Has attachments";
  }

  if (field === "category") {
    const name = maps.category_id_to_name[clause.value ?? ""] ?? clause.value ?? "(unknown)";
    return clause.op === "is" ? `Category: ${name}` : `Category: not ${name}`;
  }

  if (field === "label") {
    const name = maps.label_id_to_name[clause.value ?? ""] ?? clause.value ?? "(unknown)";
    return clause.op === "is" ? `Label: ${name}` : `Label: not ${name}`;
  }

  if (field === "date") {
    if (clause.op === "after") return `Received after ${clause.from}`;
    if (clause.op === "before") return `Received before ${clause.to}`;
    return `Received ${clause.from} → ${clause.to}`;
  }

  // Text fields
  const field_label = FIELD_LABELS[field];
  const op_map: Record<ClientFilterClause["op"], string> = {
    contains: "contains",
    not_contains: "not contains",
    eq: "is",
    neq: "is not",
    is: "is",
    is_not: "is not",
    before: "before",
    after: "after",
    range: "range",
  };
  const needle = clause.value ?? "";
  return `${field_label} ${op_map[clause.op]} "${needle}"`;
}

function field_to_icon(field: ClientFilterClause["field"]): JSX.Element | null {
  switch (field) {
    case "category":
      return <Tag size={14} className="text-text-secondary" />;
    case "label":
      return <Tag size={14} className="text-text-secondary" />;
    case "is_unread":
      return <Inbox size={14} className="text-text-secondary" />;
    case "has_attachments":
      return <Link2 size={14} className="text-text-secondary" />;
    case "from":
    case "to":
    case "cc":
    case "bcc":
      return <Users size={14} className="text-text-secondary" />;
    case "subject":
      return <Filter size={14} className="text-text-secondary" />;
    case "date":
      return <CalendarDays size={14} className="text-text-secondary" />;
    default:
      return null;
  }
}

export function FilterControlBar({ selectable_folder, folder, on_folder_change, clauses, on_clauses_change, disabled = false }: Props) {
  const labels = useAtomValue(labelsAtom);

  // Note: the actual filtered results list is rendered by MainContent.
  // This panel focuses on building filter clauses.

  const category_id_to_name = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of labels.categories) m[c.id] = c.name;
    return m;
  }, [labels.categories]);

  const label_id_to_name = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of [...labels.userLabels, ...labels.systemLabels]) m[l.id] = l.name;
    return m;
  }, [labels.userLabels, labels.systemLabels]);

  const [add_open, set_add_open] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);

  const editing_clause = useMemo(() => clauses.find((c) => c.id === editing_id) ?? null, [clauses, editing_id]);

  const initial_field: ClientFilterClause["field"] = editing_clause?.field ?? "is_unread";
  const [draft_field, set_draft_field] = useState(initial_field);
  const initial_op = editing_clause?.op ?? (draft_field === "date" ? "after" : "contains");
  const [draft_op, set_draft_op] = useState<ClientFilterClause["op"]>(initial_op);
  const [draft_value, set_draft_value] = useState<string>(editing_clause?.value ?? "");
  const [draft_value_boolean, set_draft_value_boolean] = useState<boolean>(editing_clause?.value_boolean ?? true);
  const [draft_from, set_draft_from] = useState<string>(editing_clause?.from ?? "");
  const [draft_to, set_draft_to] = useState<string>(editing_clause?.to ?? "");

  // Keep draft in sync when opening a different clause
  if (editing_clause) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // (we only update these via effects in next iteration; MVP keeps it simple for now)
  }

  function reset_draft_for(field: ClientFilterClause["field"]) {
    set_draft_field(field);
    const default_op = field === "date" ? "after" : field === "category" || field === "label" ? "is" : field === "is_unread" || field === "has_attachments" ? "eq" : "contains";
    set_draft_op(default_op);
    set_draft_value("");
    set_draft_value_boolean(true);
    set_draft_from("");
    set_draft_to("");
  }

  function open_add() {
    set_editing_id(null);
    reset_draft_for("is_unread");
    set_add_open(true);
  }

  function open_edit(clause: ClientFilterClause) {
    set_editing_id(clause.id);
    set_add_open(true);
    set_draft_field(clause.field);
    set_draft_op(clause.op);
    set_draft_value(clause.value ?? "");
    set_draft_value_boolean(clause.value_boolean ?? true);
    set_draft_from(clause.from ?? "");
    set_draft_to(clause.to ?? "");
  }

  function close_add() {
    set_add_open(false);
    set_editing_id(null);
  }

  function allowed_ops_for_field(field: ClientFilterClause["field"]): ClientFilterClause["op"][] {
    if (field === "category" || field === "label") return MEMBERSHIP_OPS;
    if (field === "is_unread" || field === "has_attachments") return BOOLEAN_OPS;
    if (field === "date") return DATE_OPS;
    return TEXT_OPS;
  }

  function apply_draft() {
    if (draft_field === "category" || draft_field === "label") {
      if (!draft_value) return;
      const clause: ClientFilterClause = {
        id: editing_id ?? make_clause_id(),
        field: draft_field,
        op: draft_op,
        value: draft_value,
      };
      if (editing_id) on_clauses_change(clauses.map((c) => (c.id === editing_id ? clause : c)));
      else on_clauses_change([...clauses, clause]);
      close_add();
      return;
    }

    if (draft_field === "is_unread" || draft_field === "has_attachments") {
      const clause: ClientFilterClause = {
        id: editing_id ?? make_clause_id(),
        field: draft_field,
        op: draft_op,
        value_boolean: draft_value_boolean,
      };
      if (editing_id) on_clauses_change(clauses.map((c) => (c.id === editing_id ? clause : c)));
      else on_clauses_change([...clauses, clause]);
      close_add();
      return;
    }

    if (draft_field === "date") {
      if (draft_op === "after" && !draft_from) return;
      if (draft_op === "before" && !draft_to) return;
      if (draft_op === "range" && (!draft_from || !draft_to)) return;

      const clause: ClientFilterClause = {
        id: editing_id ?? make_clause_id(),
        field: "date",
        op: draft_op,
        from: draft_op === "before" ? undefined : draft_from || undefined,
        to: draft_op === "after" ? undefined : draft_to || undefined,
      };
      if (editing_id) on_clauses_change(clauses.map((c) => (c.id === editing_id ? clause : c)));
      else on_clauses_change([...clauses, clause]);
      close_add();
      return;
    }

    // Text
    if (!draft_value.trim()) return;
    const clause: ClientFilterClause = {
      id: editing_id ?? make_clause_id(),
      field: draft_field,
      op: draft_op,
      value: draft_value.trim(),
    };
    if (editing_id) on_clauses_change(clauses.map((c) => (c.id === editing_id ? clause : c)));
    else on_clauses_change([...clauses, clause]);
    close_add();
  }

  function remove_clause(clause_id: string) {
    on_clauses_change(clauses.filter((c) => c.id !== clause_id));
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {selectable_folder && (
          <div className="flex items-center shrink-0 h-[29px] px-2 border border-border-subtle rounded">
            <Folder size={14} className="text-text-secondary shrink-0" />
            <select
              value={folder}
              onChange={(e) => on_folder_change(e.target.value)}
              disabled={disabled}
              className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-50">
              {FOLDER_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} className="text-gray-700">
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {clauses.map((clause) => (
          <button
            key={clause.id}
            onClick={() => !disabled && open_edit(clause)}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-border-subtle bg-white hover:bg-black/[0.03] transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
            {field_to_icon(clause.field)}
            <span className="text-xs text-text-primary max-w-[260px] truncate">
              {clause_summary(clause, { category_id_to_name: category_id_to_name, label_id_to_name: label_id_to_name })}
            </span>
            <span
              onClick={(e) => {
                if (disabled) return;
                e.stopPropagation();
                remove_clause(clause.id);
              }}
              className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-black/[0.05] cursor-pointer">
              <X size={14} className="text-text-secondary" />
            </span>
          </button>
        ))}

        <Popover
          open={add_open}
          on_open_change={(next) => {
            if (!next) close_add();
          }}
          placement="bottom-start"
          trigger={
            <button
              onClick={open_add}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded-md text-text-secondary hover:bg-black/[0.04] transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus size={14} />
              Add filter
            </button>
          }
          content_className="w-[320px] max-w-[90vw] rounded-lg border border-border-subtle bg-white shadow-xl p-3">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-text-tertiary font-medium block mb-1">Field</label>
              <select
                value={draft_field}
                onChange={(e) => {
                  const next = e.target.value as ClientFilterClause["field"];
                  set_draft_field(next);
                  const ops = allowed_ops_for_field(next);
                  set_draft_op(ops[0]);
                }}
                className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400">
                {Object.entries(FIELD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-tertiary font-medium block mb-1">Condition</label>
              <select
                value={draft_op}
                onChange={(e) => set_draft_op(e.target.value as ClientFilterClause["op"])}
                className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400">
                {allowed_ops_for_field(draft_field).map((op) => (
                  <option key={op} value={op}>
                    {op === "not_contains" ? "not contains" : op}
                  </option>
                ))}
              </select>
            </div>

            <div>
              {draft_field === "category" || draft_field === "label" ? (
                <label className="text-xs text-text-tertiary font-medium block mb-1">Value</label>
              ) : draft_field === "is_unread" || draft_field === "has_attachments" ? (
                <label className="text-xs text-text-tertiary font-medium block mb-1">Value</label>
              ) : draft_field === "date" ? (
                <label className="text-xs text-text-tertiary font-medium block mb-1">Date</label>
              ) : (
                <label className="text-xs text-text-tertiary font-medium block mb-1">Value</label>
              )}

              {draft_field === "category" ? (
                <select
                  value={draft_value}
                  onChange={(e) => set_draft_value(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400">
                  <option value="">Select category</option>
                  {labels.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : draft_field === "label" ? (
                <select
                  value={draft_value}
                  onChange={(e) => set_draft_value(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400">
                  <option value="">Select label</option>
                  {[...labels.userLabels, ...labels.systemLabels].map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              ) : draft_field === "is_unread" || draft_field === "has_attachments" ? (
                <select
                  value={String(draft_value_boolean)}
                  onChange={(e) => set_draft_value_boolean(e.target.value === "true")}
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : draft_field === "date" ? (
                <div className="flex gap-2">
                  {draft_op === "after" && (
                    <input
                      type="date"
                      value={draft_from}
                      onChange={(e) => set_draft_from(e.target.value)}
                      className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400" />
                  )}
                  {draft_op === "before" && (
                    <input
                      type="date"
                      value={draft_to}
                      onChange={(e) => set_draft_to(e.target.value)}
                      className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400" />
                  )}
                  {draft_op === "range" && (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="date"
                        value={draft_from}
                        onChange={(e) => set_draft_from(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400" />
                      <input
                        type="date"
                        value={draft_to}
                        onChange={(e) => set_draft_to(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400" />
                    </div>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={draft_value}
                  onChange={(e) => set_draft_value(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") apply_draft();
                  }}
                  placeholder="Enter text"
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400" />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={close_add}
                className="px-3 py-1.5 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={apply_draft}
                className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer">
                {editing_id ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </Popover>

        {clauses.length > 0 ? (
          <button
            onClick={() => on_clauses_change([])}
            disabled={disabled}
            className="shrink-0 ml-auto px-3 py-1 text-xs border border-border-subtle rounded-md text-text-secondary hover:bg-black/[0.04] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
            Clear all
          </button>
        ) : null}

      </div>

    </div>
  );
}
