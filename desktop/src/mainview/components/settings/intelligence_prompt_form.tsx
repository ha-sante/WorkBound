import { useState } from "react";
import { X } from "lucide-react";

export type LabelTagValue = { id: string; name: string };

export function LabelTagInput({
  labels,
  value,
  onChange,
  onCreateLabel,
  onQueryChange,
}: {
  labels: LabelTagValue[];
  value: LabelTagValue[];
  onChange: (labels: LabelTagValue[]) => void;
  onCreateLabel: (name: string) => Promise<LabelTagValue | null>;
  onQueryChange?: (query: string) => void;
}) {
  const [query, set_query] = useState("");
  const [open, set_open] = useState(false);

  const trimmed = query.trim();
  const selected_ids = new Set(value.map((v) => v.id));
  const matches = trimmed
    ? labels.filter((l) => l.name.toLowerCase().includes(trimmed.toLowerCase()) && !selected_ids.has(l.id))
    : labels.filter((l) => !selected_ids.has(l.id));

  const select = (label: LabelTagValue) => {
    onChange([...value, label]);
    set_query("");
    set_open(false);
  };

  const create = async () => {
    const created = await onCreateLabel(trimmed);
    if (created) {
      onChange([...value, created]);
      set_query("");
      set_open(false);
    }
  };

  const remove = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
    set_query("");
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 flex-wrap w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus-within:ring-1 focus-within:ring-blue-400">
        {value.map((v) => (
          <span key={v.id} className="flex items-center gap-1 bg-black/[0.06] rounded px-2 py-0.5 text-xs text-text-primary">
            {v.name}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(v.id)}
              className="text-text-secondary hover:text-text-primary cursor-pointer"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            set_query(e.target.value);
            onQueryChange?.(e.target.value);
            set_open(true);
          }}
          onFocus={() => set_open(true)}
          onBlur={() => setTimeout(() => set_open(false), 150)}
          placeholder={value.length === 0 ? "Select labels or type new ones" : "Add more labels..."}
          className="flex-1 min-w-[10rem] text-sm bg-transparent outline-none"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-auto border border-border-subtle rounded bg-white shadow-lg">
          {matches.length === 0 && trimmed === "" && (
            <p className="px-3 py-2 text-xs text-text-secondary">No more labels.</p>
          )}
          {matches.map((l) => (
            <button
              key={l.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(l)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/[0.04] cursor-pointer"
            >
              {l.name}
            </button>
          ))}
          {trimmed !== "" && matches.length === 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={create}
              className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-black/[0.04] cursor-pointer"
            >
              Create "{trimmed}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PromptEntryForm({
  name,
  prompt,
  labels,
  allLabels,
  onNameChange,
  onPromptChange,
  onLabelsChange,
  onCreateLabel,
  onQueryChange,
}: {
  name: string;
  prompt: string;
  labels: LabelTagValue[];
  allLabels: LabelTagValue[];
  onNameChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onLabelsChange: (v: LabelTagValue[]) => void;
  onCreateLabel: (name: string) => Promise<LabelTagValue | null>;
  onQueryChange?: (query: string) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name"
        className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe what to match, e.g. order confirmations"
        rows={2}
        className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
      />
      <LabelTagInput
        labels={allLabels}
        value={labels}
        onChange={onLabelsChange}
        onCreateLabel={onCreateLabel}
        onQueryChange={onQueryChange}
      />
    </div>
  );
}
