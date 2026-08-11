import { useState, useCallback, useEffect, useRef } from "react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../../rpc";
export function useContactAutocomplete(account_id: string, onSelectContact: (field: "to" | "cc" | "bcc", contact: ContactWire) => void) {
  const [autocomplete, setAutocomplete] = useState<ContactAutocompleteState | null>(null);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autocomplete) return;
    const handler = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setAutocomplete(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [autocomplete]);

  useEffect(() => {
    return () => {
      if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    };
  }, []);

  const handleAutocompleteInput = useCallback((field: "to" | "cc" | "bcc", value: string) => {
    const q = value.trim();
    if (!q || q.length < 1) {
      setAutocomplete(null);
      return;
    }
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(async () => {
      try {
        const results = await rpc.request(messages.contacts_search, { account_id, q, limit: 10 });
        setAutocomplete({ field, query: q, results, index: 0 });
      } catch {
        setAutocomplete(null);
      }
    }, 200);
  }, [account_id]);

  const selectAutocomplete = useCallback((contact: ContactWire) => {
    if (!autocomplete) return;
    onSelectContact(autocomplete.field, contact);
    setAutocomplete(null);
  }, [autocomplete, onSelectContact]);

  const handleAutocompleteKeyDown = useCallback((field: "to" | "cc" | "bcc", e: React.KeyboardEvent) => {
    if (!autocomplete || autocomplete.field !== field) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAutocomplete((p) => p ? { ...p, index: Math.min(p.index + 1, p.results.length - 1) } : null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAutocomplete((p) => p ? { ...p, index: Math.max(p.index - 1, 0) } : null);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const contact = autocomplete.results[autocomplete.index];
      if (contact) {
        e.preventDefault();
        onSelectContact(autocomplete.field, contact);
        setAutocomplete(null);
      }
    } else if (e.key === "Escape") {
      setAutocomplete(null);
    }
  }, [autocomplete, onSelectContact]);

  const onAutocompleteHover = useCallback((i: number) => {
    setAutocomplete((p) => p ? { ...p, index: i } : null);
  }, []);

  return {
    autocomplete,
    autocompleteRef,
    handleAutocompleteInput,
    selectAutocomplete,
    handleAutocompleteKeyDown,
    onAutocompleteHover,
  };
}
