import { useEffect, useMemo } from "react";
import { useSetAtom } from "jotai";
import { rpc } from "../rpc";
import {
  accountContactsAtom,
  signature_templatesAtom,
  signatureAssignmentsAtom,
  email_templatesAtom,
  prefsAtom,
  labelsAtom,
  contactsAtom,
  notesAtom,
  notes_loaded_atom,
  contacts_loaded_atom,
  labels_loaded_atom,
  templates_loaded_atom,
  filtered_views_atom_for,
  filtered_views_enabled_atom,
} from "../state";
import { messages } from "@/shared/rpc_messages";
import { pref_keys } from "@/shared/pref_keys";

export function use_account_data(user: AccountRowWire | null) {
  const setAccountContacts = useSetAtom(accountContactsAtom);
  const setSignatureTemplates = useSetAtom(signature_templatesAtom);
  const setSignatureAssignments = useSetAtom(signatureAssignmentsAtom);
  const setEmailTemplates = useSetAtom(email_templatesAtom);
  const setPrefs = useSetAtom(prefsAtom);
  const setLabels = useSetAtom(labelsAtom);
  const setContacts = useSetAtom(contactsAtom);
  const setNotes = useSetAtom(notesAtom);
  const setNotesLoaded = useSetAtom(notes_loaded_atom);
  const setContactsLoaded = useSetAtom(contacts_loaded_atom);
  const setLabelsLoaded = useSetAtom(labels_loaded_atom);
  const setTemplatesLoaded = useSetAtom(templates_loaded_atom);
  const setFilteredViewsEnabled = useSetAtom(filtered_views_enabled_atom);
  const account_views_atom = useMemo(() => filtered_views_atom_for(user?.id ?? ""), [user?.id]);
  const setAccountViews = useSetAtom(account_views_atom);

  useEffect(() => {
    if (!user?.id) return;
    const account_id = user.id;
    rpc.request(messages.send_as_list, { account_id }).then((aliases: any) => {
      const list = aliases as SendAsAliasWire[];
      const hasPrimary = list.some(a => a.is_primary);
      if (!hasPrimary && user.email) {
        list.unshift({
          id: "primary",
          account_id,
          send_as_email: user.email,
          display_name: user.name ?? null,
          reply_to_address: null,
          signature: null,
          is_primary: true,
          is_default: true,
          treat_as_alias: false,
          verification_status: null,
        });
      }
      setAccountContacts(list);
    }).catch(() => {
      if (user.email) {
        setAccountContacts([{
          id: "primary",
          account_id,
          send_as_email: user.email,
          display_name: user.name ?? null,
          reply_to_address: null,
          signature: null,
          is_primary: true,
          is_default: true,
          treat_as_alias: false,
          verification_status: null,
        }]);
      }
    });
  }, [user?.id, user?.email, user?.name, setAccountContacts]);

  useEffect(() => {
    if (!user?.id) return;
    const account_id = user.id;
    Promise.all([
      rpc.request(messages.signature_list, { account_id }).catch(() => []) as Promise<SignatureTemplateWire[]>,
      rpc.request(messages.prefs_get, { key: "signature:assignments" }).catch(() => ({ value: null })) as Promise<{ value: Record<string, string | null> | null }>,
      rpc.request(messages.templates_list, { account_id }).catch(() => []) as Promise<EmailTemplateWire[]>,
    ]).then(([templates, assignments, emailTpls]) => {
      setSignatureTemplates(templates);
      if (assignments?.value) setSignatureAssignments(assignments.value);
      setEmailTemplates(emailTpls);
    }).finally(() => setTemplatesLoaded(true));

    rpc.request(messages.prefs_get_all).then((res: any) => {
      if (res?.prefs) {
        setPrefs(res.prefs);
        if (typeof res.prefs[pref_keys.filtered_views_enabled] === "boolean") {
          setFilteredViewsEnabled(res.prefs[pref_keys.filtered_views_enabled] as boolean);
        }
      }
    }).catch(() => {});

    rpc.request(messages.filtered_views_list, { account_id }).then((res: any) => {
      if (Array.isArray(res)) setAccountViews(res as FilteredViewWire[]);
    }).catch(() => {});

    rpc.request(messages.labels_list, { account_id }).then((res) => {
      if (res) setLabels(res);
    }).catch(() => {}).finally(() => setLabelsLoaded(true));

    rpc.request(messages.contacts_list, { account_id }).then((res: any) => {
      if (res) setContacts(res as ContactWire[]);
    }).catch(() => {}).finally(() => setContactsLoaded(true));

    rpc.request(messages.notes_list, { account_id }).then((res: any) => {
      if (res) setNotes(res as NoteWire[]);
    }).catch(() => {}).finally(() => setNotesLoaded(true));
  }, [user?.id, setSignatureTemplates, setSignatureAssignments, setEmailTemplates, setPrefs, setLabels, setContacts, setNotes, setNotesLoaded, setContactsLoaded, setLabelsLoaded, setTemplatesLoaded, setAccountViews, setFilteredViewsEnabled]);

  useEffect(() => {
    if (!user?.id) return;
    const refresh_labels = () => {
      rpc.request(messages.labels_list, { account_id: user.id }).then((res) => {
        if (res) setLabels(res);
      }).catch(() => {});
    };
    rpc.addMessageListener(messages.labels_changed, refresh_labels);
    return () => rpc.removeMessageListener(messages.labels_changed, refresh_labels);
  }, [user?.id, setLabels]);

  useEffect(() => {
    if (!user?.id) return;
    const refresh_contacts = () => {
      rpc.request(messages.contacts_list, { account_id: user.id }).then((res: any) => {
        if (res) setContacts(res as ContactWire[]);
      }).catch(() => {});
    };
    rpc.addMessageListener(messages.contacts_changed, refresh_contacts);
    return () => rpc.removeMessageListener(messages.contacts_changed, refresh_contacts);
  }, [user?.id, setContacts]);
}
