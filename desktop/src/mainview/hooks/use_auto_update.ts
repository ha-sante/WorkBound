import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { updateToastAtom } from "../state";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const dismissed_hashes = new Set<string>();
export const mark_update_dismissed = (hash: string) => dismissed_hashes.add(hash);

export function useAutoUpdate() {
  const set_update_toast = useSetAtom(updateToastAtom);

  useEffect(() => {
    rpc
      .request(messages.updates_get_status)
      .then((status) => {
        if (status.updateReady && status.latestHash) {
          rpc.request(messages.updates_install).catch(() => {});
        } else {
          rpc.request(messages.updates_check)
            .then((result) => {
              if (result.updateAvailable) {
                rpc.request(messages.updates_download).catch(() => {});
              }
            })
            .catch(console.error);
        }
      })
      .catch(console.error);

    const interval = setInterval(() => {
      rpc.request(messages.updates_check)
        .then((result) => {
          if (result.updateAvailable) {
            rpc.request(messages.updates_download).catch(() => {});
          }
        })
        .catch(console.error);
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const on_status = (entry: UpdateStatusEntryWire) => {
      if (entry.status !== "download-complete") return;
      const details = entry.details as UpdateStatusDetailsWire | undefined;
      const hash = details?.latestHash ?? details?.toHash ?? "";
      if (!hash || dismissed_hashes.has(hash)) return;
      set_update_toast({ version: "", hash });
    };

    rpc.addMessageListener(messages.updates_status, on_status);
    return () => rpc.removeMessageListener(messages.updates_status, on_status);
  }, [set_update_toast]);

  return null;
}
