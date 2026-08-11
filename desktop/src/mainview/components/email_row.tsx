import { memo } from "react";
import { ChevronRight, icons as lucide_icons } from "lucide-react";

import { parse_email_string } from "./compose/editor/contact_input";
import { Tooltip } from "./ui/tooltip";
import { format_time } from "@/shared/datetime";

type LabelRenderFormat = "iconOnly" | "textOnly" | "textAndIcon";

type Props = {
  email: EmailPreviewWire;
  hasDraft?: boolean;
  show_labels?: boolean;
  label_id_to_name?: Record<string, string>;
  label_id_to_icon?: Record<string, string | undefined>;
  label_render_format?: LabelRenderFormat;
  onClick?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDelete?: (id: string) => void;
  is_selected?: boolean;
  onHover?: () => void;
};

function EmailRow({
  email,
  hasDraft,
  show_labels,
  label_id_to_name,
  label_id_to_icon,
  label_render_format,
  onClick,
  onContextMenu,
  onDelete,
  is_selected,
  onHover,
}: Props) {
  const render_format = label_render_format ?? "textOnly";

  const normalize_label = (value: string) =>
    value
      // Remove common invisible characters some label sources may include.
      .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
      .trim()
      .toLowerCase();

  const excluded_label_ids = new Set(
    [
      // System levels: never show in the labels chip column.
      "inbox",
      "sent",
      "draft",
      "trash",
      "spam",
      "unread",
      "starred",
      "important",
      "chat",

      // Some sources may include the rendered name instead of the id.
      // Gmail categories display names.
      "category_personal",
      "category_social",
      "personal",
      "social",

      "category_promotions",
      "category_updates",
      "category_forums",
      "promotions",
      "updates",
      "forums",

      // Defensive: a UI-only token sometimes shows up as a label.
      "yellow_star",
    ].map((label_id) => label_id.toLowerCase()),
  );

  const name =
    email.folder === "drafts"
      ? (() => {
          const parsed = parse_email_string(email.toAddr || "");
          if (parsed.length === 0) return "No Recipients";
          return parsed[0].name || parsed[0].email;
        })()
      : email.from_name || email.from_address || "Unknown";

  const visible_labels =
    email.labels && email.labels.length > 0
      ? email.labels
          .filter((id) => {
            const normalized_id = normalize_label(id);
            const should_exclude = excluded_label_ids.has(normalized_id);

            // Defensive: never render any Gmail CATEGORY_* tokens as chips.
            return !(should_exclude || normalized_id.startsWith("category_"));
          })
          .slice(0, 2)
      : [];

  return (
    <div
      className={`group relative flex items-center gap-[6px] px-5 py-2 cursor-pointer w-full transition-colors hover:bg-gray-50 ${is_selected ? "bg-gray-100 hover:bg-gray-100" : ""}`}
      onClick={() => onClick?.(email.id)}
      onMouseEnter={() => onHover?.()}
      onContextMenu={(e) => onContextMenu?.(e)}
      data-ctx="email"
    >
      {email.is_flagged === 1 && (
        <Tooltip content="Important" side="top" align="center">
          <ChevronRight
            size={14}
            strokeWidth={3}
            className="absolute left-1 top-1/2 -translate-y-1/2 text-fuchsia-400"
          />
        </Tooltip>
      )}
      <span
        className={`text-sm truncate min-w-0 w-3/12 pr-3 ${
          email.is_read ? "" : "font-semibold text-slate-900"
        }`}
      >
        {name}
        {email.thread_message_count != null &&
          email.thread_message_count > 1 && (
            <Tooltip content="Part of a thread" side="top" align="center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block align-middle ml-1" />
            </Tooltip>
          )}
        {hasDraft && (
          <Tooltip content="Has a draft" side="top" align="center">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block align-middle ml-1" />
          </Tooltip>
        )}
        {email.is_starred === 1 && (
          <Tooltip content="Starred" side="top" align="center">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block align-middle ml-1" />
          </Tooltip>
        )}
      </span>

      <div className="text-xs text-text-secondary min-w-0 w-7/12 flex items-center gap-[6px]">
        <span className="min-w-0 flex-1 truncate">
          {email.subject && (
            <span className="font-medium text-text-primary">
              {email.subject}
            </span>
          )}
          {email.subject && email.snippet && <span> </span>}
          {email.snippet && <span>{email.snippet}</span>}
        </span>

        {show_labels && visible_labels.length > 0 && (
          <div className="flex items-center gap-1 flex-nowrap overflow-hidden whitespace-nowrap shrink-0">
            {visible_labels.map((id) => (
              <Tooltip
                key={id}
                content={label_id_to_name?.[id] ?? id}
                side="top"
                align="center"
              >
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-black/[0.06] text-text-secondary truncate max-w-[110px] inline-flex items-center gap-1">
                  {(() => {
                    const label_name = label_id_to_name?.[id] ?? id;
                    const icon_name = label_id_to_icon?.[id];
                    const IconComp = icon_name
                      ? (lucide_icons as Record<string, any>)[icon_name]
                      : null;

                    if (render_format === "iconOnly") {
                      return IconComp ? (
                        <IconComp
                          size={12}
                          className="shrink-0 text-text-secondary"
                        />
                      ) : (
                        label_name
                      );
                    }

                    if (render_format === "textAndIcon") {
                      return IconComp ? (
                        <>
                          <IconComp
                            size={12}
                            className="shrink-0 text-text-secondary"
                          />
                          <span className="truncate">{label_name}</span>
                        </>
                      ) : (
                        <span className="truncate">{label_name}</span>
                      );
                    }

                    return <span className="truncate">{label_name}</span>;
                  })()}
                </span>
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      <span className="text-xs text-text-secondary shrink-0 ml-auto tabular-nums w-1/12 text-left">
        {format_time(email.sent_at || email.received_at)}
      </span>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(email.id);
          }}
          className="opacity-0 group-hover:opacity-100 ml-2 text-red-400 hover:text-red-600 transition-opacity text-sm cursor-pointer shrink-0"
          title="Delete draft">
          ×
        </button>
      )}
    </div>
  );
}

export default memo(EmailRow);
