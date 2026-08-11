import { useState, useEffect, useRef } from "react";
import { Tag, Plus, Search, icons as lucide_icons } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { labelsAtom, labels_loaded_atom, alertToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { error_message } from "@/shared/errors";
import { LabelIconPickerPopover } from "./label_icon_picker";

export function LabelsPanel({ account_id }: { account_id: string }) {
  const globalLabels = useAtomValue(labelsAtom);
  const setGlobalLabels = useSetAtom(labelsAtom);
  const labelsLoaded = useAtomValue(labels_loaded_atom);
  const setAlert = useSetAtom(alertToastAtom);

  const [labels, setLabels] = useState<
    { id: string; name: string; icon_name?: string | null }[]
  >([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftIconName, setDraftIconName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  useEffect(() => {
    if (!labelsLoaded) return;
    setLabels(globalLabels.userLabels);
  }, [globalLabels, labelsLoaded]);
  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const DraftIcon = draftIconName
    ? (lucide_icons as Record<string, any>)[draftIconName]
    : null;

  const handleSave = async () => {
    const name = draftName.trim();
    if (!name || !account_id) return;
    setSaving(true);
    try {
      if (editingId && editingId !== "new") {
        await rpc.request(messages.labels_update, {
          account_id,
          id: editingId,
          name,
          icon_name: draftIconName,
        });
        const updated = labels.map((l) =>
          l.id === editingId ? { ...l, name, icon_name: draftIconName } : l,
        );
        setLabels(updated);
        setGlobalLabels((prev) => ({ ...prev, userLabels: updated }));
      } else {
        const created = (await rpc.request(messages.labels_create, {
          account_id,
          name,
          icon_name: draftIconName,
        })) as { id: string; name: string; icon_name?: string | null };
        const updated = [...labels, created];
        setLabels(updated);
        setGlobalLabels((prev) => ({ ...prev, userLabels: updated }));
      }
      setDraftName("");
      setDraftIconName(null);
      setEditingId(null);
      setIconPickerOpen(false);
      setIconSearch("");
    } catch (e) {
      setAlert({
        message: `Failed to save label: ${error_message(e)}`,
        type: "error",
      });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await rpc.request(messages.labels_delete, { account_id, id });
      const updated = labels.filter((l) => l.id !== id);
      setLabels(updated);
      setGlobalLabels((prev) => ({ ...prev, userLabels: updated }));
    } catch (e) {
      setAlert({
        message: `Failed to delete label: ${error_message(e)}`,
        type: "error",
      });
    }
  };

  const openNew = () => {
    setDraftName("");
    setDraftIconName(null);
    setEditingId("new");
    setIconPickerOpen(false);
    setIconSearch("");
  };

  const openEdit = (label: LabelWire) => {
    setDraftName(label.name);
    setDraftIconName(label.icon_name ?? null);
    setEditingId(label.id);
    setIconPickerOpen(false);
    setIconSearch("");
  };

  const cancelEdit = () => {
    setDraftName("");
    setDraftIconName(null);
    setEditingId(null);
    setIconPickerOpen(false);
    setIconSearch("");
  };

  if (!labelsLoaded)
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-medium text-text-primary">Labels</h2>
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Labels</h2>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {editingId === "new" && (
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIconPickerOpen((prev) => {
                const next = !prev;
                if (next) setIconSearch("");
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
            <span>Icon</span>
          </button>

          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") cancelEdit();
            }}
            placeholder="Label name"
            className="flex-1 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />

          <LabelIconPickerPopover
            open={iconPickerOpen}
            icon_search={iconSearch}
            on_icon_search_change={setIconSearch}
            on_icon_pick={setDraftIconName}
            on_open_change={setIconPickerOpen}
          />

          <button
            onClick={handleSave}
            disabled={saving || !draftName.trim()}
            className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={cancelEdit}
            className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {labels.length === 0 && editingId !== "new" ? (
        <p className="text-sm text-text-secondary">No labels yet.</p>
      ) : (
        <div className="border border-border-subtle rounded divide-y divide-border-subtle">
          {labels.map((label) => {
            const isEditing = editingId === label.id;
            return (
              <div key={label.id} className="py-2 px-3 group">
                <div className="flex items-center justify-between gap-2">
                  {isEditing ? (
                    <div className="relative flex items-center gap-2 flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIconPickerOpen((prev) => {
                            const next = !prev;
                            if (next) setIconSearch("");
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
                        <span>Icon</span>
                      </button>

                      <input
                        ref={inputRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        autoFocus
                      />

                      <LabelIconPickerPopover
                        open={iconPickerOpen}
                        icon_search={iconSearch}
                        on_icon_search_change={setIconSearch}
                        on_icon_pick={setDraftIconName}
                        on_open_change={setIconPickerOpen}
                      />

                      <button
                        onClick={handleSave}
                        disabled={saving || !draftName.trim()}
                        className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-text-primary truncate flex items-center gap-1">
                        <span className="text-text-secondary">○</span>
                        {label.icon_name
                          ? (() => {
                              const I = (lucide_icons as Record<string, any>)[
                                label.icon_name!
                              ];
                              return I ? (
                                <I size={14} className="text-text-secondary" />
                              ) : null;
                            })()
                          : null}
                        <span className="truncate">{label.name}</span>
                      </p>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(label)}
                          className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(label.id)}
                          className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
