import { useEffect, useRef, useState } from "react";
import { Search, Send, RotateCw, ListFilter, X } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { searchQueryAtom, searchDropdownOpenAtom, filter_bar_open_atom, filter_clauses_atom, search_focus_request_atom, search_close_request_atom } from "../state";
import SearchDropdown from "./search_dropdown";
import { FilterControlBar } from "./filters/filter_control_bar";

type Props = {
  folder: string;
  active_view: FilteredViewWire | null;
  onCompose: () => void;
  onRefresh: () => void;
  isNewfillSyncing: boolean;
  onSelectEmail?: (email: EmailPreviewWire) => void;
};

const folderLabels: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  scheduled: "Scheduled",
  reminders: "Reminders",
  spam: "Spam",
  bin: "Bin",
  __all__: "All Mail",
};

function TopBar({ folder, active_view, onCompose, onRefresh, isNewfillSyncing, onSelectEmail }: Props) {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom);
  const [dropdownOpen, setDropdownOpen] = useAtom(searchDropdownOpenAtom);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const search_focus_request = useAtomValue(search_focus_request_atom);
  const search_disabled = active_view != null || folder === "scheduled" || folder === "reminders";

  useEffect(() => {
    if (search_focus_request > 0) inputRef.current?.focus();
  }, [search_focus_request]);

  const search_close_request = useAtomValue(search_close_request_atom);
  useEffect(() => {
    if (search_close_request > 0) {
      setSearchQuery("");
      setDropdownOpen(false);
      setHighlightIdx(-1);
      if (searchWrapperRef.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
  }, [search_close_request, setSearchQuery, setDropdownOpen]);

  const [filters_open, setFiltersOpen] = useAtom(filter_bar_open_atom);
  const [filter_clauses, set_filter_clauses] = useAtom(filter_clauses_atom);

  function handle_key_down(e: React.KeyboardEvent) {
    if (!dropdownOpen || !searchQuery.trim()) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((prev) => prev + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        setDropdownOpen(false);
        break;
      case "Escape":
        setDropdownOpen(false);
        break;
    }
  }

  return (
    <div className="flex flex-col shrink-0 relative">
      <div className="flex items-center px-5 border-b border-border-subtle shrink-0 relative h-[49px]">
        <div className="w-3/12">
          <h1 className="text-base font-semibold text-text-primary">
            {active_view ? active_view.name : folderLabels[folder] || folder}
          </h1>
        </div>

{search_disabled ? (
          <div className="search-wrapper flex-1 mx-auto py-2" />
        ) : (
          <div ref={searchWrapperRef} className="search-wrapper flex-1 mx-auto py-2 relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={handle_key_down}
              placeholder="Search mail..."
              className="w-full py-1.5 text-sm text-text-secondary search_input_box rounded-none outline-none focus:ring-0 transition-colors placeholder:text-text-tertiary"
            />
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />

            <SearchDropdown
              onSelectEmail={onSelectEmail}
              inputRef={inputRef}
              highlightIdx={highlightIdx}
              setHighlightIdx={setHighlightIdx}
            />
          </div>
        )}

        <div className="w-4/12 flex items-center gap-2 justify-end">
          {!active_view && (
            <button
              data-filter-toggle="1"
              onClick={() => {
                setDropdownOpen(false);
                setFiltersOpen((v) => !v);
              }}
              className="p-1.5 rounded-md hover:bg-black/[0.04] transition-colors cursor-pointer"
              title="Filters">
              {filters_open ? <X size={16} className="text-text-secondary" /> : <ListFilter size={16} className="text-text-secondary" />}
            </button>
          )}

          <button
            onClick={onCompose}
            className="p-1.5 rounded-md hover:bg-black/[0.04] transition-colors cursor-pointer"
            title="New Message">
            <Send size={16} className="text-text-secondary" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isNewfillSyncing}
            className="p-1.5 rounded-md hover:bg-black/[0.04] transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh">
            <RotateCw
              size={16}
              className={`text-text-secondary ${isNewfillSyncing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {!active_view && filters_open && (
        <div
          className="px-5 py-2 bg-white border-b border-border-subtle">
          <FilterControlBar
            selectable_folder={false}
            folder={folder}
            on_folder_change={() => { }}
            clauses={filter_clauses}
            on_clauses_change={set_filter_clauses}
            disabled={false}
          />
        </div>
      )}
    </div>
  );
}

export default TopBar;
