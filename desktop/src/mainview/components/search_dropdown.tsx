const DEBUG = false;

import { useRef, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom, useAtomValue } from "jotai";
import { searchQueryAtom, searchResultsAtom, searchDropdownOpenAtom, currentAccountIdAtom, folderAtom, search_close_request_atom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { format_time } from "@/shared/datetime";
import { rpc } from "../rpc";

type Props = {
  onSelectEmail?: (email: EmailPreviewWire) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  highlightIdx: number;
  setHighlightIdx: (idx: number) => void;
};

const FIELD_LABELS: Record<string, string> = {
  from: "From",
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
  subject: "Subject",
  body: "Body",
};

function highlight_text(text: string | null, query: string): { __html: string } | null {
  if (!text || !query.trim()) return null;

  const tokens: string[] = [];
  const re = /(\w+):("[^"]*"|\S+)|(\S+)/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    if (m[2]) tokens.push(m[2].replace(/^"|"$/g, ""));
    else if (m[3]) tokens.push(m[3]);
  }
  const filtered = tokens.filter((t) => t.trim().length > 0);
  if (filtered.length === 0) return null;

  const pattern = filtered.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(RegExp(pattern, "gi"), "<mark>$&</mark>");

  return { __html: html };
}

function SearchDropdown({ onSelectEmail, inputRef, highlightIdx, setHighlightIdx }: Props) {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom);
  const [searchResults, setSearchResults] = useAtom(searchResultsAtom);
  const [dropdownOpen, setDropdownOpen] = useAtom(searchDropdownOpenAtom);
  const [account_id] = useAtom(currentAccountIdAtom);
  const [folder] = useAtom(folderAtom);
  const [view, setView] = useState<"results" | "advanced">("results");
  const [wordsVal, setWordsVal] = useState("");
  const [fromVal, setFromVal] = useState("");
  const [toVal, setToVal] = useState("");
  const [subjectVal, setSubjectVal] = useState("");
  const [has_attachments, setHasAttachments] = useState(false);
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const fromInputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  const search_close_request = useAtomValue(search_close_request_atom);
  useEffect(() => {
    if (search_close_request > 0) setView("results");
  }, [search_close_request]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setDropdownOpen(true);
    setHighlightIdx(-1);
    seqRef.current++;
    const seq = seqRef.current;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const q = searchQuery.trim();
      DEBUG && console.log(`[dropdown] sending search seq=${seq} query="${q}"`);
      rpc.request(messages.mail_search_local, { query: q, limit: 5, account_id: account_id ?? undefined, folder })
        .then((data: unknown) => {
          const arr = data as EmailPreviewWire[];
          const alive = seq === seqRef.current;
          DEBUG && console.log(`[dropdown] search response seq=${seq} alive=${alive} count=${arr.length}`);
          if (alive) setSearchResults(arr);
        })
        .catch((err: Error) => {
          DEBUG && console.log(`[dropdown] search error seq=${seq}`, err);
          if (seq === seqRef.current) setSearchResults([]);
        });
    }, 150);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, setSearchResults, setDropdownOpen, setHighlightIdx]);

  useEffect(() => {
    function handle_click_outside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setView("results");
      }
    }
    document.addEventListener("mousedown", handle_click_outside);
    return () => document.removeEventListener("mousedown", handle_click_outside);
  }, [setDropdownOpen, inputRef]);

  useEffect(() => {
    if (view === "advanced") {
      fromInputRef.current?.focus();
    }
  }, [view]);

  const handleApply = () => {
    const parts: string[] = [];
    if (wordsVal.trim()) parts.push(wordsVal.trim());
    if (fromVal.trim()) parts.push(`from:"${fromVal.trim()}"`);
    if (toVal.trim()) parts.push(`to:"${toVal.trim()}"`);
    if (subjectVal.trim()) parts.push(`subject:"${subjectVal.trim()}"`);
    if (has_attachments) parts.push("has:attachments");
    if (beforeDate) parts.push(`before:${beforeDate}`);
    if (afterDate) parts.push(`after:${afterDate}`);
    setSearchQuery(parts.join(" ").replace(/[\u201C\u201D]/g, '"'));
    setView("results");
  };

  const handleCancel = () => {
    setView("results");
  };

  const handleOpenAdvanced = () => {
    let words = "";
    let from = "";
    let to = "";
    let subject = "";
    let has_attachments = false;
    let before = "";
    let after = "";
    const re = /(\w+):("[^"]*"|\S+)|(\S+)/g;
    let m;
    const query = searchQuery.replace(/[\u201C\u201D]/g, '"');
    while ((m = re.exec(query)) !== null) {
      if (m[1] && m[2]) {
        const field = m[1].toLowerCase();
        const value = m[2].replace(/^"|"$/g, "");
        if (field === "from") from = value;
        else if (field === "to") to = value;
        else if (field === "subject") subject = value;
        else if (field === "has" && (value === "attachments" || value === "attachment")) has_attachments = true;
        else if (field === "before") before = value;
        else if (field === "after") after = value;
        else words += (words ? " " : "") + `${field}:${m[2]}`;
      } else if (m[3]) {
        words += (words ? " " : "") + m[3];
      }
    }
    setWordsVal(words);
    setFromVal(from);
    setToVal(to);
    setSubjectVal(subject);
    setHasAttachments(has_attachments);
    setBeforeDate(before);
    setAfterDate(after);
    setView("advanced");
  };

  return (
    <AnimatePresence>
      {dropdownOpen && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="absolute top-full left-0 right-0 border-x border-b border-border-subtle bg-white shadow-lg z-50 overflow-y-auto">
          {view === "advanced" ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-text-tertiary font-medium block mb-1">Has the words</label>
                <input
                  type="text"
                  value={wordsVal}
                  onChange={(e) => setWordsVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                  placeholder="search terms across all fields"
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary font-medium block mb-1">From</label>
                <input
                  ref={fromInputRef}
                  type="text"
                  value={fromVal}
                  onChange={(e) => setFromVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                  placeholder="sender@example.com"
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary font-medium block mb-1">To</label>
                <input
                  type="text"
                  value={toVal}
                  onChange={(e) => setToVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                  placeholder="recipient@example.com"
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary font-medium block mb-1">Subject</label>
                <input
                  type="text"
                  value={subjectVal}
                  onChange={(e) => setSubjectVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                  placeholder="meeting notes"
                  className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary font-medium block mb-1">After</label>
                  <input
                    type="date"
                    value={afterDate}
                    onChange={(e) => setAfterDate(e.target.value)}
                    className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary font-medium block mb-1">Before</label>
                  <input
                    type="date"
                    value={beforeDate}
                    onChange={(e) => setBeforeDate(e.target.value)}
                    className="w-full text-sm px-2 py-1.5 border border-border-subtle rounded outline-none focus:border-gray-400"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={has_attachments}
                  onChange={(e) => setHasAttachments(e.target.checked)}
                  className="rounded border-border-subtle"
                />
                Has attachment
              </label>
              <div className="flex items-center justify-start gap-2 pt-1">
                <button
                  onClick={handleApply}
                  className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 font-medium transition-colors cursor-pointer">
                  Apply
                </button>
                <button
                  onClick={handleCancel}
                  className="text-xs px-3 py-1 rounded border border-border-subtle text-text-secondary hover:bg-black/[0.04] transition-colors cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              {(() => {
                const hasQuery = searchQuery.trim().length > 0;
                const isDeterministic = hasQuery && /\b(from|to|cc|bcc|subject|has|before|after|label):/i.test(searchQuery.trim());
                return (
                  <>
                    {hasQuery && searchResults.length > 0 && (
                      <>
                        {searchResults.map((email, idx) => isDeterministic ? (
                          <DeterministicCard
                            key={email.id}
                            email={email}
                            idx={idx}
                            highlightIdx={highlightIdx}
                            searchQuery={searchQuery}
                            onSelect={() => { onSelectEmail?.(email); setDropdownOpen(false); }}
                          />
                        ) : (
                          <FreeFormCard
                            key={email.id}
                            email={email}
                            idx={idx}
                            highlightIdx={highlightIdx}
                            searchQuery={searchQuery}
                            onSelect={() => { onSelectEmail?.(email); setDropdownOpen(false); }}
                          />
                        ))}
                      </>
                    )}

                    {hasQuery && searchResults.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                        No results found
                      </div>
                    )}

                    <div className={`flex items-center justify-between px-3 py-1.5 ${hasQuery ? "border-t" : ""} border-border-subtle`}>
                      <button
                        onClick={handleOpenAdvanced}
                        className="text-[11px] text-text-secondary hover:text-text-primary bg-accent-subtle hover:bg-gray-200 transition-colors cursor-pointer px-2 py-0.5 rounded font-medium">
                        Advanced search →
                      </button>
                      <span className="text-[11px] text-text-tertiary">
                        {folder.charAt(0).toUpperCase() + folder.slice(1)} Results
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function field_value(email: EmailPreviewWire, field: string): string {
  switch (field) {
    case "from": {
      const n = email.from_name;
      const a = email.from_address;
      if (n && a) return `${n} - ${a}`;
      return n || a || "";
    }
    case "to": return email.toAddr || "";
    case "cc": return email.cc || "";
    case "bcc": return email.bcc || "";
    case "subject": return email.subject || "";
    case "body": return email.snippet_hl || email.snippet || "";
    default: return "";
  }
}

type DeterministicCardProps = {
  email: EmailPreviewWire;
  idx: number;
  highlightIdx: number;
  searchQuery: string;
  onSelect: () => void;
};
const DeterministicCard = ({ email, idx, highlightIdx, searchQuery, onSelect }: DeterministicCardProps) => {
  const fields = email.matchedFields ?? [];
  const fromHl = highlight_text(email.from_name, searchQuery);
  const subHl = highlight_text(email.subject, searchQuery);
  const snippetSrc = email.snippet_hl || email.snippet;
  const snipHl = highlight_text(snippetSrc, searchQuery);

  return (
    <button
      className={`w-full text-left px-3 py-2 cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors ${
        idx === highlightIdx ? "bg-accent-subtle" : "hover:bg-accent-subtle"
      }`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-primary truncate font-medium [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
          {fromHl ? <span dangerouslySetInnerHTML={fromHl} /> : (email.from_name || email.from_address || "Unknown")}
        </span>
        <span className="text-[11px] text-text-tertiary shrink-0 whitespace-nowrap">
          {format_time(email.sent_at || email.received_at)}
        </span>
      </div>
      {fields.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {fields.map((f) => {
            const val = field_value(email, f);
            const hl = val && highlight_text(val, searchQuery);
            return (
              <div key={f} className="flex items-start gap-1.5 text-xs leading-tight">
                <span className="shrink-0 text-[10px] font-semibold text-accent bg-accent/10 rounded px-1 py-[1px]">{FIELD_LABELS[f] || f}</span>
                <span className="truncate text-text-primary [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
                  {hl ? <span dangerouslySetInnerHTML={hl} /> : (val || <span className="italic text-text-tertiary">matched</span>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-xs text-text-secondary truncate mt-0.5 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
        {subHl ? <span dangerouslySetInnerHTML={subHl} /> : (email.subject || "(no subject)")}
      </div>
      {snippetSrc && (
        <div className="text-[11px] text-text-tertiary truncate mt-0.5 line-clamp-1 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
          {snipHl ? <span dangerouslySetInnerHTML={snipHl} /> : snippetSrc}
        </div>
      )}
    </button>
  );
}

type FreeFormCardProps = {
  email: EmailPreviewWire;
  idx: number;
  highlightIdx: number;
  searchQuery: string;
  onSelect: () => void;
};
function FreeFormCard({ email, idx, highlightIdx, searchQuery, onSelect }: FreeFormCardProps) {
  const fromHl = highlight_text(email.from_name, searchQuery);
  const subHl = highlight_text(email.subject, searchQuery);
  const snippetSrc = email.snippet_hl || email.snippet;
  const snipHl = highlight_text(snippetSrc, searchQuery);

  return (
    <button
      className={`w-full text-left px-3 py-2 cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors ${
        idx === highlightIdx ? "bg-accent-subtle" : "hover:bg-accent-subtle"
      }`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-text-primary truncate font-medium [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
            {fromHl ? <span dangerouslySetInnerHTML={fromHl} /> : (email.from_name || email.from_address || "Unknown")}
          </span>
          {email.from_address && email.from_name && (
            <span className="text-[11px] text-text-tertiary truncate hidden sm:inline max-w-[120px]">
              {email.from_address}
            </span>
          )}
        </div>
        <span className="text-[11px] text-text-tertiary shrink-0 whitespace-nowrap">
          {format_time(email.sent_at || email.received_at)}
        </span>
      </div>
      <div className="text-xs text-text-secondary truncate mt-0.5 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
        {subHl ? <span dangerouslySetInnerHTML={subHl} /> : (email.subject || "(no subject)")}
      </div>
      {snippetSrc && (
        <div className="text-[11px] text-text-tertiary truncate mt-0.5 line-clamp-1 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
          {snipHl ? <span dangerouslySetInnerHTML={snipHl} /> : snippetSrc}
        </div>
      )}
    </button>
  );
}


export default SearchDropdown;
