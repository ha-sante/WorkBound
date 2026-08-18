import { useState, useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown } from "lucide-react";
import { accountContactsAtom, composeMetaAtom } from "../../../state";
import { find_contact_by_email } from "../../../utils/contacts";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../../../rpc";

type Props = {
  triggerLocalSave: () => void;
};

function ComposeFromField({ triggerLocalSave }: Props) {
  const accountContacts = useAtomValue(accountContactsAtom);
  const setAccountContacts = useSetAtom(accountContactsAtom);
  const composeState = useAtomValue(composeMetaAtom);
  const setComposeState = useSetAtom(composeMetaAtom);
  const from_address = composeState.from_address;
  const is_domain_match = composeState.is_domain_match;
  const current = find_contact_by_email(accountContacts, from_address);
  const from_name = current?.display_name ?? "";
  const [showFromDropdown, setShowFromDropdown] = useState(false);

  useEffect(() => {
    if (accountContacts.length > 1) return;
    rpc.request(messages.send_as_list, { account_id: accountContacts[0]?.account_id }).then((aliases: any) => {
      const list = aliases as SendAsAliasWire[];
      if (list.length > 1) setAccountContacts(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showFromDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const dropdown = document.getElementById("from-dropdown");
      const trigger = document.getElementById("from-dropdown-trigger");
      if (dropdown && !dropdown.contains(target) && trigger && !trigger.contains(target)) {
        setShowFromDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFromDropdown]);

  const handleSelect = useCallback((address: string, name: string) => {
    setComposeState(prev => ({ ...prev, from_address: address, from_name: name, is_domain_match: false }));
    triggerLocalSave();
    setShowFromDropdown(false);
  }, [triggerLocalSave]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-text-secondary w-10 shrink-0">From</span>
      <div className="relative flex-1">
        <button
          id="from-dropdown-trigger"
          onClick={() => setShowFromDropdown((p) => !p)}
          className="w-full flex items-center justify-between text-sm text-text-primary bg-transparent border-b border-slate-100 pb-1 hover:border-accent transition-colors cursor-pointer">
          <span className="truncate">{from_name ? `${from_name} <${from_address}>` : from_address}</span>
          <span className="flex items-center gap-0.5 shrink-0">
            {is_domain_match && (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">&#8592; Auto-set by domain match</span>
            )}
            <ChevronDown size={14} className="text-text-secondary" />
          </span>
        </button>
        {showFromDropdown && (
          <div id="from-dropdown" className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
            {accountContacts.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-secondary">No aliases found</div>
            ) : (
              accountContacts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleSelect(a.send_as_email, a.display_name ?? "")}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors cursor-pointer ${a.send_as_email === from_address ? "bg-blue-50 font-medium" : ""}`}
                >
                  <span className="truncate">{a.display_name ? `${a.display_name} <${a.send_as_email}>` : a.send_as_email}</span>
                  {a.is_primary && <span className="shrink-0 text-[10px] text-text-secondary ml-auto">Primary</span>}
                  {a.is_default && !a.is_primary && <span className="shrink-0 text-[10px] text-text-secondary ml-auto">Default</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ComposeFromField;
