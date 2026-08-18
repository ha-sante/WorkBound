import { atom, getDefaultStore } from "jotai";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "./rpc";
export { mail_body_cache_atom } from "./hooks/utils/mail_body_cache";

const DEFAULT_WIDTH = 240;
const DEFAULT_OPEN = true;
const WIDTH_KEY = "ui:sidebar_width";
const OPEN_KEY = "ui:sidebar_open";
const MIN_WIDTH = 60;
const MAX_WIDTH = 240;

const store = getDefaultStore();
const width_base = atom<number>(DEFAULT_WIDTH);
const open_base = atom<boolean>(DEFAULT_OPEN);

export const sidebarWidthAtom = atom(
  (get) => get(width_base),
  (get, set, update: number | ((prev: number) => number)) => {
    const next = typeof update === "function" ? update(get(width_base)) : update;
    set(width_base, next);
    rpc.request(messages.prefs_set, { key: WIDTH_KEY, value: next }).catch(() => {});
  },
);

export const sidebarOpenAtom = atom(
  (get) => get(open_base),
  (get, set, value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(get(open_base)) : value;
    set(open_base, next);
    rpc.request(messages.prefs_set, { key: OPEN_KEY, value: next }).catch(() => {});
  },
);

export async function hydrate_sidebar_state(): Promise<void> {
  try {
    const { prefs } = await rpc.request(messages.prefs_get_all);
    const wv = prefs[WIDTH_KEY];
    const ov = prefs[OPEN_KEY];
    if (typeof wv === "number" && Number.isFinite(wv)) {
      store.set(width_base, Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(wv))));
    }
    if (typeof ov === "boolean") {
      store.set(open_base, ov);
    }
  } catch {}
}

export const folderAtom = atom<string>("inbox");
export const emailsByFolderAtom = atom<Record<string, any[]>>({});

export const email_idsWithDraftsAtom = atom((get) => {
  const byFolder = get(emailsByFolderAtom);
  const drafts = byFolder["drafts"] || [];
  const map = new Map<string, EmailPreviewWire>();
  for (const d of drafts) {
    if (d.original_email_id && d.draft_mode && d.draft_mode !== "new") {
      if (!map.has(d.original_email_id)) map.set(d.original_email_id, d);
    }
  }
  return map;
});

export const accountsAtom = atom<AccountRowWire[]>([]);
export const currentAccountIdAtom = atom<string | null>(null);
export const copyToastAtom = atom<string | null>(null);
export const alertToastAtom = atom<{
  message: string;
  type?: "error" | "warning" | "info" | "success";
} | null>(null);
export const messageToastAtom = atom<string | null>(null);
export const savedFileToastAtom = atom<{
  filename: string;
  path: string;
  isLocal?: boolean;
} | null>(null);
export const updateToastAtom = atom<{ version: string; hash: string } | null>(
  null,
);

// Draft system atoms
export const clientDraftsAtom = atom({} as Record<string, any>);
export const draftMutexAtom = atom<
  Record<string, "idle" | "flushing" | "checkpointing" | "sending" | "deleting">
>({});
export const draftCommittedPayloadAtom = atom<{
  draft_id: string;
  gmail_draft_id: string;
  gmail_message_id: string;
  original_email_id?: string;
} | null>(null);

export const searchQueryAtom = atom<string>("");
export const searchResultsAtom = atom<EmailPreviewWire[]>([]);
export const searchActiveAtom = atom<boolean>(false);
export const searchDropdownOpenAtom = atom<boolean>(false);

export const accountContactsAtom = atom<SendAsAliasWire[]>([]);
export const signature_templatesAtom = atom<SignatureTemplateWire[]>([]);
export const signatureAssignmentsAtom = atom<Record<string, string | null>>({});
export const email_templatesAtom = atom<EmailTemplateWire[]>([]);
export const prefsAtom = atom<Record<string, unknown>>({});
export const labelsAtom = atom<{
  userLabels: { id: string; name: string; icon_name?: string | null }[];
  systemLabels: { id: string; name: string; icon_name?: string | null }[];
  categories: { id: string; name: string; icon_name?: string | null }[];
}>({ userLabels: [], systemLabels: [], categories: [] });
export const contactsAtom = atom<ContactWire[]>([]);
export const notesAtom = atom<NoteWire[]>([]);
export const notes_loaded_atom = atom(false);
export const contacts_loaded_atom = atom(false);
export const labels_loaded_atom = atom(false);
export const templates_loaded_atom = atom(false);

export const filter_clauses_atom = atom<ClientFilterClause[]>([]);
export const filter_bar_open_atom = atom(false);
export const email_list_selection_atom = atom<number>(-1); // -1 = none
export const email_list_hover_atom = atom<number>(-1); // -1 = cursor not over the list

export const settings_open_atom = atom(false);
export const search_focus_request_atom = atom(0); // bump to trigger search input focus
export const search_close_request_atom = atom(0); // bump to close/deactivate search

export const filtered_views_enabled_atom = atom(false);
export const active_filtered_view_atom = atom<string | null>(null);

const filtered_views_atoms_cache = new Map<string, ReturnType<typeof atom<FilteredViewWire[]>>>();

export function filtered_views_atom_for(account_id: string) {
  let cached = filtered_views_atoms_cache.get(account_id);
  if (!cached) {
    cached = atom<FilteredViewWire[]>([]);
    filtered_views_atoms_cache.set(account_id, cached);
  }
  return cached;
}
export type CurrentMailViewState = { email: EmailPreviewWire; fullEmail: EmailRowWire | null; } | null;
export const currentMailViewAtom = atom<CurrentMailViewState>(null);
export type ThreadViewEmail = { email: EmailPreviewWire; fullEmail: EmailRowWire | null; };

export type CurrentThreadViewState = {
  thread_id: string;
  emails: ThreadViewEmail[];
  activeIndex: number;
  scheduled_item_id?: string;
} | null;

export const currentThreadViewAtom = atom<CurrentThreadViewState>(null);
export const currentScheduledViewAtom = atom<{ item: OutboxItemWire } | null>(null);
export const activeThreadScheduledItemAtom = atom<OutboxItemWire | null>(null);
export const CLOSED_COMPOSE_STATE: ComposeMeta = {
  mode: "new",
  email: null,
  fullEmail: null,
  draft_id: null,
  from_address: "",
  from_name: "",
  is_domain_match: false,
  toContacts: [],
  ccContacts: [],
  bccContacts: [],
  toInput: "",
  ccInput: "",
  bccInput: "",
  showCc: false,
  showBcc: false,
  subject: "",
  attachments: [],
  phase: "closed",
  countdown: 50,
  outboxId: null,
};

export const composeMetaAtom = atom<ComposeMeta>(CLOSED_COMPOSE_STATE);
export const composeBodyAtom = atom<ComposeBody>({ body_html: "", body_text: "" });
export const composePreviousStateAtom = atom<ComposePreviousState | null>(null);
export const sentToastAtom = atom<SentToastState | null>(null);

export const composeCanUndoAtom = atom(false);
export const composeCanRedoAtom = atom(false);
export const composeUndoAtom = atom<{ current: () => void }>({ current: () => {} });
export const composeRedoAtom = atom<{ current: () => void }>({ current: () => {} });
export const composeDiscardAtom = atom<{ show: boolean; fn: () => void }>({ show: false, fn: () => {} });
export const composeSaveAtom = atom<{ status: "off" | "saving" | "saved"; fn: () => void }>({ status: "off", fn: () => {} });

export const compose_actions_atom = atom<ComposeActions>({
  send: () => {},
  discard: () => {},
  attach: () => {},
  close: () => {},
  send_later: () => {},
  undo_send: () => {},
  send_at: () => {},
});

export const command_k_modal_open_atom = atom(false);
export const command_k_modal_request_atom = atom<
  | {
      mode: "reminder";
      account_id: string;
      email_id: string;
      thread_id: string | null;
      reminder_id?: string;
    }
  | { mode: "schedule" }
  | null
>(null);

export function create_default_compose_state(mode: DraftMode, email?: EmailPreviewWire | null, fullEmail?: EmailRowWire | null, draft_id?: string | null): ComposeMeta {
  const subject = !email?.subject
    ? ""
    : mode === "reply" || mode === "reply_all"
      ? `Re: ${email.subject}`
      : mode === "forward"
        ? `Fwd: ${email.subject}`
        : "";
  return {
    mode,
    email: email ?? null,
    fullEmail: fullEmail ?? null,
    draft_id: draft_id ?? null,
    from_address: "",
    from_name: "",
    is_domain_match: false,
    toContacts: [],
    ccContacts: [],
    bccContacts: [],
    toInput: "",
    ccInput: "",
    bccInput: "",
    showCc: false,
    showBcc: false,
    subject,
    attachments: [],
    phase: "composing",
    countdown: 50,
    outboxId: null,
  };
}
