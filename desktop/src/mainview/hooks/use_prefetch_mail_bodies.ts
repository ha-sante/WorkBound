/**
 * Load the 50 newest email bodies in the background so opening a message is
 * fast. We fetch only uncached messages one at a time and ignore results from
 * an account that is no longer active.
 */
import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { emailsByFolderAtom, mail_body_cache_atom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { cache_mail_body, mail_body_cache_key } from "./utils/mail_body_cache";

const DEFAULT_PREFETCH_COUNT = 50;
const PREFETCH_COUNT = Math.max(0, Number.parseInt(import.meta.env.VITE_MAIL_BODY_CACHE_PREFETCH_COUNT ?? "", 10) || DEFAULT_PREFETCH_COUNT);

export function use_prefetch_mail_bodies(account_id: string | undefined, initial_load_complete: boolean) {
  const emails_by_folder = useAtomValue(emailsByFolderAtom);
  const set_body_cache = useSetAtom(mail_body_cache_atom);
  const store = useStore();
  const account_ref = useRef<string | undefined>(undefined);
  const in_flight_ref = useRef(new Set<string>());
  const [sync_revision, set_sync_revision] = useState(0);

  useEffect(() => {
    account_ref.current = account_id;
    set_body_cache((prev) => {
      if (!account_id) return { entries: {}, bytes: 0 };
      const entries = Object.fromEntries(
        Object.entries(prev.entries).filter(([key]) => key.startsWith(`${account_id}:`)),
      );
      const bytes = Object.values(entries).reduce((sum, entry) => sum + entry.size_bytes, 0);
      return { entries, bytes };
    });
  }, [account_id, set_body_cache]);

  useEffect(() => {
    if (!account_id) return;
    const handler = (payload: NewfillProgressWire) => {
      if (payload.account_id === account_id && payload.state === "done" && payload.hasChanges) {
        set_sync_revision((value) => value + 1);
      }
    };
    rpc.addMessageListener(messages.sync_newfill_progress, handler);
    return () => rpc.removeMessageListener(messages.sync_newfill_progress, handler);
  }, [account_id]);

  useEffect(() => {
    if (!account_id || !initial_load_complete) return;
    const body_cache = store.get(mail_body_cache_atom);
    const candidates: EmailPreviewWire[] = [];
    const seen_ids = new Set<string>();

    // Make one newest-first list from all folders.
    for (const emails of Object.values(emails_by_folder)) {
      for (const email of emails as EmailPreviewWire[]) {
        if (email.account_id !== account_id || seen_ids.has(email.id)) continue;
        seen_ids.add(email.id);
        candidates.push(email);
      }
    }
    candidates.sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? ""));

    // Only prefetch messages that are not already cached or being fetched.
    const email_ids = candidates.slice(0, PREFETCH_COUNT)
      .map((email) => email.id)
      .filter((email_id) => {
        const key = mail_body_cache_key(account_id, email_id);
        return !body_cache.entries[key] && !in_flight_ref.current.has(key);
      });

    const prefetch = async () => {
      for (const email_id of email_ids) {
        const key = mail_body_cache_key(account_id, email_id);
        in_flight_ref.current.add(key);
        try {
          const result = await rpc.request(messages.mail_get, { id: email_id }) as unknown as MailGetResponse;
          if (account_ref.current === account_id && result?.email) {
            set_body_cache((prev) => cache_mail_body(prev, account_id, result.email!, result.attachments ?? []));
          }
        } catch {
          // A failed prefetch can be loaded normally when the message opens.
        } finally {
          in_flight_ref.current.delete(key);
        }
      }
    };

    void prefetch();
  }, [account_id, initial_load_complete, emails_by_folder, set_body_cache, store, sync_revision]);
}
