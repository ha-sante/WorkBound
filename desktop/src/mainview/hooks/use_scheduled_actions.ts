import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { currentMailComposeAtom, currentThreadViewAtom, composeMailBodyAtom, create_default_compose_state } from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { parse_send_payload, email_row_to_preview, payload_to_contacts } from "../utils/scheduled_send";

export function useScheduledActions() {
  const setCompose = useSetAtom(currentMailComposeAtom);
  const setBody = useSetAtom(composeMailBodyAtom);
  const setThreadView = useSetAtom(currentThreadViewAtom);

  const edit = useCallback(async (item: OutboxItemWire) => {
    const payload = parse_send_payload(item.payload);
    await rpc.request(messages.outbox_cancel, { id: item.id }).catch(() => {});

    const mode: DraftMode = payload.original_email_id ? "reply" : "new";
    const draft_id = crypto.randomUUID();

    let state = create_default_compose_state(mode, null, null, draft_id);
    state = {
      ...state,
      from_address: payload.from_address ?? "",
      from_name: payload.from_name ?? "",
      toContacts: payload_to_contacts(payload, "to"),
      ccContacts: payload_to_contacts(payload, "cc"),
      bccContacts: payload_to_contacts(payload, "bcc"),
      showCc: !!payload.cc,
      showBcc: !!payload.bcc,
      subject: payload.subject ?? "",
      attachments: (payload.attachments ?? []).map((a: AttachmentPayload, i: number) => ({
        id: (a as any).id ?? `att-${i}`,
        name: a.name,
        mime_type: a.mime_type ?? "application/octet-stream",
        data: a.data ?? "",
        local_path: a.local_path ?? null,
        size: a.size ?? 0,
      })),
    };

    if (mode === "reply" && payload.original_email_id) {
      try {
        const res = await rpc.request(messages.mail_get, { id: payload.original_email_id });
        const orig = (res as MailGetResponse | null)?.email;
        if (orig) {
          state = { ...state, email: email_row_to_preview(orig), fullEmail: orig };
        }
      } catch {}
    }

    setThreadView(null);
    setCompose(state);
    setBody({ body_html: payload.body_html ?? "", body_text: payload.body_text ?? "" });
  }, [setCompose, setBody, setThreadView]);

  const cancel = useCallback(async (item: OutboxItemWire) => {
    await rpc.request(messages.outbox_cancel, { id: item.id }).catch(() => {});
  }, []);

  const sendNow = useCallback(async (item: OutboxItemWire) => {
    await rpc.request(messages.outbox_send_now, { id: item.id }).catch(() => {});
  }, []);

  return { edit, cancel, sendNow };
}
