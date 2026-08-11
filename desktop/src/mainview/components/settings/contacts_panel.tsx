import { useState, useEffect, useRef } from "react";
import { Search, Users, Plus, X } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { contactsAtom, contacts_loaded_atom, alertToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { error_message } from "@/shared/errors";
import { useVirtualizer } from "@tanstack/react-virtual";
import AvatarImage from "../avatar_image";

export function ContactsPanel({ account_id }: { account_id: string }) {
  const globalContacts = useAtomValue(contactsAtom);
  const setGlobalContacts = useSetAtom(contactsAtom);
  const contactsLoaded = useAtomValue(contacts_loaded_atom);
  const setAlert = useSetAtom(alertToastAtom);

  const [allContacts, setAllContacts] = useState<ContactWire[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!contactsLoaded) return;
    setAllContacts(globalContacts);
  }, [globalContacts, contactsLoaded]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    try {
      const created = await rpc.request(messages.contacts_create, { account_id, name: addName.trim() || undefined, email: addEmail.trim() }) as ContactWire;
      const updated = [...allContacts, created];
      setAllContacts(updated);
      setGlobalContacts(updated);
      setShowAdd(false);
      setAddName("");
      setAddEmail("");
    } catch (e) {
      setAlert({ message: `Failed to add contact: ${error_message(e)}`, type: "error" });
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await rpc.request(messages.contacts_update, { id, name: editName.trim() || undefined });
      const updated = allContacts.map(c => c.id === id ? { ...c, name: editName.trim() || null } : c);
      setAllContacts(updated);
      setGlobalContacts(updated);
      setEditingId(null);
    } catch (e) {
      setAlert({ message: `Failed to update contact: ${error_message(e)}`, type: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await rpc.request(messages.contacts_delete, { id });
      const updated = allContacts.filter(c => c.id !== id);
      setAllContacts(updated);
      setGlobalContacts(updated);
    } catch (e) {
      setAlert({ message: `Failed to delete contact: ${error_message(e)}`, type: "error" });
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allContacts.filter((c) => (c.name && c.name.toLowerCase().includes(q)) || c.email.toLowerCase().includes(q))
    : allContacts;

  const listRef = useRef<HTMLDivElement>(null);
  const rowHeight = 36;
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 space-y-4 shrink-0">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Contacts</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => { setShowAdd(true); setAddName(""); setAddEmail(""); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {showAdd && (
          <div className="space-y-2 shrink-0">
            <input
              className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Name (optional)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              autoFocus
            />
            <input
              className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={!addEmail.trim()}
                className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!contactsLoaded ? (
        <p className="text-sm text-text-secondary px-6">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary px-6">{q ? "No matching contacts." : "No contacts yet."}</p>
      ) : (
        <div ref={listRef} className="flex-1 overflow-auto" style={{ contain: "strict" }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const c = filtered[vItem.index];
              return (
                <div
                  key={c.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: rowHeight,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  className="group flex items-center px-6 gap-2"
                >
                  {editingId === c.id ? (
                    <>
                      <input
                        className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                        autoFocus
                      />
                      <span className="text-sm text-text-secondary truncate max-w-[200px]">{c.email}</span>
                      <button
                        onClick={() => handleUpdate(c.id)}
                        className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <AvatarImage
                        url={c.avatar_url}
                        name={c.name}
                        email={c.email}
                        imgClassName="w-6 h-6 rounded-full shrink-0"
                        initialsClassName="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-text-secondary shrink-0"
                      />
                      <span className="text-sm font-medium text-text-primary min-w-0 truncate">{c.name || "(no name)"}</span>
                      <span className="text-sm text-text-secondary truncate hidden sm:block">{c.email}</span>
                      <span className="text-xs text-text-secondary ml-auto shrink-0">{c.times_contacted} interaction{c.times_contacted !== 1 ? "s" : ""}</span>
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingId(c.id); setEditName(c.name || ""); }}
                          className="text-text-secondary hover:text-text-primary cursor-pointer text-xs"
                          title="Edit name"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-red-400 hover:text-red-600 cursor-pointer text-xs"
                          title="Delete"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
