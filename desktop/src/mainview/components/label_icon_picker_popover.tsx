import { useMemo } from "react";
import { ExternalLink, X, icons as lucide_icons } from "lucide-react";

const lucide_icon_names = Object.keys(lucide_icons);

export function LabelIconPickerPopover({
  open,
  icon_search,
  on_icon_search_change,
  on_icon_pick,
  on_open_change,
}: {
  open: boolean;
  icon_search: string;
  on_icon_search_change: (v: string) => void;
  on_icon_pick: (icon_name: string | null) => void;
  on_open_change: (next: boolean) => void;
}) {
  const filtered_icon_names = useMemo(() => {
    const q = icon_search.trim().toLowerCase();
    if (!q) return lucide_icon_names;
    return lucide_icon_names.filter((n) => n.toLowerCase().includes(q));
  }, [icon_search]);

  if (!open) return null;

  return (
    <div className="absolute z-[120] top-12 left-0 w-[520px] max-w-[90vw] rounded-lg border border-border-subtle bg-white shadow-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={icon_search}
          onChange={(e) => on_icon_search_change(e.target.value)}
          placeholder="Search lucide icons..."
          className="flex-1 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <a
          href="https://lucide.dev/icons/"
          target="_blank"
          rel="noreferrer"
          className="px-2 py-1.5 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer flex items-center gap-1 text-text-secondary shrink-0"
        >
          <ExternalLink size={14} />
          Browse
        </a>
        <button
          type="button"
          onClick={() => on_open_change(false)}
          className="p-1.5 rounded hover:bg-black/[0.04] cursor-pointer shrink-0"
          aria-label="Close"
        >
          <X size={16} className="text-text-secondary" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            on_icon_pick(null);
            on_open_change(false);
            on_icon_search_change("");
          }}
          className="px-2 py-1.5 text-xs rounded border cursor-pointer shrink-0 border-border-subtle hover:bg-black/[0.04]"
        >
          None
        </button>
        <div className="text-xs text-text-secondary">
          {filtered_icon_names.length} icons
        </div>
      </div>

      <div className="grid grid-cols-10 gap-2 max-h-[260px] overflow-auto pr-1">
        {filtered_icon_names.map((name) => {
          const IconComp = (lucide_icons as Record<string, any>)[name];
          return (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                on_icon_pick(name);
                on_open_change(false);
                on_icon_search_change("");
              }}
              className="p-1 rounded hover:bg-black/[0.04] cursor-pointer flex items-center justify-center"
              title={name}
            >
              <IconComp size={18} className="text-text-secondary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
