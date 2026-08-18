import { useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  emailsByFolderAtom,
  currentMailViewAtom,
  currentThreadViewAtom,
  email_list_selection_atom,
} from "../state";
import { move_email_to_folder, find_email_source_folder } from "./utils/email_utils";
import { enqueue_email_action } from "./utils/email_actions";
import { use_compose_editor } from "./use_compose_editor";

const list_move_actions = new Set(["delete", "archive", "mark_spam", "mark_phishing", "block_sender", "not_spam"]);

type Params = {
  folder: string;
  emails: EmailPreviewWire[];
  currentIdx: number;
};

export function use_mail_actions({ folder, emails, currentIdx }: Params) {
  const [emailsByFolder, setEmailsByFolder] = useAtom(emailsByFolderAtom);
  const [currentView, setCurrentView] = useAtom(currentMailViewAtom);
  const { close } = use_compose_editor();
  const setCurrentThreadView = useSetAtom(currentThreadViewAtom);
  const set_email_list_selection = useSetAtom(email_list_selection_atom);

  const handleAction = useCallback(
    (email_id: string, action: string, value?: number) => {
      const moveDest: Record<string, string> = {
        delete: "bin",
        mark_spam: "spam",
        mark_phishing: "spam",
        block_sender: "spam",
        archive: "all",
        not_spam: "inbox",
        restore: "inbox",
      };
      const inplaceUpdates: Record<string, Record<string, any>> = {
        mark_read: { is_read: 1 },
        mark_unread: { is_read: 0 },
        mark_phishing: { is_phishing: 1 },
      };

      const patchThreadEmail = (patch: Partial<EmailPreviewWire>) => {
        setCurrentThreadView((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            emails: prev.emails.map((te) =>
              te.email.id === email_id ? { ...te, email: { ...te.email, ...patch } as EmailPreviewWire } : te,
            ),
          };
        });
      };

      const src = find_email_source_folder(emailsByFolder, folder, email_id);
      const dest = moveDest[action];
      if (dest) {
        setEmailsByFolder((prev) => move_email_to_folder(prev, email_id, src, dest, inplaceUpdates[action]));
        if (currentView) {
          if (currentIdx > 0) {
            setCurrentView({ email: emails[currentIdx - 1], fullEmail: null });
          } else if (currentIdx < emails.length - 1) {
            setCurrentView({ email: emails[currentIdx + 1], fullEmail: null });
          } else {
            setCurrentView(null);
            close();
          }
        } else {
          setCurrentThreadView((prev) => {
            if (!prev) return prev;
            const removedIndex = prev.emails.findIndex((te) => te.email.id === email_id);
            const nextEmails = prev.emails.filter((te) => te.email.id !== email_id);
            if (nextEmails.length === 0) return null;
            let newIndex = prev.activeIndex;
            if (removedIndex !== -1 && removedIndex < prev.activeIndex) newIndex--;
            newIndex = Math.min(newIndex, nextEmails.length - 1);
            return { ...prev, emails: nextEmails, activeIndex: newIndex };
          });
        }
      } else if (inplaceUpdates[action]) {
        setEmailsByFolder((prev) => {
          const list = prev[src] ?? [];
          return {
            ...prev,
            [src]: list.map((e: any) =>
              e.id === email_id ? { ...e, ...inplaceUpdates[action] } : e,
            ),
          };
        });
        setCurrentView((prev) =>
          prev?.email?.id === email_id ? { ...prev, email: { ...prev.email, ...inplaceUpdates[action] } as EmailPreviewWire } : prev,
        );
        patchThreadEmail(inplaceUpdates[action]);
      } else if (action === "toggle_starred") {
        const newStarred = value ?? (1 - (emails.find((e: any) => e.id === email_id)?.is_starred ?? 0));
        setEmailsByFolder((prev) => {
          const list = prev[src] ?? [];
          return {
            ...prev,
            [src]: list.map((e: any) =>
              e.id === email_id ? { ...e, is_starred: newStarred } : e,
            ),
          };
        });
        patchThreadEmail({ is_starred: newStarred as 0 | 1 });
      } else if (action === "toggle_important") {
        const newFlagged = value ?? (1 - (emails.find((e: any) => e.id === email_id)?.is_flagged ?? 0));
        setEmailsByFolder((prev) => {
          const list = prev[src] ?? [];
          return {
            ...prev,
            [src]: list.map((e: any) =>
              e.id === email_id ? { ...e, is_flagged: newFlagged } : e,
            ),
          };
        });
        patchThreadEmail({ is_flagged: newFlagged as 0 | 1 });
      }
    },
    [emailsByFolder, folder, currentIdx, emails, setCurrentView, close, setCurrentThreadView],
  );

  const handle_list_action = useCallback(
    (email: EmailPreviewWire, action: string, value?: number) => {
      enqueue_email_action(email, action, value);
      handleAction(email.id, action, value);
      if (list_move_actions.has(action)) {
        const new_len = emails.length - 1;
        set_email_list_selection((sel) => (new_len <= 0 ? -1 : Math.min(sel, new_len - 1)));
      }
    },
    [emails, handleAction, set_email_list_selection],
  );

  const handle_viewer_action = useCallback(
    (email: EmailPreviewWire, action: string, value?: number) => {
      enqueue_email_action(email, action, value);
      handleAction(email.id, action, value);
    },
    [handleAction],
  );

  return { handleAction, handle_list_action, handle_viewer_action };
}
