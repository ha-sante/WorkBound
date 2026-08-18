import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  command_k_modal_open_atom,
  composeMetaAtom,
  currentMailViewAtom,
  currentThreadViewAtom,
  settings_open_atom,
  email_list_selection_atom,
  compose_actions_atom,
  command_k_modal_request_atom,
} from "../state";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { commands, surface_of, command_glyph, type Command } from "../hooks/use_commands";
import { parse_schedule_candidates, humanize_time, expand_schedule_query } from "../utils/schedule";

type Row = {
  id: string;
  label: string;
  hint?: string;
  section: "act" | "cmd";
  run: () => void;
};

type ActDef = { id: string; label: string; aliases: string[] };

function ordinal_day(day: number): string {
  const suffix = day % 10 === 1 && day % 100 !== 11
    ? "st"
    : day % 10 === 2 && day % 100 !== 12
      ? "nd"
      : day % 10 === 3 && day % 100 !== 13
        ? "rd"
        : "th";
  return `${day}${suffix}`;
}

function format_reminder_candidate(ts: number): { label: string; time: string } {
  const date = new Date(ts);
  const now = new Date();
  const today = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const is_tomorrow = date.toDateString() === tomorrow.toDateString();
  const label = today
    ? "Today"
    : is_tomorrow
      ? "Tomorrow"
      : `${ordinal_day(date.getDate())} - ${date.toLocaleDateString([], { weekday: "long" })}`;
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  return { label, time };
}

function format_schedule_candidate(ts: number): { label: string; hint: string } {
  const date = new Date(ts);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const is_today = date.toDateString() === now.toDateString();
  const is_tomorrow = date.toDateString() === tomorrow.toDateString();
  const label = is_today
    ? "Later today"
    : is_tomorrow
      ? "Tomorrow"
      : date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const date_label = is_today
    ? "Today"
    : is_tomorrow
      ? "Tomorrow"
      : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  return { label, hint: `${date_label} at ${time}` };
}

const ACT_DEFS: Record<string, ActDef> = {
  send: { id: "send", label: "Send now", aliases: ["send", "send now"] },
  "send-later": { id: "send-later", label: "Send later", aliases: ["send later", "schedule", "schedule send"] },
  "discard-draft": { id: "discard-draft", label: "Discard draft", aliases: ["discard", "discard draft", "delete draft"] },
  "save-exit": { id: "save-exit", label: "Save & close", aliases: ["save and exit", "save & close", "save close"] },
  attach: { id: "attach", label: "Attach file", aliases: ["attach", "attach file", "add attachment"] },
  reply: { id: "reply", label: "Reply", aliases: ["reply", "reply to this"] },
  "reply-all": { id: "reply-all", label: "Reply all", aliases: ["reply all", "reply to all"] },
  forward: { id: "forward", label: "Forward", aliases: ["forward", "forward this"] },
  delete: { id: "delete", label: "Delete this email", aliases: ["delete", "delete this", "remove", "trash"] },
  archive: { id: "archive", label: "Archive this email", aliases: ["archive", "archive this"] },
  mark_spam: { id: "mark_spam", label: "Report spam", aliases: ["report spam", "spam this", "spam"] },
  toggle_starred: { id: "toggle_starred", label: "Star this email", aliases: ["star", "star this"] },
  toggle_important: { id: "toggle_important", label: "Mark important", aliases: ["important", "mark important", "flag"] },
  mark_unread: { id: "mark_unread", label: "Mark unread", aliases: ["mark unread", "mark as unread", "unread"] },
  block_sender: { id: "block_sender", label: "Block sender", aliases: ["block", "block sender"] },
};

const VIEWER_BASE_IDS = ["reply", "reply-all", "forward"];
const VIEWER_ACT_IDS = ["reply", "reply-all", "forward", "delete", "archive", "mark_spam", "toggle_starred", "toggle_important", "mark_unread", "block_sender"];

function matches(query: string, label: string, aliases?: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (label.toLowerCase().includes(q)) return true;
  if (aliases?.some((a) => a.toLowerCase().includes(q))) return true;
  return false;
}

function command_applicable(c: Command, surface: string, selection: number, phase: string): boolean {
  if (c.surface === "any") return true;
  if (c.surface === surface) {
    if (c.selection === true && surface === "shell" && selection === -1) return false;
    if (c.selection === false && surface === "shell" && selection !== -1) return false;
    if (c.phase && c.phase !== phase) return false;
    return true;
  }
  if ((surface === "viewer" || surface === "compose") && c.surface === "shell") {
    if (c.selection === true && selection === -1) return false;
    if (c.selection === false && selection !== -1) return false;
    if (c.phase && c.phase !== phase) return false;
    return true;
  }
  return false;
}

function key_hint(c: Command): string | undefined {
  return command_glyph(c);
}

type Props = {
  execute: (id: string) => void;
  views?: FilteredViewWire[];
  scheduled_count?: number;
  reminders_count?: number;
};

function CommandKModal({ execute, views, scheduled_count, reminders_count }: Props) {
  const [open, setOpen] = useAtom(command_k_modal_open_atom);
  const [reminder_request, set_reminder_request] = useAtom(command_k_modal_request_atom);
  const compose = useAtomValue(composeMetaAtom);
  const current_view = useAtomValue(currentMailViewAtom);
  const current_thread_view = useAtomValue(currentThreadViewAtom);
  const settings_open = useAtomValue(settings_open_atom);
  const selection = useAtomValue(email_list_selection_atom);
  const compose_actions = useAtomValue(compose_actions_atom);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const surface = surface_of(compose.phase, !!current_view, !!current_thread_view, settings_open);

  const run_reminder = useCallback((remind_at: number) => {
    if (!reminder_request || reminder_request.mode !== "reminder") return;
    const request = reminder_request.reminder_id
      ? rpc.request(messages.reminders_update, {
        id: reminder_request.reminder_id,
        account_id: reminder_request.account_id,
        remind_at,
      })
      : rpc.request(messages.reminders_create, {
        account_id: reminder_request.account_id,
        email_id: reminder_request.email_id,
        thread_id: reminder_request.thread_id,
        remind_at,
      });
    request.catch(() => {});
  }, [reminder_request]);

  const unique_commands = useMemo(() => {
    const map = new Map<string, Command>();
    for (const c of commands) {
      const existing = map.get(c.id);
      const score = (c: Command) => (c.surface === surface ? 2 : c.surface === "any" ? 1 : 0);
      if (!existing || score(c) > score(existing)) map.set(c.id, c);
    }
    return [...map.values()];
  }, [surface]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const act: Row[] = [];

    if (reminder_request?.mode === "reminder") {
      const default_queries = [
        { query: "later today", label: "Later today" },
        { query: "tomorrow", label: "Tomorrow" },
        { query: "this weekend", label: "This weekend" },
        { query: "next week", label: "Next week" },
      ];
      const candidates = q
        ? parse_schedule_candidates(query)
        : default_queries.flatMap((default_query) => parse_schedule_candidates(default_query.query).slice(0, 1).map((candidate) => ({ ...candidate, label: default_query.label })));
      return candidates.map((candidate) => ({
        id: `reminder:${candidate.ts}`,
        label: format_reminder_candidate(candidate.ts).label,
        hint: format_reminder_candidate(candidate.ts).time,
        section: "act",
        run: () => run_reminder(candidate.ts),
      }));
    }

    if (reminder_request?.mode === "schedule") {
      const default_queries = [
        { query: "in 1 hour", label: "In 1 hour" },
        { query: "in 2 hours", label: "In 2 hours" },
        { query: "tomorrow at 9", label: "Tomorrow morning" },
        { query: "next monday at 9", label: "Next Monday morning" },
      ];
      const candidates = q
        ? parse_schedule_candidates(query).map((candidate) => ({ ...candidate, label: `Send ${format_schedule_candidate(candidate.ts).label}` }))
        : default_queries.flatMap((default_query) => parse_schedule_candidates(default_query.query).slice(0, 1).map((candidate) => ({ ...candidate, label: default_query.label })));
      return candidates.map((candidate) => ({
        id: `schedule-send:${candidate.ts}`,
        label: candidate.label,
        hint: format_schedule_candidate(candidate.ts).hint,
        section: "act",
        run: () => compose_actions.send_at(candidate.ts),
      }));
    }

    if (surface === "compose") {
      if (q) {
        for (const c of parse_schedule_candidates(q)) {
          act.push({
            id: "schedule-send:" + c.ts,
            label: "Send " + c.label,
            hint: humanize_time(c.ts),
            section: "act",
            run: () => compose_actions.send_at(c.ts),
          });
        }
      }
    } else if (surface === "viewer") {
      const pool = q ? VIEWER_ACT_IDS : VIEWER_BASE_IDS;
      for (const id of pool) {
        const def = ACT_DEFS[id];
        if (matches(query, def.label, def.aliases)) {
          act.push({ id: def.id, label: def.label, section: "act", run: () => execute(def.id) });
        }
      }
    }

    const cmd: Row[] = unique_commands
      .filter((c) => c.id !== "move-up" && c.id !== "move-down" && c.id !== "command-bar")
      .filter((c) => command_applicable(c, surface, selection, compose.phase))
      .filter((c) => matches(query, c.label, c.aliases))
      .map((c) => ({ id: c.id, label: c.label, hint: key_hint(c), section: "cmd", run: () => execute(c.id) }));

    const nav: Row[] = [];
    if ((scheduled_count ?? 0) > 0 && matches(query, "Go to Scheduled", ["scheduled", "scheduled emails", "s c"])) {
      nav.push({ id: "goto-scheduled", label: "Go to Scheduled", hint: "s c", section: "cmd", run: () => execute("goto-scheduled") });
    }
    if ((reminders_count ?? 0) > 0 && matches(query, "Go to Reminders", ["reminders", "reminder emails", "r e"])) {
      nav.push({ id: "goto-reminders", label: "Go to Reminders", hint: "r e", section: "cmd", run: () => execute("goto-reminders") });
    }
    for (const [index, view] of (views ?? []).entries()) {
      if (matches(query, view.name, [`p${index + 1}`])) {
        nav.push({ id: `goto-view:${view.id}`, label: view.name, hint: `p${index + 1}`, section: "cmd", run: () => execute(`goto-view:${view.id}`) });
      }
    }

    return [...act, ...cmd, ...nav];
  }, [surface, query, unique_commands, selection, compose.phase, compose_actions, execute, reminder_request, run_reminder, views, scheduled_count, reminders_count]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    set_reminder_request(null);
  };

  const on_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      const expanded = expand_schedule_query(query);
      if (expanded) setQuery(expanded);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlight];
      if (row) {
        row.run();
        close();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  let prev_section: Row["section"] | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/10 pt-[32vh]"
      onMouseDown={close}
    >
      <div
        className="w-[560px] max-h-[480px] rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
          <div className="flex items-center border-b border-slate-100 px-4">
          {reminder_request?.mode === "reminder" && (
            <span className="shrink-0 pr-2 text-sm font-semibold text-text-primary">Later</span>
          )}
          {reminder_request?.mode === "schedule" && (
            <span className="shrink-0 pr-2 text-sm font-semibold text-text-primary">Send Later</span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={on_key_down}
            placeholder={reminder_request?.mode === "reminder" ? "When? e.g. tomorrow at 9" : reminder_request?.mode === "schedule" ? "When should this send? e.g. Friday at 2" : "Type a command or action…"}
            className="w-full py-3 text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {rows.length === 0 && !reminder_request && (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No matches</div>
          )}
          {rows.length === 0 && reminder_request?.mode === "schedule" && (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">Try a time like "tomorrow at 3"</div>
          )}
          {rows.map((row, i) => {
            const show_header = row.section !== prev_section;
            prev_section = row.section;
            return (
              <div key={row.section + ":" + row.id}>
                {show_header && (
                  <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {row.section === "act" ? "Act" : "Commands"}
                  </div>
                )}
                <button
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    row.run();
                    close();
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm cursor-pointer ${
                    i === highlight ? "bg-gray-100 text-text-primary" : "text-text-primary"
                  }`}
                >
                  <span>{row.label}</span>
                  {row.hint && <span className="text-xs text-slate-400">{row.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CommandKModal;
