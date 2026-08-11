import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { emailsByFolderAtom } from "../state";
import { group_emails_by_folder, load_all_emails } from "./email_utils";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

const FIRST_PAGE_SIZE = 500;

type SyncActions = {
  setPaginationAnchors: (newest: string | null, oldest: string | null) => void;
};

async function load_progressive(account_id: string, setEmailsByFolder: any, setPaginationAnchors: (newest: string | null, oldest: string | null) => void) {
  const { total } = await rpc.request(messages.mail_count, { account_id });

  if (total === 0) {
    console.timeLog("startup:loadEmails", "empty DB, fetching first page via API");
    try {
      const previews = await rpc.request(messages.mail_fetch_first_page, { account_id, maxResults: 50 });
      const grouped = group_emails_by_folder(previews || []);
      setEmailsByFolder(grouped);
      const previewsArr = previews || [];
      let n: string | null = null;
      let o: string | null = null;
      for (const e of previewsArr) {
        if (e.received_at) {
          if (!n || e.received_at > n) n = e.received_at;
          if (!o || e.received_at < o) o = e.received_at;
        }
      }
      setPaginationAnchors(n, o);
      console.timeLog("startup:loadEmails", `first API page: ${previewsArr.length} emails`);
      return;
    } catch (e) {
      console.warn("startup:fetchFirstPage failed, showing empty state", e);
      setEmailsByFolder({});
      return;
    }
  }

  const first = await rpc.request(messages.mail_list_page, { account_id, limit: FIRST_PAGE_SIZE, offset: 0 });
  if (first.emails.length === 0) {
    setEmailsByFolder({});
    return;
  }
  setEmailsByFolder(group_emails_by_folder(first.emails));

  let newest: string | null = null;
  let oldest: string | null = null;
  for (const e of first.emails) {
    if (e.received_at) {
      if (!newest || e.received_at > newest) newest = e.received_at;
      if (!oldest || e.received_at < oldest) oldest = e.received_at;
    }
  }
  setPaginationAnchors(newest, oldest);

  let loaded = first.emails.length;
  if (loaded >= total) return;

  const all = await load_all_emails(account_id, first.emails);
  const grouped = group_emails_by_folder(all);
  setEmailsByFolder(grouped);
  for (const e of all) {
    if (e.received_at) {
      if (!newest || e.received_at > newest) newest = e.received_at;
      if (!oldest || e.received_at < oldest) oldest = e.received_at;
    }
  }
  setPaginationAnchors(newest, oldest);
  console.timeLog("startup:loadEmails", `loaded all ${all.length}/${total} via pages`);
}

export function useLoadEmails(account_id: string | undefined, actions: SyncActions) {
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const startedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!account_id || startedId.current === account_id) return;
    startedId.current = account_id;

    (async () => {
      console.time("startup:total");
      console.timeLog("app:init", "startup begin");

      console.time("startup:loadEmails");
      await load_progressive(account_id, setEmailsByFolder, actions.setPaginationAnchors);
      console.timeEnd("startup:loadEmails");

      console.timeEnd("startup:total");
      console.timeLog("app:init", "startup complete");
    })();
  }, [account_id, setEmailsByFolder, actions]);
}
