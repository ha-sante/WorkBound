import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Signature } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { signature_templatesAtom, signatureAssignmentsAtom, accountContactsAtom, alertToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { error_message } from "@/shared/errors";
import { Select } from "../ui/select";

type SignatureTemplate = { id: string; account_id: string; name: string; body: string };

export function SignaturesPanel({ account }: { account: AccountRowWire | null }) {
  const globalTemplates = useAtomValue(signature_templatesAtom);
  const globalAssignments = useAtomValue(signatureAssignmentsAtom);
  const globalAliases = useAtomValue(accountContactsAtom);
  const setGlobalTemplates = useSetAtom(signature_templatesAtom);
  const setGlobalAssignments = useSetAtom(signatureAssignmentsAtom);
  const setAlert = useSetAtom(alertToastAtom);

  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignatureTemplate>({ id: "", account_id: account.id, name: "", body: "" });

  useEffect(() => {
    if (!globalTemplates.length && !globalAliases.length) return;
    setTemplates(globalTemplates as SignatureTemplate[]);
  }, [globalTemplates]);

  const handleOpenLink = useCallback((url: string) => {
    rpc.request(messages.url_open, { url });
  }, []);

  const handleContextMenu = useCallback((url: string, e: React.MouseEvent) => {
    e.preventDefault();
    rpc.request(messages.context_menu_show, { kind: "link", url, x: 0, y: 0 });
  }, []);

  const handleSaveTemplate = async () => {
    if (!draft.name.trim()) return;
    try {
      if (draft.id) {
        await rpc.request(messages.signature_update, { id: draft.id, name: draft.name, body: draft.body });
        setTemplates((prev) => {
          const updated = prev.map((t) => (t.id === draft.id ? { ...draft } : t));
          setGlobalTemplates(updated);
          return updated;
        });
      } else {
        const created = await rpc.request(messages.signature_create, {
          account_id: account.id,
          name: draft.name,
          body: draft.body,
        }) as SignatureTemplate;
        setTemplates((prev) => {
          const updated = [...prev, created];
          setGlobalTemplates(updated);
          return updated;
        });
      }
      setEditingId(null);
      setDraft({ id: "", account_id: account.id, name: "", body: "" });
    } catch (e) {
      setAlert({ message: `Failed to save template: ${error_message(e)}`, type: "error" });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await rpc.request(messages.signature_delete, { id });
      setTemplates((prev) => {
        const updated = prev.filter((t) => t.id !== id);
        setGlobalTemplates(updated);
        return updated;
      });
      setGlobalAssignments((prev) => {
        const updated = { ...prev };
        for (const [alias_id, tplId] of Object.entries(updated)) {
          if (tplId === id) updated[alias_id] = null;
        }
        rpc.request(messages.prefs_set, { key: "signature:assignments", value: updated }).catch((e) => {
          setAlert({ message: `Failed to save assignment: ${error_message(e)}`, type: "error" });
        });
        return updated;
      });
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setAlert({ message: `Failed to delete template: ${error_message(e)}`, type: "error" });
    }
  };

  const handleAssignmentChange = (alias_id: string, templateId: string | null) => {
    setGlobalAssignments((prev) => {
      const updated = { ...prev, [alias_id]: templateId };
      rpc.request(messages.prefs_set, { key: "signature:assignments", value: updated }).catch((e) => {
        setAlert({ message: `Failed to save assignment: ${error_message(e)}`, type: "error" });
      });
      return updated;
    });
  };

  const openNew = () => {
    setDraft({ id: "", account_id: account.id, name: "", body: "" });
    setEditingId("new");
  };

  const openEdit = (tpl: SignatureTemplate) => {
    setDraft({ ...tpl });
    setEditingId(tpl.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ id: "", account_id: account.id, name: "", body: "" });
  };

  if (!globalAliases.length) {
    return (
      <div className="p-6 space-y-6 overflow-x-hidden">
        <h2 className="text-lg font-medium text-text-primary">Signatures</h2>
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signature size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Signatures</h2>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer text-text-secondary"
        >
          + New
        </button>
      </div>

        {editingId !== null && (
          <div className="space-y-2 mb-4">
            <input
              className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="Template name"
              autoFocus={editingId === "new"}
            />
            <textarea
              className="w-full p-3 text-sm border rounded-lg resize-y min-h-[80px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={draft.body}
              onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
              placeholder="Paste HTML or type your signature..."
            />
            {draft.body.trim() && (
              <div>
                <p className="text-xs text-text-secondary mb-1">Preview</p>
                <div className="p-3 border rounded bg-white text-sm overflow-x-auto">
                  <div dangerouslySetInnerHTML={{ __html: draft.body }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTemplate}
                disabled={!draft.name.trim()}
                className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border-subtle border border-border-subtle rounded">
          {templates.length === 0 && (
            <p className="text-sm text-text-secondary">No signature templates yet.</p>
          )}

          {templates.map((tpl) => (
            <div key={tpl.id} className="py-2 px-3 space-y-0.5 group">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-text-primary"><span className="text-text-secondary mr-1.5">○</span>{tpl.name}</p>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(tpl)}
                    className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
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

      {globalAliases.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-2">Per-Alias Assignment</h3>
          <div className="space-y-2">
            {globalAliases.map((alias) => (
              <div key={alias.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-text-primary truncate mr-3">{alias.send_as_email}</span>
                <Select
                  value={globalAssignments[alias.id] ?? ""}
                  onChange={(e) => handleAssignmentChange(alias.id, e.target.value || null)}
                  full_width={false}
                >
                  <option value="">None</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-text-primary mb-2">Signature Resources</h3>
        <p className="text-xs text-text-secondary mb-2">Tools to help create custom email signatures.</p>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleOpenLink("https://signatureforemail.com/")}
            onContextMenu={(e) => handleContextMenu("https://signatureforemail.com/", e)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 underline-offset-2 hover:underline transition-colors cursor-pointer bg-transparent border-none text-left"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-gray-500" />
            signatureforemail.com
          </button>
          <button
            onClick={() => handleOpenLink('https://www.google.com/search?q=%22free+email+signature+maker%22')}
            onContextMenu={(e) => handleContextMenu('https://www.google.com/search?q=%22free+email+signature+maker%22', e)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 underline-offset-2 hover:underline transition-colors cursor-pointer bg-transparent border-none text-left"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-gray-500" />
            Search for "free email signature maker"
          </button>
        </div>
      </div>
    </div>
  );
}
