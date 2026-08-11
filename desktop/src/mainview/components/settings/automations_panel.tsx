import { useState, useEffect, useCallback } from "react";
import { Zap, ArrowLeft, Plus } from "lucide-react";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { Select } from "../ui/select";

type Mode = "list" | "create";

type FilterDraft = {
  criteria: {
    from: string;
    to: string;
    subject: string;
    query: string;
    negatedQuery: string;
    hasAttachment: boolean;
    size: number | null;
    sizeComparison: "larger" | "smaller";
  };
  actions: {
    skipInbox: boolean;
    markRead: boolean;
    star: boolean;
    applyLabelId: string;
    forward: string;
    delete_: boolean;
    markImportant: boolean;
    neverImportant: boolean;
    neverSpam: boolean;
    categorizeAs: string;
  };
};

const EMPTY_DRAFT: FilterDraft = {
  criteria: { from: "", to: "", subject: "", query: "", negatedQuery: "", hasAttachment: false, size: null, sizeComparison: "larger" },
  actions: { skipInbox: false, markRead: false, star: false, applyLabelId: "", forward: "", delete_: false, markImportant: false, neverImportant: false, neverSpam: false, categorizeAs: "" },
};

function describe_criteria(c: FilterCriteriaWire): string[] {
  const parts: string[] = [];
  if (c.from) parts.push(`From: ${c.from}`);
  if (c.to) parts.push(`To: ${c.to}`);
  if (c.subject) parts.push(`Subject: ${c.subject}`);
  if (c.query) parts.push(`Query: ${c.query}`);
  if (c.hasAttachment) parts.push("Has attachment");
  if (c.size != null) {
    const cmp = c.sizeComparison === "larger" ? ">" : "<";
    parts.push(`Size: ${cmp} ${c.size} bytes`);
  }
  return parts;
}

function describe_action(a: FilterActionWire): string[] {
  const parts: string[] = [];
  if (a.add_label_ids?.length) parts.push(`Apply labels: ${a.add_label_ids.join(", ")}`);
  if (a.remove_label_ids?.length) parts.push(`Remove labels: ${a.remove_label_ids.join(", ")}`);
  if (a.forward) parts.push(`Forward to: ${a.forward}`);
  return parts;
}

const SYSTEM_ACTION_IDS = new Set(["INBOX", "UNREAD", "STARRED", "TRASH", "IMPORTANT"]);

function filter_to_draft(f: FilterWire, label_idMap: Map<string, string>): FilterDraft {
  const raw = f.actionRaw ?? f.action;
  const addIds = raw.add_label_ids ?? [];
  const removeIds = raw.remove_label_ids ?? [];
  const nameToId = new Map<string, string>();
  for (const [id, name] of label_idMap) nameToId.set(name, id);

  const findFirst = (ids: string[], exclude: Set<string>): string => ids.find((id) => !exclude.has(id) && !id.startsWith("CATEGORY_")) ?? "";
  const findCategory = (ids: string[]): string => ids.find((id) => id.startsWith("CATEGORY_")) ?? "";

  let applyLabelId = "";
  if (addIds.length > 0) {
    const candidate = findFirst(addIds, SYSTEM_ACTION_IDS);
    if (candidate) applyLabelId = nameToId.get(candidate) ?? candidate;
  }

  let categorizeAs = "";
  if (addIds.length > 0) {
    const cat = findCategory(addIds);
    if (cat) categorizeAs = cat;
  }

  return {
    criteria: {
      from: f.criteria.from ?? "",
      to: f.criteria.to ?? "",
      subject: f.criteria.subject ?? "",
      query: f.criteria.query ?? "",
      negatedQuery: f.criteria.negatedQuery ?? "",
      hasAttachment: f.criteria.hasAttachment ?? false,
      size: f.criteria.size ?? null,
      sizeComparison: (f.criteria.sizeComparison as "larger" | "smaller") ?? "larger",
    },
    actions: {
      skipInbox: removeIds.includes("INBOX"),
      markRead: removeIds.includes("UNREAD"),
      star: addIds.includes("STARRED"),
      applyLabelId,
      forward: raw.forward ?? "",
      delete_: addIds.includes("TRASH"),
      markImportant: addIds.includes("IMPORTANT"),
      neverImportant: removeIds.includes("IMPORTANT"),
      neverSpam: removeIds.includes("SPAM"),
      categorizeAs,
    },
  };
}

export function AutomationsPanel({ account_id }: { account_id: string }) {
  const [filters, setFilters] = useState<FilterWire[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [userLabels, setUserLabels] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      if (!account_id) { setLoaded(true); return; }
      const list = await rpc.request(messages.filters_list, { account_id }) as FilterWire[];
      setFilters(list ?? []);
    } catch {
      setFilters([]);
    }
    setLoaded(true);
  }, [account_id]);

  useEffect(() => { load(); }, [load]);

  const openCreate = async () => {
    try {
      const res = await rpc.request(messages.labels_list, { account_id });
      setUserLabels(res.userLabels ?? []);
      setCategories(res.categories ?? []);
    } catch { console.warn("automations: failed to load labels for create"); }
    setDraft(EMPTY_DRAFT);
    setEditingFilterId(null);
    setMode("create");
  };

  const closeCreate = () => { setEditingFilterId(null); setMode("list"); };

  const openEdit = async (f: FilterWire) => {
    try {
      const res = await rpc.request(messages.labels_list, { account_id });
      setUserLabels(res.userLabels ?? []);
      setCategories(res.categories ?? []);
      const label_idMap = new Map<string, string>();
      for (const l of [...res.userLabels, ...res.systemLabels, ...res.categories]) label_idMap.set(l.id, l.name);
      setDraft(filter_to_draft(f, label_idMap));
    } catch { console.warn("automations: failed to load labels for edit"); }
    setEditingFilterId(f.id);
    setMode("create");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const criteria: FilterCriteriaWire = {};
      if (draft.criteria.from) criteria.from = draft.criteria.from;
      if (draft.criteria.to) criteria.to = draft.criteria.to;
      if (draft.criteria.subject) criteria.subject = draft.criteria.subject;
      if (draft.criteria.query) criteria.query = draft.criteria.query;
      if (draft.criteria.negatedQuery) criteria.negatedQuery = draft.criteria.negatedQuery;
      if (draft.criteria.hasAttachment) criteria.hasAttachment = true;
      if (draft.criteria.size != null) { criteria.size = draft.criteria.size; criteria.sizeComparison = draft.criteria.sizeComparison; }

      const add_label_ids: string[] = [];
      const remove_label_ids: string[] = [];
      if (draft.actions.skipInbox) remove_label_ids.push("INBOX");
      if (draft.actions.markRead) remove_label_ids.push("UNREAD");
      if (draft.actions.star) add_label_ids.push("STARRED");
      if (draft.actions.applyLabelId) add_label_ids.push(draft.actions.applyLabelId);
      if (draft.actions.delete_) { add_label_ids.push("TRASH"); if (!remove_label_ids.includes("INBOX")) remove_label_ids.push("INBOX"); }
      if (draft.actions.markImportant) add_label_ids.push("IMPORTANT");
      if (draft.actions.neverImportant) remove_label_ids.push("IMPORTANT");
      if (draft.actions.neverSpam) remove_label_ids.push("SPAM");
      if (draft.actions.categorizeAs) add_label_ids.push(draft.actions.categorizeAs);

      const action: FilterActionWire = {};
      if (add_label_ids.length > 0) action.add_label_ids = add_label_ids;
      if (remove_label_ids.length > 0) action.remove_label_ids = remove_label_ids;
      if (draft.actions.forward) action.forward = draft.actions.forward;

      if (editingFilterId) {
        await rpc.request(messages.filters_delete, { account_id, id: editingFilterId });
      }
      await rpc.request(messages.filters_create, { account_id, criteria, action });
      setEditingFilterId(null);
      setMode("list");
      await load();
    } catch (e) {
      console.error("filters:save failed", e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await rpc.request(messages.filters_delete, { account_id, id });
    await load();
  };

  if (!loaded) return <div className="p-6 space-y-6"><h2 className="text-lg font-medium text-text-primary">Automations</h2><p className="text-sm text-text-secondary">Loading...</p></div>;

  if (mode === "create") {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <button onClick={closeCreate} className="p-1 hover:bg-black/[0.04] rounded cursor-pointer"><ArrowLeft size={18} /></button>
          <Zap size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">{editingFilterId ? "Edit Filter" : "New Filter"}</h2>
        </div>

        <p className="text-xs text-text-secondary">When a message matches all of the following criteria:</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">From</label>
            <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.from} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, from: e.target.value } }))} placeholder="sender@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">To</label>
            <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.to} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, to: e.target.value } }))} placeholder="recipient@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Subject</label>
            <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.subject} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, subject: e.target.value } }))} placeholder="meeting" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Has the words</label>
            <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.query} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, query: e.target.value } }))} placeholder='e.g. has:attachment' />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Doesn't have</label>
            <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.negatedQuery} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, negatedQuery: e.target.value } }))} placeholder='e.g. from:newsletter' />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="has-attachment" className="cursor-pointer" checked={draft.criteria.hasAttachment} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, hasAttachment: e.target.checked } }))} />
            <label htmlFor="has-attachment" className="text-sm text-text-primary cursor-pointer">Has attachment</label>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-primary">Size</label>
            <Select full_width={false} value={draft.criteria.sizeComparison} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, sizeComparison: e.target.value as "larger" | "smaller" } }))}>
              <option value="larger">larger than</option>
              <option value="smaller">smaller than</option>
            </Select>
            <input type="number" className="w-24 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.criteria.size ?? ""} onChange={(e) => setDraft((p) => ({ ...p, criteria: { ...p.criteria, size: e.target.value ? Number(e.target.value) : null } }))} placeholder="bytes" />
          </div>
        </div>

        <p className="text-xs text-text-secondary">Do the following:</p>

        <div className="space-y-2 border border-border-subtle rounded p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.skipInbox} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, skipInbox: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Skip the Inbox (Archive it)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.markRead} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, markRead: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Mark as read</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.star} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, star: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Star it</span>
          </label>
          <div className="flex items-center gap-2">
            <input type="checkbox" className="cursor-pointer" checked={!!draft.actions.applyLabelId} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, applyLabelId: e.target.checked ? (userLabels[0]?.id ?? "") : "" } }))} />
            <span className="text-sm text-text-primary">Apply label:</span>
            <Select wrapper_class="flex-1" value={draft.actions.applyLabelId} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, applyLabelId: e.target.value } }))}>
              <option value="">Select a label</option>
              {userLabels.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary">Forward it to:</span>
            <input className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.actions.forward} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, forward: e.target.value } }))} placeholder="forward@example.com" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.delete_} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, delete_: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Delete it</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.markImportant} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, markImportant: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Always mark it as important</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.neverImportant} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, neverImportant: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Never mark it as important</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="cursor-pointer" checked={draft.actions.neverSpam} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, neverSpam: e.target.checked } }))} />
            <span className="text-sm text-text-primary">Never send it to Spam</span>
          </label>
          <div className="flex items-center gap-2">
            <input type="checkbox" className="cursor-pointer" checked={!!draft.actions.categorizeAs} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, categorizeAs: e.target.checked ? categories[0]?.id ?? "" : "" } }))} />
            <span className="text-sm text-text-primary">Categorize as:</span>
            <Select wrapper_class="flex-1" value={draft.actions.categorizeAs} onChange={(e) => setDraft((p) => ({ ...p, actions: { ...p.actions, categorizeAs: e.target.value } }))}>
              <option value="">Select a category</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">{saving ? "Saving..." : "Save"}</button>
          <button onClick={closeCreate} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Automations</h2>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
          <Plus size={14} />
          New
        </button>
      </div>

      {filters.length === 0 ? (
        <p className="text-sm text-text-secondary">No filters yet.</p>
      ) : (
        <div className="border border-border-subtle rounded divide-y divide-border-subtle">
          {filters.map((f) => {
            const criteriaLines = describe_criteria(f.criteria);
            const actionLines = describe_action(f.action);
            return (
              <div key={f.id} className="py-2 px-3 space-y-0.5 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {criteriaLines.map((line, i) => (
                      <p key={i} className="text-sm text-text-primary break-words"><span className="text-text-secondary mr-1.5">○</span>{line}</p>
                    ))}
                    {criteriaLines.length === 0 && (
                      <p className="text-sm text-text-primary break-words"><span className="text-text-secondary mr-1.5">○</span>Catch all</p>
                    )}
                    {actionLines.map((line, i) => (
                      <p key={i} className="text-xs text-text-secondary ml-4 break-words">{line}</p>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                    <button onClick={() => openEdit(f)} className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Edit</button>
                    <button onClick={() => handleDelete(f.id)} className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 cursor-pointer">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
