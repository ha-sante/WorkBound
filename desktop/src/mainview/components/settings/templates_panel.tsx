import { useState, useEffect, useRef, useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { email_templatesAtom, templates_loaded_atom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { MdexEditor } from "../compose/editor/mdex";
import { add_inline_styles_to_html } from "../../utils/email_html";

export function TemplatesPanel({ account_id }: { account_id: string }) {
  const globalTemplates = useAtomValue(email_templatesAtom);
  const setGlobalTemplates = useSetAtom(email_templatesAtom);
  const templatesLoaded = useAtomValue(templates_loaded_atom);

  const [templates, setTemplates] = useState<EmailTemplateWire[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ id: "", name: "", body: "" });
  const bodyEditorRef = useRef<HTMLDivElement | null>(null);

  const preview_html = useMemo(() => add_inline_styles_to_html(draft.body), [draft.body]);

  const handle_preview_click = async (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest?.("a[href]");
    if (!a) return;
    e.preventDefault();
    const url = a.getAttribute("href") ?? "";
    if (!url) return;
    try {
      await rpc.request(messages.url_open, { url });
    } catch { console.warn("templates_panel: failed to open link"); }
  };

  useEffect(() => {
    if (!templatesLoaded) return;
    setTemplates(globalTemplates);
  }, [globalTemplates, templatesLoaded]);

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    if (draft.id) {
      const existing_subject = templates.find(t => t.id === draft.id)?.subject ?? "";
      await rpc.request(messages.templates_update, { id: draft.id, name: draft.name, subject: existing_subject, body: draft.body });
      const updated = templates.map(t => t.id === draft.id ? { ...t, name: draft.name, body: draft.body } : t);
      setTemplates(updated);
      setGlobalTemplates(updated);
    } else {
      const created = await rpc.request(messages.templates_create, { account_id, name: draft.name, subject: "", body: draft.body }) as EmailTemplateWire;
      const updated = [...templates, created];
      setTemplates(updated);
      setGlobalTemplates(updated);
    }
    setEditingId(null);
    setDraft({ id: "", name: "", body: "" });
  };

  const handleDelete = async (id: string) => {
    await rpc.request(messages.templates_delete, { id });
    if (editingId === id) { setEditingId(null); setDraft({ id: "", name: "", body: "" }); }
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    setGlobalTemplates(updated);
  };

  const openNew = () => {
    setDraft({ id: "", name: "", body: "" });
    setEditingId("new");
  };

  const openEdit = (tpl: EmailTemplateWire) => {
    setDraft({ id: tpl.id, name: tpl.name, body: tpl.body });
    setEditingId(tpl.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ id: "", name: "", body: "" });
  };

  if (!templatesLoaded) return <div className="p-6 space-y-6"><h2 className="text-lg font-medium text-text-primary">Templates</h2><p className="text-sm text-text-secondary">Loading...</p></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Templates</h2>
        </div>
        <button onClick={openNew} className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
          <Plus size={14} />
          New
        </button>
      </div>

      {editingId && (
        <div className="space-y-2">
          <input className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Template name" autoFocus={editingId === "new"} />
          <div className="border rounded-lg overflow-hidden h-56 p-3">
            <MdexEditor
              key={draft.id || "new"}
              initialHtml={draft.body}
              editorRef={bodyEditorRef}
              placeholder="Template body…"
              onBodyInput={() =>
                setDraft((p) => ({ ...p, body: bodyEditorRef.current?.innerHTML ?? "" }))
              }
            />
          </div>
          {draft.body.trim() && (
            <div>
              <p className="text-xs text-text-secondary mb-1">Preview</p>
              <div
                className="p-3 border rounded bg-white text-sm overflow-x-auto cursor-pointer"
                onClick={handle_preview_click}
                dangerouslySetInnerHTML={{ __html: preview_html }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={!draft.name.trim()} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">Save</button>
            <button onClick={cancelEdit} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {templates.length === 0 && !editingId ? (
        <p className="text-sm text-text-secondary">No templates yet.</p>
      ) : (
        <div className="divide-y divide-border-subtle border border-border-subtle rounded">
          {templates.map((tpl) => (
            <div key={tpl.id} className="py-2 px-3 space-y-0.5 group">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-text-primary min-w-0"><span className="text-text-secondary mr-1.5">○</span>{tpl.name}</p>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                  <button onClick={() => openEdit(tpl)} className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Edit</button>
                  <button onClick={() => handleDelete(tpl.id)} className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 cursor-pointer">Delete</button>
                </div>
              </div>
              {tpl.body && (
                <p className="text-xs text-text-secondary ml-4 truncate">
                  {tpl.body.replace(/<[^>]*>/g, "").slice(0, 120)}{tpl.body.replace(/<[^>]*>/g, "").length > 120 ? "…" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
