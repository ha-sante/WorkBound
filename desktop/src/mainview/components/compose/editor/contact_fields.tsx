import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { composeMetaAtom, currentAccountIdAtom } from "../../../state";
import { ContactInput, parse_email_string } from "./contact_input";
import { useContactAutocomplete } from "../hooks/use_contact_autocomplete";

type Props = {
  triggerLocalSave: () => void;
};

function ComposeContactFields({ triggerLocalSave }: Props) {
  const setComposeState = useSetAtom(composeMetaAtom);
  const composeState = useAtomValue(composeMetaAtom);
  const account_id = useAtomValue(currentAccountIdAtom);

  const { toContacts, ccContacts, bccContacts, toInput, ccInput, bccInput, showCc, showBcc, mode, email, fullEmail } = composeState;

  const toRef = useRef<HTMLInputElement>(null);
  const ccRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);

  const { autocomplete, autocompleteRef, handleAutocompleteInput,
    selectAutocomplete, handleAutocompleteKeyDown, onAutocompleteHover } =
    useContactAutocomplete(account_id ?? "", (field, contact) => {
      const entry: ContactEntry = { id: crypto.randomUUID(), email: contact.email, name: contact.name };
      setComposeState(prev => ({
        ...prev,
        ...(field === "to" ? { toContacts: [...prev.toContacts, entry], toInput: "" } : {}),
        ...(field === "cc" ? { ccContacts: [...prev.ccContacts, entry], ccInput: "" } : {}),
        ...(field === "bcc" ? { bccContacts: [...prev.bccContacts, entry], bccInput: "" } : {}),
      }));
      triggerLocalSave();
    });

  const reply_toPopulated = useRef(false);

  useEffect(() => {
    if (reply_toPopulated.current) return;
    if ((mode !== "reply" && mode !== "reply_all") || !email) return;
    const rawAddr = (fullEmail?.reply_to_address ?? email.from_address ?? "");
    const parsed = rawAddr ? parse_email_string(rawAddr) : [];
    const cleanEmail = parsed.length > 0 ? parsed[0].email : rawAddr;
    const initialTo = email.from_name ? `${email.from_name} <${cleanEmail}>` : cleanEmail;
    const result = parse_email_string(initialTo);
    setComposeState(prev => {
      const next: Partial<ComposeMeta> = {};
      if (result.length > 0) next.toContacts = result;
      if (mode === "reply_all") {
        const rawCc = fullEmail?.cc ?? email.cc;
        const ccResult = rawCc ? parse_email_string(rawCc) : [];
        if (ccResult.length > 0) {
          next.ccContacts = ccResult;
          next.showCc = true;
        }
      }
      return { ...prev, ...next };
    });
    reply_toPopulated.current = true;
  }, [mode, email, fullEmail]);

  const handleContactsChange = useCallback((field: "to" | "cc" | "bcc", contacts: ContactEntry[]) => {
    setComposeState(prev => ({
      ...prev,
      ...(field === "to" ? { toContacts: contacts } : {}),
      ...(field === "cc" ? { ccContacts: contacts } : {}),
      ...(field === "bcc" ? { bccContacts: contacts } : {}),
    }));
    triggerLocalSave();
  }, [triggerLocalSave]);

  const handleInputChange = useCallback((field: "to" | "cc" | "bcc", value: string) => {
    setComposeState(prev => ({
      ...prev,
      ...(field === "to" ? { toInput: value } : {}),
      ...(field === "cc" ? { ccInput: value } : {}),
      ...(field === "bcc" ? { bccInput: value } : {}),
    }));
    triggerLocalSave();
  }, [triggerLocalSave]);

  const handleInputChangeWithAutocomplete = useCallback((field: "to" | "cc" | "bcc", value: string) => {
    handleInputChange(field, value);
    handleAutocompleteInput(field, value);
  }, [handleInputChange, handleAutocompleteInput]);

  const refocusField = useCallback((field: "to" | "cc" | "bcc") => {
    if (field === "to") toRef.current?.focus();
    else if (field === "cc") ccRef.current?.focus();
    else bccRef.current?.focus();
  }, []);

  const fields = [
    { label: "To", field: "to" as const, contacts: toContacts, input: toInput, placeholder: "Recipients", show: true, ref: toRef },
    { label: "CC", field: "cc" as const, contacts: ccContacts, input: ccInput, placeholder: "CC", show: showCc, ref: ccRef },
    { label: "BCC", field: "bcc" as const, contacts: bccContacts, input: bccInput, placeholder: "BCC", show: showBcc, ref: bccRef },
  ];

  return (
    <>
      {fields.map((cfg) => cfg.show ? (
        <div key={cfg.label} className="flex items-center gap-3">
          <span className="text-xs font-medium text-text-secondary w-10 shrink-0">{cfg.label}</span>
          <ContactInput
            className="flex-1"
            contacts={cfg.contacts}
            onContactsChange={(c) => handleContactsChange(cfg.field, c)}
            inputValue={cfg.input}
            onInputChange={(v) => handleInputChangeWithAutocomplete(cfg.field, v)}
            onKeyDown={(e) => {
              handleAutocompleteKeyDown(cfg.field, e);
              if (e.key === "Enter") refocusField(cfg.field);
            }}
            inputRef={cfg.ref}
            autocompleteRef={autocompleteRef as React.RefObject<HTMLDivElement>}
            autocomplete={autocomplete?.field === cfg.field ? {
              results: autocomplete.results,
              index: autocomplete.index,
              onSelect: (contact) => {
                selectAutocomplete(contact);
                refocusField(cfg.field);
              },
              onHover: onAutocompleteHover,
            } : undefined}
            placeholder={cfg.placeholder}
          />
        </div>
      ) : null)}
    </>
  );
}

export default ComposeContactFields;
