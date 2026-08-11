import { useState } from "react";

type Props = {
  entry: ConfigEntryWire;
  onSave: (key: string, value: string) => Promise<void>;
  onReset: (key: string) => Promise<void>;
};

const colors: Record<string, string> = {
  override: "bg-amber-100 text-amber-700",
  env: "bg-blue-100 text-blue-700",
  default: "bg-gray-100 text-gray-500",
};

export function ConfigRow({ entry, onSave, onReset }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.displayValue);

  const handleSave = async () => {
    await onSave(entry.key, editValue.trim() || "");
    setEditing(false);
  };

  const handleReset = async () => {
    await onReset(entry.key);
    setEditing(false);
  };

  const startEdit = () => {
    setEditValue(entry.displayValue);
    setEditing(true);
  };

  return (
    <div className="py-1.5 px-3 group">
      <div className="flex items-center justify-between gap-2 min-h-[28px]">
        <p className="text-sm text-text-primary shrink-0">
          <span className="text-text-secondary mr-1.5">○</span>{entry.key}
        </p>
        {editing ? (
          <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-48 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <code className="text-xs text-text-primary truncate">
              {entry.displayValue || <span className="text-text-tertiary italic">not set</span>}
            </code>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[entry.source] ?? "bg-gray-100"}`}>
              {entry.source}
            </span>
            <div className="flex items-center gap-1 hidden group-hover:flex shrink-0">
              {entry.source === "override" && (
                <button
                  onClick={handleReset}
                  className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
                >
                  Reset
                </button>
              )}
              <button
                onClick={startEdit}
                className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-text-tertiary ml-5 mt-0.5">{entry.meta.description}</p>
    </div>
  );
}
