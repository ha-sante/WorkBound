import { messages } from "../../../shared/rpc_messages";
import { outbox_commands } from "../../../shared/outbox_commands";
import { logger } from "../../utils/logger";
import { insert_outbox, cancel_outbox, delete_outbox, get_outbox, list_outbox_filtered, clear_scheduled_at, type OutboxRow } from "../../db/outbox";
import { get_email, update_email } from "../../db/emails";
import { save_draft, delete_draft, get_draft } from "../../db/drafts";
import { bulk_insert_attachments } from "../../db/attachments";
import { get_account } from "../../db/accounts";
import { get_adapter } from "../../providers";
import { get_rpc } from "../../outbox/rpc_ref";

type SendMeta = { to: string; subject: string | null; thread_id: string | null };

function resolve_send_meta(payload: string | null): SendMeta {
  let p: { to?: string; subject?: string; original_email_id?: string } = {};
  if (payload) {
    try {
      p = JSON.parse(payload);
    } catch {
      p = {};
    }
  }
  const to = p.to ?? "";
  const subject = p.subject ?? null;
  let thread_id: string | null = null;
  if (p.original_email_id) {
    const orig = get_email(p.original_email_id);
    thread_id = orig?.thread_id ?? null;
  }
  return { to, subject, thread_id };
}

function emit_outbox_changed(account_id: string, thread_id?: string | null) {
  const rpc = get_rpc();
  rpc?.send(messages.outbox_changed, { account_id, thread_id: thread_id ?? null });
}

function emit_draft_refresh(account_id: string) {
  const account = get_account(account_id);
  const rpc = get_rpc();
  rpc?.send(messages.sync_newfill_progress, {
    account_id,
    email: account?.email ?? "",
    state: "done",
    hasChanges: true,
  });
}

function try_parse_json(text: string | null): Record<string, any> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function is_captured_gmail_row(row: OutboxRow): boolean {
  return try_parse_json(row.extras).source === "gmail_capture";
}

async function resolve_captured_gmail_draft_id(account_id: string, gmail_message_id?: string): Promise<string | null> {
  if (!gmail_message_id) return null;
  try {
    const account = get_account(account_id);
    if (!account) return null;
    const adapter = get_adapter(account.provider);
    await adapter.connect(account);
    const drafts = await adapter.listDrafts?.();
    if (!drafts) return null;
    return drafts.find((d) => d.message_id === gmail_message_id)?.id ?? null;
  } catch (err) {
    logger.warn("rpc", `resolve_captured_gmail_draft_id failed for ${gmail_message_id}: ${err}`);
    return null;
  }
}

async function cancel_captured_gmail_schedule(row: OutboxRow): Promise<void> {
  const captured = try_parse_json(row.extras);
  let gmail_draft_id = captured.gmail_draft_id ?? null;
  if (!gmail_draft_id) {
    gmail_draft_id = await resolve_captured_gmail_draft_id(row.account_id, captured.gmail_message_id);
  }
  if (gmail_draft_id) {
    insert_outbox({
      id: crypto.randomUUID(),
      account_id: row.account_id,
      command: outbox_commands.draft_delete,
      payload: JSON.stringify({ gmail_draft_id }),
      status: "queued",
      created_at: Date.now(),
    });
  } else if (captured.gmail_message_id) {
    insert_outbox({
      id: crypto.randomUUID(),
      account_id: row.account_id,
      command: outbox_commands.delete_email,
      extras: JSON.stringify({ providerMessageId: captured.gmail_message_id }),
      status: "queued",
      created_at: Date.now(),
    });
  }
  logger.info("rpc", `outbox:cancel id=${row.id} captured gmail send, unscheduling server draft=${gmail_draft_id ?? "none"}`);
}

function convert_to_local_draft(row: OutboxRow, body_source: "raw" | "fullHtml" = "fullHtml"): string | null {
  const p = try_parse_json(row.payload);
  const to = typeof p.to === "string" ? p.to.trim() : "";
  if (!to) return null;

  const draft_id = typeof p.draft_id === "string" && p.draft_id ? p.draft_id : crypto.randomUUID();
  const mode: DraftMode = p.original_email_id ? "reply" : "new";

  const extras = try_parse_json(row.extras);
  const use_raw = body_source === "raw" && typeof extras.raw_body_html === "string" && extras.raw_body_html;
  const body_html = use_raw ? extras.raw_body_html : (p.body_html ?? null);
  const body_text = use_raw ? (extras.raw_body_text ?? null) : (p.body_text ?? null);
  const quote_text = use_raw ? (extras.quote_text ?? null) : (p.quote_text ?? null);

  // BUG-2 diagnostic: confirm whether scheduled-edit payloads arrive with an empty body
  if (body_source === "fullHtml" && !body_html) {
    console.warn("[outbox:convert] fullHtml source has empty body_html", {
      command: row.command,
      payload_keys: Object.keys(p),
      has_raw: !!extras.raw_body_html,
      body_html_len: typeof p.body_html === "string" ? p.body_html.length : null,
    });
  }

  save_draft({
    id: draft_id,
    account_id: row.account_id,
    mode,
    to,
    cc: p.cc ?? null,
    bcc: p.bcc ?? null,
    subject: p.subject ?? null,
    body_html,
    body_text,
    snippet: (typeof body_text === "string" ? body_text : "").slice(0, 100),
    from_address: p.from_address ?? null,
    from_name: p.from_name ?? null,
    original_email_id: p.original_email_id ?? null,
    quote_text,
    local_draft_id: draft_id,
    force: true,
  });

  if (Array.isArray(p.attachments) && p.attachments.length > 0) {
    bulk_insert_attachments(
      p.attachments.map((a: AttachmentPayload) => ({
        id: crypto.randomUUID(),
        email_id: draft_id,
        filename: a.name,
        mime_type: a.mime_type,
        size: a.size ?? 0,
        local_path: a.local_path ?? null,
        data: a.data ?? null,
      })),
    );
  }

  return draft_id;
}

function to_wire(r: {
  id: string;
  account_id: string;
  command: string;
  payload: string | null;
  extras: string | null;
  to_addr: string | null;
  subject: string | null;
  thread_id: string | null;
  status: string;
  error: string | null;
  created_at: number;
  sent_at: number | null;
  scheduled_at: number | null;
  available_at: number | null;
  attempt_count: number;
  next_retry_at: number | null;
  locked_at: number | null;
  locked_by: string | null;
}) {
  return {
    id: r.id,
    account_id: r.account_id,
    command: r.command,
    payload: r.payload,
    extras: r.extras,
    to_addr: r.to_addr,
    subject: r.subject,
    thread_id: r.thread_id,
    status: r.status as "queued" | "sending" | "sent" | "failed" | "cancelled",
    error: r.error,
    created_at: r.created_at,
    sent_at: r.sent_at,
    scheduled_at: r.scheduled_at,
    available_at: r.available_at,
    attempt_count: r.attempt_count,
    next_retry_at: r.next_retry_at,
    locked_at: r.locked_at,
    locked_by: r.locked_by,
  };
}

export default {
  [messages.outbox_enqueue]: async (params: {
    account_id: string;
    command?: OutboxCommand;
    payload?: string;
    extras?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body_html?: string;
    body_text?: string;
    quote_text?: string;
    attachments?: AttachmentPayload[];
    from_address?: string;
    from_name?: string;
    draft_id?: string;
    original_email_id?: string;
    scheduled_at?: number;
  }) => {
    const id = crypto.randomUUID();
    let command = params.command || outbox_commands.draft_send;
    let payload = params.payload ?? null;
    let extras = params.extras ?? null;
    let to_addr: string | null = null;
    let subject: string | null = null;
    let thread_id: string | null = null;

    if (command === outbox_commands.draft_send && params.to) {
      if (!params.to?.trim()) {
        throw new Error("recipient address is required");
      }
      payload = JSON.stringify({
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        body_html: params.body_html,
        body_text: params.body_text,
        quote_text: params.quote_text,
        attachments: params.attachments,
        from_address: params.from_address,
        from_name: params.from_name,
        draft_id: params.draft_id,
      });
    }

    if (command === outbox_commands.send_email && params.to) {
      payload = JSON.stringify({
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        body_html: params.body_html,
        body_text: params.body_text,
        attachments: params.attachments,
        from_address: params.from_address,
        from_name: params.from_name,
        original_email_id: params.original_email_id,
      });
    }

    const meta = resolve_send_meta(payload);
    if (meta.to) to_addr = meta.to;
    if (meta.subject) subject = meta.subject;
    thread_id = meta.thread_id;
    const now = Date.now();
    const parsed_extras = try_parse_json(extras);
    const undo_seconds = command === outbox_commands.send_email && !params.scheduled_at && parsed_extras.undo_enabled
      ? Math.max(0, Number(parsed_extras.undo_seconds) || 0)
      : 0;
    const available_at = params.scheduled_at ?? now + undo_seconds * 1000;

    logger.info("rpc", `outbox:enqueue id=${id} command=${command}`);

    insert_outbox({
      id,
      account_id: params.account_id,
      command,
      payload,
      extras,
      to_addr,
      subject,
      thread_id,
      status: "queued",
      created_at: now,
      scheduled_at: params.scheduled_at ?? null,
      available_at,
      attempt_count: 0,
    });
    emit_outbox_changed(params.account_id, thread_id);

    if (command === outbox_commands.send_email && params.scheduled_at) {
      const p = try_parse_json(payload);
      const draft_id = typeof p.draft_id === "string" && p.draft_id ? p.draft_id : null;
      if (draft_id) {
        delete_draft(draft_id);
        get_rpc()?.send(messages.email_command, { cmd: "draft-deleted", email_id: draft_id });
        logger.info("rpc", `outbox:enqueue id=${id} scheduled send, removed local draft ${draft_id}`);
      }
    }

    if (extras) {
      try {
        const e = JSON.parse(extras) as { email_id?: string };
        if (command === outbox_commands.delete_email && e.email_id) {
          update_email(e.email_id, { folder: "bin", is_read: 1 });
        } else if (e.email_id && payload) {
          const p = JSON.parse(payload) as { add_label_ids?: string[]; remove_label_ids?: string[] };
          const data: Parameters<typeof update_email>[1] = {};
          if (p.remove_label_ids?.includes("UNREAD")) data.is_read = 1;
          if (p.add_label_ids?.includes("UNREAD")) data.is_read = 0;
          if (p.remove_label_ids?.includes("STARRED")) data.is_starred = 0;
          if (p.add_label_ids?.includes("STARRED")) data.is_starred = 1;
          if (p.remove_label_ids?.includes("IMPORTANT")) data.is_flagged = 0;
          if (p.add_label_ids?.includes("IMPORTANT")) data.is_flagged = 1;
          if (p.add_label_ids?.includes("SPAM")) data.folder = "spam";
          if (p.remove_label_ids?.includes("INBOX") && !p.add_label_ids?.includes("SPAM") && !p.add_label_ids?.includes("TRASH")) data.folder = "all";
          if (Object.keys(data).length > 0) {
            update_email(e.email_id, data);
          }
        }
      } catch (optimisticErr) {
        logger.error("rpc", `outbox:enqueue: optimistic update failed for ${id}:`, optimisticErr);
      }
    }

    return { id };
  },

  [messages.outbox_cancel]: async (params: { id: string; source?: "undo" | "edit" }) => {
    logger.info("rpc", `outbox:cancel id=${params.id} source=${params.source ?? "undo"}`);
    const row = get_outbox(params.id);
    let draft_id: string | null = null;
    if (row) {
      const isQueuedSend = row.command === outbox_commands.send_email && row.status === "queued";
      if (isQueuedSend) {
        const isScheduled = !!row.scheduled_at;
        if (isScheduled && is_captured_gmail_row(row)) {
          await cancel_captured_gmail_schedule(row);
        } else if (!is_captured_gmail_row(row)) {
          const p = try_parse_json(row.payload);
          const existing = typeof p.draft_id === "string" && p.draft_id ? get_draft(p.draft_id) : null;
          if (existing) {
            // P1 — leave the raw (pill-baked) draft untouched, reopen it as-is
            draft_id = existing.id;
            logger.info("rpc", `outbox:cancel id=${row.id} keeping existing draft=${draft_id}`);
          } else {
            // P2 — recover: scheduled-edit uses fullHtml (quote as content), undo uses raw snapshot (pill restored)
            const source = params.source ?? "undo";
            draft_id = convert_to_local_draft(row, source === "edit" ? "fullHtml" : "raw");
            logger.info("rpc", `outbox:cancel id=${row.id} converted send to draft=${draft_id ?? "none"} (source=${source})`);
          }
          if (draft_id) emit_draft_refresh(row.account_id);
        }
      }
      cancel_outbox(params.id);
      emit_outbox_changed(row.account_id, row.thread_id);
    }
    return { success: true, draft_id };
  },

  [messages.outbox_delete]: async (params: EntityId) => {
    logger.info("rpc", `outbox:delete id=${params.id}`);
    const row = get_outbox(params.id);
    delete_outbox(params.id);
    if (row) emit_outbox_changed(row.account_id, row.thread_id);
    return { success: true };
  },

  [messages.outbox_list]: async (params?: { thread_id?: string; status?: string | string[] }) => {
    const rows = list_outbox_filtered(params ?? {});
    logger.info("rpc", `outbox:list count=${rows.length}`);
    return rows.map(to_wire);
  },

  [messages.outbox_get]: async (params: EntityId) => {
    const row = get_outbox(params.id);
    if (!row) return null;
    return to_wire(row);
  },

  [messages.outbox_send_now]: async (params: EntityId) => {
    logger.info("rpc", `outbox:send_now id=${params.id}`);
    const row = get_outbox(params.id);
    if (row && is_captured_gmail_row(row)) {
      const captured = try_parse_json(row.extras);
      let gmail_draft_id = captured.gmail_draft_id ?? null;
      if (!gmail_draft_id) {
        gmail_draft_id = await resolve_captured_gmail_draft_id(row.account_id, captured.gmail_message_id);
      }
      if (gmail_draft_id) {
        insert_outbox({
          id: crypto.randomUUID(),
          account_id: row.account_id,
          command: outbox_commands.draft_delete,
          payload: JSON.stringify({ gmail_draft_id }),
          status: "queued",
          created_at: Date.now(),
        });
        logger.info("rpc", `outbox:send_now id=${row.id} captured gmail send, unscheduling server draft=${gmail_draft_id}`);
      } else if (captured.gmail_message_id) {
        insert_outbox({
          id: crypto.randomUUID(),
          account_id: row.account_id,
          command: outbox_commands.delete_email,
          extras: JSON.stringify({ providerMessageId: captured.gmail_message_id }),
          status: "queued",
          created_at: Date.now(),
        });
        logger.info("rpc", `outbox:send_now id=${row.id} captured gmail send, deleting server draft message=${captured.gmail_message_id}`);
      }
    }
    clear_scheduled_at(params.id);
    if (row) emit_outbox_changed(row.account_id, row.thread_id);
    return { success: true };
  },
};
