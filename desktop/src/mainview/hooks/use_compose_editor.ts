import { useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  composeMetaAtom,
  composeBodyAtom,
  composePreviousStateAtom,
  CLOSED_COMPOSE_STATE,
  create_default_compose_state,
} from "../state";
import { rpc } from "../rpc";
import { messages } from "@/shared/rpc_messages";
import { email_row_to_preview } from "../utils/scheduled_send";

export function use_compose_editor() {
  const setComposeMeta = useSetAtom(composeMetaAtom);
  const setComposeBody = useSetAtom(composeBodyAtom);
  const [previousState, setComposePreviousState] = useAtom(composePreviousStateAtom);

  const close = useCallback(() => {
    setComposePreviousState(null);
    setComposeMeta(CLOSED_COMPOSE_STATE);
  }, [setComposeMeta, setComposePreviousState]);

  const open_fresh = useCallback((meta: ComposeMeta) => {
    setComposePreviousState(null);
    setComposeMeta(meta);
  }, [setComposeMeta, setComposePreviousState]);

  const open_draft = useCallback(async (draft_id: string) => {
    setComposePreviousState(null);
    const draft = await rpc.request(messages.draft_get, { id: draft_id }) as DraftWire | null;
    if (!draft) return;
    const mode: DraftMode = draft.mode ?? "new";
    if (mode !== "new" && draft.original_email_id) {
      try {
        const res = await rpc.request(messages.mail_get, { id: draft.original_email_id });
        const orig = (res as MailGetResponse | null)?.email;
        if (orig) {
          setComposeMeta(create_default_compose_state(mode, email_row_to_preview(orig), orig, draft_id));
          return;
        }
      } catch {}
    }
    setComposeMeta(create_default_compose_state(mode, null, null, draft_id));
  }, [setComposeMeta, setComposePreviousState]);

  const restore_previous = useCallback(() => {
    if (!previousState) return;
    setComposePreviousState(null);
    setComposeMeta({ ...previousState.meta, phase: "composing", countdown: 50 });
    setComposeBody(previousState.body);
  }, [previousState, setComposeMeta, setComposeBody, setComposePreviousState]);

  const cancel_and_open = useCallback(async (outbox_id: string, source: "undo" | "edit" = "undo") => {
    const result = await rpc.request(messages.outbox_cancel, { id: outbox_id, source }) as { draft_id: string | null } | null;
    if (result?.draft_id) {
      await open_draft(result.draft_id);
      return;
    }
    restore_previous();
  }, [open_draft, restore_previous]);

  return { open_fresh, open_draft, cancel_and_open, restore_previous, close };
}