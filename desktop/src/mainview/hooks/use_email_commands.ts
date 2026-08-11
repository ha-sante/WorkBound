import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { emailsByFolderAtom, alertToastAtom, draftCommittedPayloadAtom } from "../state";
import { messages } from "@/shared/rpc_messages";
import { move_email_folder } from "./email_utils";
import { rpc } from "../rpc";

export function useEmailCommands() {
  const setEmailsByFolder = useSetAtom(emailsByFolderAtom);
  const setAlertToast = useSetAtom(alertToastAtom);
  const setDraftCommitted = useSetAtom(draftCommittedPayloadAtom);

  useEffect(() => {
    const handler = (payload: EmailCommandWire) => {
      switch (payload.cmd) {
        case "draft-deleted":
          setEmailsByFolder((prev) => {
            const next: Record<string, any[]> = {};
            for (const folder of Object.keys(prev)) {
              const list = prev[folder];
              if (list.some((e: any) => e.id === payload.email_id)) {
                next[folder] = list.filter((e: any) => e.id !== payload.email_id);
              } else {
                next[folder] = list;
              }
            }
            return next;
          });
          break;

        case "folder-changed": {
          const fromFolder = payload.fromFolder;
          const toFolder = payload.toFolder;
          if (fromFolder && toFolder) {
            setEmailsByFolder((prev) =>
              move_email_folder(prev, payload.email_id, fromFolder, toFolder, payload.updates)
            );
          }
          break;
        }
      }
    };

    rpc.addMessageListener(messages.email_command, handler);
    return () => rpc.removeMessageListener(messages.email_command, handler);
  }, [setEmailsByFolder, setAlertToast]);

  useEffect(() => {
    const handler = (payload: DraftEmailSavedWire) => {
      setDraftCommitted({
        draft_id: payload.draft_id,
        gmail_draft_id: payload.gmail_draft_id,
        gmail_message_id: payload.gmail_message_id,
        original_email_id: payload.original_email_id,
      });
    };

    rpc.addMessageListener(messages.draft_email_saved, handler);
    return () => rpc.removeMessageListener(messages.draft_email_saved, handler);
  }, [setDraftCommitted]);

  useEffect(() => {
    const handler = (payload: DraftEmailSentWire) => {
      setEmailsByFolder((prev) => {
        const next: Record<string, any[]> = {};
        for (const folder of Object.keys(prev)) {
          next[folder] = prev[folder].filter((e: any) => e.id !== payload.draft_id);
        }
        return next;
      });
      setAlertToast({ message: "Email sent", type: "success" });
    };

    rpc.addMessageListener(messages.draft_email_sent, handler);
    return () => rpc.removeMessageListener(messages.draft_email_sent, handler);
  }, [setEmailsByFolder, setAlertToast]);
}
