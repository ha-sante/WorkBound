import { useState, useEffect } from "react";
import { ChevronRight, Plus, StickyNote } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { notesAtom, notes_loaded_atom, alertToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { error_message } from "@/shared/errors";
import { format_date_only } from "@/shared/datetime";

function note_title(content: string): string {
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + "...";
}

export function NotesPanel({ account_id }: { account_id: string }) {
  const globalNotes = useAtomValue(notesAtom);
  const setGlobalNotes = useSetAtom(notesAtom);
  const notesLoaded = useAtomValue(notes_loaded_atom);
  const setAlert = useSetAtom(alertToastAtom);

  const [notes, setNotes] = useState<NoteWire[]>([]);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!notesLoaded) return;
    setNotes(globalNotes);
  }, [globalNotes, notesLoaded]);

  const toggle = (id: string) => setOpenNotes((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDelete = async (id: string) => {
    try {
      await rpc.request(messages.notes_delete, { id });
      const updated = notes.filter(n => n.id !== id);
      setNotes(updated);
      setGlobalNotes(updated);
    } catch (e) {
      setAlert({ message: `Failed to delete note: ${error_message(e)}`, type: "error" });
    }
  };

  const handleSave = async () => {
    const content = draft.trim();
    if (!content || !account_id) return;
    try {
      if (editingId && editingId !== "new") {
        await rpc.request(messages.notes_update, { id: editingId, content });
        const updated = notes.map(n => n.id === editingId ? { ...n, content } : n);
        setNotes(updated);
        setGlobalNotes(updated);
      } else {
        const created = await rpc.request(messages.notes_create, { account_id, content }) as NoteWire;
        const updated = [...notes, created];
        setNotes(updated);
        setGlobalNotes(updated);
      }
      setDraft("");
      setEditingId(null);
    } catch (e) {
      setAlert({ message: `Failed to save note: ${error_message(e)}`, type: "error" });
    }
  };

  const openNew = () => {
    setDraft("");
    setEditingId("new");
  };

  const openEdit = (note: NoteWire) => {
    setDraft(note.content);
    setEditingId(note.id);
    setOpenNotes((prev) => ({ ...prev, [note.id]: true }));
  };

  const cancelEdit = () => {
    setDraft("");
    setEditingId(null);
  };

  if (!notesLoaded) return <div className="p-6 space-y-6"><h2 className="text-lg font-medium text-text-primary">Notes</h2><p className="text-sm text-text-secondary">Loading...</p></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Notes</h2>
        </div>
        <button onClick={openNew} className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
          <Plus size={14} />
          New
        </button>
      </div>

      {editingId !== null && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a note..."
            className="w-full p-3 text-sm border rounded-lg resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={!draft.trim()} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">{editingId === "new" ? "Save" : "Update"}</button>
            <button onClick={cancelEdit} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {notes.length === 0 && editingId === null ? (
        <p className="text-sm text-text-secondary">No notes yet.</p>
      ) : (
        <div className="border border-border-subtle rounded divide-y divide-border-subtle">
          {notes.map((n) => {
            const isOpen = openNotes[n.id];
            return (
              <div key={n.id} className="px-3 group">
                <button onClick={() => toggle(n.id)} className="flex items-center justify-between w-full text-left cursor-pointer py-3">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-medium text-text-primary truncate"><span className="text-text-secondary mr-1.5">○</span>{note_title(n.content) || "Note"}</p>
                    {n.created_at && (
                      <p className="text-xs text-text-tertiary">{format_date_only(n.created_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 mr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(n); }}
                      className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
                    >Edit</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                      className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 cursor-pointer"
                    >Delete</button>
                  </div>
                  <ChevronRight size={16} className={`text-text-secondary transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                </button>
                {isOpen && (
                  <div className="pb-3">
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{n.content}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
