import { useRef, useEffect, useCallback } from "react";
import { Search, FileText, Mail } from "lucide-react";
import { useAtom } from "jotai";
import { searchQueryAtom, searchResultsAtom, searchActiveAtom, currentAccountIdAtom, folderAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { format_time } from "@/shared/datetime";
import { rpc } from "../rpc";

type Props = {
  onSelectEmail?: (email: EmailPreviewWire) => void;
};

const FIELD_LABELS: Record<string, string> = {
  from: "From",
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
  subject: "Subject",
  body: "Body",
};

function MatchedFieldBadges({ fields }: { fields: string[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {fields.map((f) => (
        <span
          key={f}
          className="text-[10px] leading-none px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-medium"
        >
          {FIELD_LABELS[f] || f}
        </span>
      ))}
    </span>
  );
}

function highlight_text(text: string | null, query: string): { __html: string } | null {
  if (!text || !query.trim()) return null;

  const tokens: string[] = [];
  const re = /(\w+):("[^"]*"|\S+)|(\S+)/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    if (m[2]) tokens.push(m[2].replace(/^"|"$/g, ""));
    else if (m[3]) tokens.push(m[3]);
  }
  if (tokens.length === 0) return null;

  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(RegExp(pattern, "gi"), "<mark>$&</mark>");

  return { __html: html };
}

function SearchPage({ onSelectEmail }: Props) {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom);
  const [searchResults, setSearchResults] = useAtom(searchResultsAtom);
  const [, setSearchActive] = useAtom(searchActiveAtom);
  const [account_id] = useAtom(currentAccountIdAtom);
  const [folder] = useAtom(folderAtom);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      rpc.request(messages.mail_search_local, { query: searchQuery.trim(), limit: 100, account_id: account_id ?? undefined, folder })
        .then((data: unknown) => setSearchResults(data as EmailPreviewWire[]))
        .catch(() => setSearchResults([]));
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, setSearchResults]);

  const handleClose = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [setSearchActive, setSearchQuery, setSearchResults]);

  const renderResult = (email: EmailPreviewWire) => {
    const subHl = highlight_text(email.subject, searchQuery);
    const fromHl = highlight_text(email.from_name, searchQuery);
    const snippetSrc = email.snippet_hl || email.snippet;
    const snipHl = highlight_text(snippetSrc, searchQuery);

    return (
      <button
        key={email.id}
        className="w-full text-left px-5 py-3 flex items-start gap-3 border-b border-border-subtle hover:bg-accent-subtle transition-colors cursor-pointer group"
        onClick={() => {
          onSelectEmail?.(email);
          handleClose();
        }}
      >
        <div className="w-9 h-9 rounded-full bg-accent-subtle flex items-center justify-center shrink-0 mt-0.5">
          <Mail size={14} className="text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-sm truncate ${email.is_read ? "font-normal" : "font-semibold"} text-text-primary [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5`}>
                {fromHl ? <span dangerouslySetInnerHTML={fromHl} /> : (email.from_name || email.from_address || "Unknown")}
              </span>
              {email.from_address && email.from_name && (
                <span className="text-xs text-text-tertiary truncate hidden sm:inline">&lt;{email.from_address}&gt;</span>
              )}
              <MatchedFieldBadges fields={email.matchedFields ?? []} />
            </div>
            <span className="text-xs text-text-tertiary shrink-0 whitespace-nowrap">
              {format_time(email.sent_at || email.received_at)}
            </span>
          </div>
          <div className="text-sm text-text-primary truncate mt-0.5 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
            {subHl ? <span dangerouslySetInnerHTML={subHl} /> : (email.subject || "(no subject)")}
          </div>
          <div className="text-xs text-text-secondary truncate mt-0.5 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm [&_mark]:px-0.5">
            {snipHl ? <span dangerouslySetInnerHTML={snipHl} /> : (snippetSrc || "")}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {!searchQuery.trim() && (
        <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
          <Search size={32} strokeWidth={1.5} />
          <span className="text-sm">Type a query to search your mail</span>
        </div>
      )}

      {searchQuery.trim() && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
          <FileText size={32} strokeWidth={1.5} />
          <span className="text-sm">No results for "{searchQuery}"</span>
        </div>
      )}

      {searchResults.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </div>
          {searchResults.map(renderResult)}
        </div>
      )}
    </div>
  );
}

export default SearchPage;
