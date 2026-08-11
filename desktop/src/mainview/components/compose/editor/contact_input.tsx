import { useState, forwardRef, type KeyboardEvent } from "react";
import { useCopyToast } from "../../../hooks/use_copy_toast";
import Image from "../../ui/image";

export type AutocompleteConfig = {
  results: ContactWire[];
  index: number;
  onSelect: (contact: ContactWire) => void;
  onHover: (i: number) => void;
};

type Props = {
  contacts: ContactEntry[];
  onContactsChange: (contacts: ContactEntry[]) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  autocompleteRef: React.RefObject<HTMLDivElement>;
  autocomplete?: AutocompleteConfig;
  placeholder?: string;
  className?: string;
};

function AvatarImg({ url, name, email }: { url: string | null; name: string | null; email: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <Image
        src={url}
        className="w-4 h-4 rounded-full shrink-0"
        onError={() => setFailed(true)}
        alt=""
      />
    );
  }
  return (
    <span className="w-4 h-4 rounded-full bg-accent/20 text-[10px] flex items-center justify-center text-accent font-medium shrink-0">
      {(name?.[0] || email[0]).toUpperCase()}
    </span>
  );
}

const AutocompleteDropdown = forwardRef<HTMLDivElement, {
  results: ContactWire[];
  index: number;
  onSelect: (c: ContactWire) => void;
  onHover: (i: number) => void;
}>(({ results, index, onSelect, onHover }, ref) => {
  if (results.length === 0) return null;
  return (
    <div
      ref={ref}
      className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
    >
      {results.map((c, i) => (
        <button
          key={c.id}
          className={`w-full text-left px-2 py-1 text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${i === index ? "bg-slate-100" : "hover:bg-slate-50"}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
          onMouseEnter={() => onHover(i)}>
          <AvatarImg url={c.avatar_url} name={c.name} email={c.email} />
          <span className="text-text-primary">{c.name || c.email}</span>
          {c.name && <span className="text-text-secondary ml-1 text-[11px]">{c.email}</span>}
        </button>
      ))}
    </div>
  );
});

function parse_single_contact(token: string): ContactEntry | null {
  const t = token.trim();
  if (!t) return null;
  const quoted = t.match(/^"([^"]+)"\s*<([^>]+)>$/);
  if (quoted) return { id: crypto.randomUUID(), email: quoted[2], name: quoted[1] };
  const bare = t.match(/^([^<]+)\s*<([^>]+)>$/);
  if (bare) return { id: crypto.randomUUID(), email: bare[2], name: bare[1].trim() };
  const angled = t.match(/^<([^>]+)>$/);
  if (angled) return { id: crypto.randomUUID(), email: angled[1], name: null };
  if (t.includes("@")) {
    const cleaned = t.replace(/[<>]/g, "").split(/[;,]\s*/)[0].trim();
    if (cleaned.includes("@")) return { id: crypto.randomUUID(), email: cleaned, name: null };
  }
  return null;
}

export function parse_email_string(str: string): ContactEntry[] {
  return str.split(",").map(parse_single_contact).filter((c): c is ContactEntry => c !== null);
}

export function ContactInput({
  contacts,
  onContactsChange,
  inputValue,
  onInputChange,
  onKeyDown,
  inputRef,
  autocompleteRef,
  autocomplete,
  placeholder,
  className,
}: Props) {
  const { copy } = useCopyToast();

  const handle_key_down = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && inputValue === "" && contacts.length > 0) {
      e.preventDefault();
      onContactsChange(contacts.slice(0, -1));
      return;
    }
    if (e.key === " " || e.key === "Space" || e.key === ",") {
      const entry = parse_single_contact(inputValue);
      if (entry) {
        e.preventDefault();
        onContactsChange([...contacts, entry]);
        onInputChange("");
        return;
      }
    }
    onKeyDown(e);
  };

  return (
    <div className={`relative ${className || ""}`.trim()}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 pb-1 focus-within:border-accent transition-colors">
        {contacts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => copy(c.email)}
            className="inline-flex items-center gap-0.5 text-sm text-text-primary max-w-[200px] cursor-pointer hover:text-accent transition-colors">
            <span className="truncate">{c.name || c.email}</span>
            <span
              onClick={(e) => { e.stopPropagation(); onContactsChange(contacts.filter((x) => x.id !== c.id)); }}
              className="text-text-secondary hover:text-red-500 transition-colors cursor-pointer text-sm leading-none px-0.5"
              role="button"
              tabIndex={0}
              aria-label={`Remove ${c.name || c.email}`}>
              ×
            </span>
          </button>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handle_key_down}
          placeholder={contacts.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[60px] outline-none bg-transparent text-sm text-text-primary"
        />
      </div>
      {autocomplete && (
        <AutocompleteDropdown
          ref={autocompleteRef}
          results={autocomplete.results}
          index={autocomplete.index}
          onSelect={autocomplete.onSelect}
          onHover={autocomplete.onHover}
        />
)}
    </div>
  );
}
