import { useEffect, useRef, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentMailComposeAtom,
  currentMailViewAtom,
  currentThreadViewAtom,
  email_list_selection_atom,
  email_list_hover_atom,
  settings_open_atom,
  search_focus_request_atom,
  search_close_request_atom,
  filter_bar_open_atom,
  folderAtom,
  active_filtered_view_atom,
  compose_actions_atom,
  command_k_modal_open_atom,
} from "../state";

type Mods = "none" | "cmd" | "shift";
type Surface = "shell" | "viewer" | "compose" | "modal" | "any";

type SequenceBranch = { key: string; id?: string };

type Command = {
  id: string;
  surface: Surface;
  key: string;
  alt_keys?: string[];
  mods?: Mods;
  selection?: boolean | "any";
  quiet?: boolean;
  sequence?: SequenceBranch[];
  phase?: string;
  label: string;
  aliases?: string[];
};

const SEQUENCE_WINDOW_MS = 300;

const commands: Command[] = [
  // Group 1 — Movements & Triggers (shell)
  { id: "move-up", surface: "shell", key: "ArrowUp", label: "Move up" },
  { id: "move-down", surface: "shell", key: "ArrowDown", label: "Move down" },
  { id: "open-email", surface: "shell", key: "Enter", selection: true, label: "Open email", aliases: ["open email", "open message", "open"] },
  { id: "escape-selection", surface: "shell", key: "Escape", label: "Clear selection", aliases: ["clear selection", "deselect"] },
  { id: "command-bar", surface: "any", key: "k", mods: "cmd", label: "Command palette", aliases: ["command palette", "palette", "command k"] },
  { id: "search", surface: "shell", key: "/", label: "Search", aliases: ["search mail", "search emails", "find email", "find mail"] },
  { id: "compose", surface: "shell", key: "c", label: "Compose new email", aliases: ["new email", "new message", "compose", "write email", "compose new"] },

  // Group 1 — folder jumps (two-key sequences, no row highlighted)
  { id: "goto-inbox", surface: "shell", key: "i", selection: false, sequence: [{ key: "n" }], quiet: true, label: "Go to Inbox", aliases: ["go to inbox", "show inbox", "open inbox", "inbox"] },
  { id: "goto-drafts", surface: "shell", key: "d", selection: false, sequence: [{ key: "r" }], quiet: true, label: "Go to Drafts", aliases: ["go to drafts", "show drafts", "drafts"] },
  { id: "goto-bin", surface: "shell", key: "b", selection: false, sequence: [{ key: "i" }], quiet: true, label: "Go to Bin", aliases: ["go to bin", "go to trash", "trash", "bin"] },

  // Group 1 — bare features (no highlighted row)
  { id: "settings", surface: "shell", key: "s", selection: false, sequence: [{ key: "e", id: "goto-sent" }, { key: "p", id: "goto-spam" }], label: "Open Settings", aliases: ["open settings", "settings", "preferences"] },
  { id: "filter", surface: "shell", key: "f", selection: false, label: "Toggle filters", aliases: ["filters", "show filters", "filter"] },
  { id: "reload", surface: "shell", key: "r", selection: false, label: "Check for mail", aliases: ["refresh", "check mail", "check for mail", "reload"] },

  // Group 3 — active list item actions (require highlighted row, fire immediately)
  { id: "toggle_starred", surface: "shell", key: "s", selection: true, label: "Toggle star", aliases: ["star", "star this", "toggle star"] },
  { id: "mark_read", surface: "shell", key: "r", selection: true, label: "Mark as read", aliases: ["mark read", "mark as read"] },
  { id: "mark_unread", surface: "shell", key: "u", selection: true, label: "Mark as unread", aliases: ["mark unread", "mark as unread", "unread"] },
  { id: "block_sender", surface: "shell", key: "b", selection: true, label: "Block sender", aliases: ["block", "block sender"] },
  { id: "mark_spam", surface: "shell", key: "!", mods: "shift", sequence: [{ key: "!", id: "mark_phishing" }], selection: true, label: "Report spam", aliases: ["report spam", "spam this", "mark spam"] },
  { id: "toggle_important", surface: "shell", key: "i", selection: true, label: "Toggle important", aliases: ["important", "mark important", "flag"] },
  { id: "archive", surface: "shell", key: "e", selection: true, label: "Archive", aliases: ["archive", "archive this", "archive email"] },
  { id: "delete", surface: "shell", key: "Delete", alt_keys: ["Backspace"], selection: true, label: "Delete", aliases: ["delete", "delete this", "delete email", "remove", "trash this"] },

  // Group 2/5 — Viewer movement & actions
  { id: "prev-email", surface: "viewer", key: "ArrowUp", label: "Previous email", aliases: ["previous email", "previous message", "previous"] },
  { id: "next-email", surface: "viewer", key: "ArrowDown", label: "Next email", aliases: ["next email", "next message", "next"] },
  { id: "close-viewer", surface: "viewer", key: "Escape", label: "Back to list", aliases: ["back to list", "close", "go back", "close viewer"] },
  { id: "reply", surface: "viewer", key: "r", sequence: [{ key: "a", id: "reply-all" }], label: "Reply", aliases: ["reply", "reply to this"] },
  { id: "forward", surface: "viewer", key: "f", label: "Forward", aliases: ["forward", "forward this"] },
  { id: "delete", surface: "viewer", key: "Delete", alt_keys: ["Backspace"], label: "Delete", aliases: ["delete", "delete this", "delete email", "remove", "trash this"] },
  { id: "archive", surface: "viewer", key: "e", label: "Archive", aliases: ["archive", "archive this", "archive email"] },
  { id: "mark_spam", surface: "viewer", key: "!", mods: "shift", sequence: [{ key: "!", id: "mark_phishing" }], label: "Report spam", aliases: ["report spam", "spam this", "mark spam"] },
  { id: "toggle_starred", surface: "viewer", key: "s", label: "Toggle star", aliases: ["star", "star this", "toggle star"] },
  { id: "toggle_important", surface: "viewer", key: "i", label: "Toggle important", aliases: ["important", "mark important", "flag"] },
  { id: "mark_unread", surface: "viewer", key: "u", label: "Mark as unread", aliases: ["mark unread", "mark as unread", "unread"] },
  { id: "block_sender", surface: "viewer", key: "b", label: "Block sender", aliases: ["block", "block sender"] },

  // Group 4 — Composer actions
  { id: "send", surface: "compose", key: "s", mods: "cmd", label: "Send email", aliases: ["send", "send now", "send email"] },
  { id: "discard-draft", surface: "compose", key: "d", mods: "cmd", label: "Discard draft", aliases: ["discard", "discard draft", "delete draft"] },
  { id: "attach", surface: "compose", key: "@", mods: "cmd", label: "Attach file", aliases: ["attach", "attach file", "add attachment", "attachment"] },
  { id: "send-later", surface: "compose", key: "l", mods: "cmd", label: "Send later", aliases: ["send later", "schedule", "schedule send"] },
  { id: "undo-send", surface: "compose", key: "u", mods: "cmd", phase: "sent", label: "Undo send", aliases: ["undo send", "undo"] },
  { id: "save-exit", surface: "compose", key: "Escape", label: "Save & close", aliases: ["save and exit", "save & close", "save and close", "save close"] },
];

const surface_of = (
  phase: string,
  view_open: boolean,
  thread_open: boolean,
  settings_open: boolean,
): Surface => {
  if (settings_open) return "modal";
  if (phase !== "closed") return "compose";
  if (view_open || thread_open) return "viewer";
  return "shell";
};

const is_mac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

const mods_of = (e: KeyboardEvent): Mods => {
  const primary = is_mac ? e.metaKey : e.ctrlKey;
  const secondary = is_mac ? e.ctrlKey : e.metaKey;
  if (primary && !secondary && !e.altKey) return "cmd";
  if (e.shiftKey && !primary && !secondary && !e.altKey) return "shift";
  return "none";
};

const mods_match = (actual: Mods, expected: Mods | undefined): boolean =>
  expected === undefined ? actual === "none" : actual === expected;

const command_glyph = (c: Command): string | undefined => {
  const primary = is_mac ? "⌘" : "Ctrl+";
  if (c.surface === "any") return primary + "K";
  if (c.mods === "cmd") return primary + c.key.toUpperCase();
  if (c.mods === "shift") return "⇧" + c.key;
  if (c.sequence) return c.key + " " + c.sequence.map((b) => b.key).join(" ");
  const named: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc", Enter: "⏎" };
  return named[c.key] ?? c.key;
};

const is_editable_target = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.closest("input, textarea, [contenteditable]") !== null);

type UseCommandsOptions = {
  emails?: EmailPreviewWire[];
  on_open_email?: (email: EmailPreviewWire) => void;
  on_reload?: () => void;
  on_compose?: () => void;
  on_list_action?: (email: EmailPreviewWire, action: string, value?: number) => void;
  on_viewer_action?: (email: EmailPreviewWire, action: string, value?: number) => void;
  on_prev_email?: () => void;
  on_next_email?: () => void;
  on_close_viewer?: () => void;
  on_reply?: (mode: "reply" | "reply_all" | "forward") => void;
};

export function use_commands(options: UseCommandsOptions = {}) {
  const compose = useAtomValue(currentMailComposeAtom);
  const current_view = useAtomValue(currentMailViewAtom);
  const current_thread_view = useAtomValue(currentThreadViewAtom);
  const settings_open = useAtomValue(settings_open_atom);
  const selection = useAtomValue(email_list_selection_atom);
  const hover = useAtomValue(email_list_hover_atom);
  const set_selection = useSetAtom(email_list_selection_atom);
  const set_settings_open = useSetAtom(settings_open_atom);
  const set_filter_open = useSetAtom(filter_bar_open_atom);
  const set_search_focus = useSetAtom(search_focus_request_atom);
  const set_search_close = useSetAtom(search_close_request_atom);
  const set_current_folder = useSetAtom(folderAtom);
  const set_active_view_id = useSetAtom(active_filtered_view_atom);
  const compose_actions = useAtomValue(compose_actions_atom);
  const palette_open = useAtomValue(command_k_modal_open_atom);
  const set_palette_open = useSetAtom(command_k_modal_open_atom);
  const pending = useRef<{ command: Command; timer: ReturnType<typeof setTimeout> } | null>(null);

  const emails_ref = useRef(options.emails ?? []);
  emails_ref.current = options.emails ?? [];
  const on_open_email_ref = useRef(options.on_open_email);
  on_open_email_ref.current = options.on_open_email;
  const on_reload_ref = useRef(options.on_reload);
  on_reload_ref.current = options.on_reload;
  const on_compose_ref = useRef(options.on_compose);
  on_compose_ref.current = options.on_compose;
  const on_list_action_ref = useRef(options.on_list_action);
  on_list_action_ref.current = options.on_list_action;
  const on_viewer_action_ref = useRef(options.on_viewer_action);
  on_viewer_action_ref.current = options.on_viewer_action;
  const on_prev_email_ref = useRef(options.on_prev_email);
  on_prev_email_ref.current = options.on_prev_email;
  const on_next_email_ref = useRef(options.on_next_email);
  on_next_email_ref.current = options.on_next_email;
  const on_close_viewer_ref = useRef(options.on_close_viewer);
  on_close_viewer_ref.current = options.on_close_viewer;
  const on_reply_ref = useRef(options.on_reply);
  on_reply_ref.current = options.on_reply;
  const selection_ref = useRef(selection);
  selection_ref.current = selection;
  const hover_ref = useRef(hover);
  hover_ref.current = hover;

  const viewer_email = current_thread_view
    ? current_thread_view.emails[current_thread_view.activeIndex]?.email ?? null
    : current_view?.email ?? null;
  const viewer_email_ref = useRef(viewer_email);
  viewer_email_ref.current = viewer_email;

  const compose_actions_ref = useRef(compose_actions);
  compose_actions_ref.current = compose_actions;

  const execute_ref = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    const base_surface = surface_of(
      compose.phase,
      !!current_view,
      !!current_thread_view,
      false,
    );
    const surface = settings_open || palette_open ? "modal" : base_surface;

    const clear_pending = () => {
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current = null;
      }
    };

    const run_action = (action: string) => {
      const emails = emails_ref.current;
      const sel = selection_ref.current;
      const hover_anchor = (): number => {
        const h = hover_ref.current;
        if (h >= 0 && h < emails.length) return h;
        return -1;
      };
      const goto_folder = (folder: string) => {
        set_active_view_id(null);
        set_current_folder(folder);
      };
      switch (action) {
        case "move-down":
          set_selection((s) => {
            if (emails.length === 0) return -1;
            if (s === -1) {
              const anchor = hover_anchor();
              return anchor !== -1 ? anchor : 0;
            }
            return Math.min(s + 1, emails.length - 1);
          });
          return;
        case "move-up":
          set_selection((s) => {
            if (s === -1) {
              const anchor = hover_anchor();
              return anchor !== -1 ? anchor : -1;
            }
            return Math.max(s - 1, 0);
          });
          return;
        case "escape-selection":
          set_selection(-1);
          set_search_close((n) => n + 1);
          return;
        case "open-email": {
          const email = emails[sel];
          if (email) on_open_email_ref.current?.(email);
          return;
        }
        case "settings":
          set_settings_open(true);
          return;
        case "filter":
          set_filter_open((v) => !v);
          return;
        case "reload":
          on_reload_ref.current?.();
          return;
        case "compose":
          on_compose_ref.current?.();
          return;
        case "search":
          set_search_focus((n) => n + 1);
          return;
        case "goto-inbox":
          goto_folder("inbox");
          return;
        case "goto-sent":
          goto_folder("sent");
          return;
        case "goto-spam":
          goto_folder("spam");
          return;
        case "goto-drafts":
          goto_folder("drafts");
          return;
        case "goto-bin":
          goto_folder("bin");
          return;
        case "prev-email":
          on_prev_email_ref.current?.();
          return;
        case "next-email":
          on_next_email_ref.current?.();
          return;
        case "close-viewer":
          on_close_viewer_ref.current?.();
          return;
        case "reply":
          on_reply_ref.current?.("reply");
          return;
        case "reply-all":
          on_reply_ref.current?.("reply_all");
          return;
        case "forward":
          on_reply_ref.current?.("forward");
          return;
        case "toggle_starred":
        case "toggle_important":
        case "mark_read":
        case "mark_unread":
        case "block_sender":
        case "mark_spam":
        case "mark_phishing":
        case "archive":
        case "delete": {
          const email = base_surface === "viewer" ? viewer_email_ref.current : emails[sel];
          if (!email) return;
          const resolved = action === "mark_spam" && email.folder === "spam" ? "not_spam" : action;
          const value =
            resolved === "toggle_starred"
              ? email.is_starred !== 1 ? 1 : 0
              : resolved === "toggle_important"
                ? email.is_flagged !== 1 ? 1 : 0
                : undefined;
          if (base_surface === "viewer") {
            on_viewer_action_ref.current?.(email, resolved, value);
          } else {
            on_list_action_ref.current?.(email, resolved, value);
          }
          return;
        }
        case "send":
          compose_actions_ref.current.send();
          return;
        case "discard-draft":
          compose_actions_ref.current.discard();
          return;
        case "attach":
          compose_actions_ref.current.attach();
          return;
        case "send-later":
          compose_actions_ref.current.send_later();
          return;
        case "undo-send":
          compose_actions_ref.current.undo_send();
          return;
        case "save-exit":
          compose_actions_ref.current.close();
          return;
        case "command-bar":
          if (!settings_open) set_palette_open((v) => !v);
          return;
        default:
          console.log("[use_commands]", { event: "action", surface: base_surface, id: action });
      }
    };

    const on_keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const editable = is_editable_target(e.target);
      const mods = mods_of(e);
      const selection_active = selection_ref.current !== -1;

      if (pending.current) {
        const pc = pending.current.command;
        const branch = pc.sequence?.find((b) => e.key.toLowerCase() === b.key.toLowerCase());
        if (pc.surface === surface && !editable && branch) {
          e.preventDefault();
          clear_pending();
          run_action(branch.id ?? pc.id);
          return;
        }
      }

      const command = commands.find(
        (c) =>
          (c.surface === "any" || c.surface === surface) &&
          (c.key === e.key || c.alt_keys?.includes(e.key)) &&
          mods_match(mods, c.mods) &&
          (c.selection === undefined ||
            c.selection === "any" ||
            c.selection === selection_active) &&
          (c.phase === undefined || c.phase === compose.phase),
      );
      if (!command) return;

      if (editable && command.mods !== "cmd" && command.key !== "Escape") {
        return;
      }

      if (command.sequence) {
        e.preventDefault();
        clear_pending();
        pending.current = {
          command,
          timer: setTimeout(() => {
            if (!command.quiet) {
              run_action(command.id);
            }
            pending.current = null;
          }, SEQUENCE_WINDOW_MS),
        };
        return;
      }

      e.preventDefault();
      clear_pending();
      run_action(command.id);
    };

    const on_blur = () => clear_pending();

    execute_ref.current = run_action;

    window.addEventListener("keydown", on_keydown, true);
    window.addEventListener("blur", on_blur);
    return () => {
      clear_pending();
      window.removeEventListener("keydown", on_keydown, true);
      window.removeEventListener("blur", on_blur);
    };
  }, [compose.phase, current_view, current_thread_view, settings_open, palette_open]);

  const execute = useCallback((id: string) => {
    execute_ref.current(id);
  }, []);

  return { execute };
}

export { commands, surface_of, command_glyph };
export type { Command };
