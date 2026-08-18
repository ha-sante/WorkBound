import { useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { emailsByFolderAtom } from "../state";
import { group_emails_by_folder, load_all_email_previews } from "./utils/email_utils";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

const FIRST_PAGE_SIZE = 500;

type SyncActions = {
  setPaginationAnchors: (newest: string | null, oldest: string | null) => void;
};

type PaginationAnchors = {
  newest: string | null;
  oldest: string | null;
};

// find the newest mail cursor or oldest
const get_pagination_anchors = (emails: EmailPreviewWire[]): PaginationAnchors => emails.reduce<PaginationAnchors>(
  (anchors, email) => {
    const received_at = email.received_at;
    if (!received_at) return anchors;
    return {
      newest: !anchors.newest || received_at > anchors.newest ? received_at : anchors.newest,
      oldest: !anchors.oldest || received_at < anchors.oldest ? received_at : anchors.oldest,
    };
  },
  { newest: null, oldest: null },
);

async function load_progressive(account_id: string, setEmailsByFolder: any,
  setPaginationAnchors: (newest: string | null, oldest: string | null) => void, on_initial_load_complete: () => void) {
  const { total } = await rpc.request(messages.mail_count, { account_id });

  if (total === 0) {
    // initial load if empty database records
    console.timeLog("startup:loadEmails", "empty DB, fetching first page via API");
    try {
      const previews = await rpc.request(messages.mail_fetch_first_page, { account_id, maxResults: 50 });
      const grouped = group_emails_by_folder(previews || []);
      setEmailsByFolder(grouped);
      const previewsArr = previews || [];
      const { newest, oldest } = get_pagination_anchors(previewsArr);
      setPaginationAnchors(newest, oldest);
      on_initial_load_complete();
      console.timeLog("startup:loadEmails", `first API page: ${previewsArr.length} emails`);
      return;
    } catch (e) {
      console.warn("startup:fetchFirstPage failed, showing empty state", e);
      setEmailsByFolder({});
      return;
    }
  }

  // load the first local page
  const first = await rpc.request(messages.mail_list_page, { account_id, limit: FIRST_PAGE_SIZE, offset: 0 });
  if (first.emails.length === 0) {
    setEmailsByFolder({});
    return;
  }
  setEmailsByFolder(group_emails_by_folder(first.emails));

  const { newest, oldest } = get_pagination_anchors(first.emails);
  setPaginationAnchors(newest, oldest);
  on_initial_load_complete();

  const loaded = first.emails.length;
  if (loaded >= total) return;

  const all = await load_all_email_previews(account_id, first.emails);
  const grouped = group_emails_by_folder(all);
  setEmailsByFolder(grouped);

  // hydrate for later
  const all_anchors = get_pagination_anchors(all);
  setPaginationAnchors(all_anchors.newest ?? newest, all_anchors.oldest ?? oldest);
  console.timeLog("startup:loadEmails", `loaded all ${all.length}/${total} via pages`);
}

export function useLoadEmails(account_id: string | undefined, actions: SyncActions) {
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const startedId = useRef<string | undefined>(undefined);
  const [initial_load_complete, set_initial_load_complete] = useState(false);

  useEffect(() => {
    if (!account_id) {
      set_initial_load_complete(false);
      return;
    }
    // used to stop loading twice per same account
    if (startedId.current === account_id) return;
    startedId.current = account_id;
    set_initial_load_complete(false);

    (async () => {
      console.time("startup:total");
      console.timeLog("app:init", "startup begin");
      console.time("startup:loadEmails");
      try {
        await load_progressive(account_id, setEmailsByFolder, actions.setPaginationAnchors, () => set_initial_load_complete(true));
      } finally {
        set_initial_load_complete(true);
        console.timeEnd("startup:loadEmails");
        console.timeEnd("startup:total");
        console.timeLog("app:init", "startup complete");
      }
    })();
  }, [account_id, setEmailsByFolder, actions]);

  return initial_load_complete;
}
