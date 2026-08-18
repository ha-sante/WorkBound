import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import EmailRow from "./email_row";
import { email_idsWithDraftsAtom, email_list_hover_atom, email_list_selection_atom, labelsAtom, prefsAtom } from "../state";
import { pref_keys } from "@/shared/pref_keys";

type LabelRenderFormat = "iconOnly" | "textOnly" | "textAndIcon";

type Props = {
  rows: MailListRow[];
  loading?: boolean;
  onSelect?: (row: MailListRow) => void;
  onContextMenu?: (e: React.MouseEvent, row: MailListRow) => void;
  onDeleteEmail?: (id: string) => void;
  actions_for?: (row: MailListRow, index: number) => React.ReactNode | null | undefined;
};

const EMAIL_ROW_HEIGHT = 40;

function Dots() {
  const [dots, set_dots] = useState("");

  useEffect(() => {
    const timer = setInterval(() => set_dots((previous) => previous.length >= 3 ? "" : `${previous}.`), 500);
    return () => clearInterval(timer);
  }, []);

  return <span>{dots}</span>;
}

const EmailList = ({ rows, loading, onSelect, onContextMenu, onDeleteEmail, actions_for }: Props) => {
  const parent_ref = useRef<HTMLDivElement>(null);
  const email_ids_with_drafts = useAtomValue(email_idsWithDraftsAtom);
  const email_list_selection = useAtomValue(email_list_selection_atom);
  const set_email_list_hover = useSetAtom(email_list_hover_atom);
  const prefs = useAtomValue(prefsAtom);
  const labels = useAtomValue(labelsAtom);
  const show_labels = (prefs[pref_keys.interface_show_labels] as boolean | undefined) ?? true;
  const label_render_format = (prefs[pref_keys.interface_label_render_format] as LabelRenderFormat | undefined) ?? "textOnly";

  const label_id_to_name = useMemo(() => {
    const map: Record<string, string> = {};
    for (const label of [...labels.userLabels, ...labels.systemLabels, ...labels.categories]) {
      map[label.id] = label.name;
    }
    return map;
  }, [labels]);

  const label_id_to_icon = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const label of [...labels.userLabels, ...labels.systemLabels, ...labels.categories]) {
      map[label.id] = label.icon_name ?? undefined;
    }
    return map;
  }, [labels]);

  const row_virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent_ref.current,
    estimateSize: () => EMAIL_ROW_HEIGHT,
    overscan: 5,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  useEffect(() => {
    if (email_list_selection >= 0 && email_list_selection < rows.length) {
      row_virtualizer.scrollToIndex(email_list_selection, { align: "auto" });
    }
  }, [email_list_selection, row_virtualizer, rows.length]);

  if (loading || rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-text-secondary">No emails yet<Dots /></p>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div
      ref={parent_ref}
      onMouseLeave={() => set_email_list_hover(-1)}
      className="flex-1 bg-white w-full max-w-full pb-10 overflow-auto">
      <div style={{ height: `${row_virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
        {row_virtualizer.getVirtualItems().map((virtual_item) => {
          const index = virtual_item.index;
          const row = rows[index];
          if (!row) return null;
          const draft = email_ids_with_drafts.get(row.id);
          return (
            <div
              key={virtual_item.key}
              ref={row_virtualizer.measureElement}
              data-index={virtual_item.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtual_item.start}px)`,
              }}>
              <EmailRow
                row={row}
                hasDraft={!!draft}
                show_labels={show_labels}
                label_id_to_name={label_id_to_name}
                label_id_to_icon={label_id_to_icon}
                label_render_format={label_render_format}
                is_selected={email_list_selection === index}
                onHover={() => set_email_list_hover(index)}
                onClick={() => onSelect?.(row)}
                onContextMenu={(event) => onContextMenu?.(event, row)}
                onDelete={onDeleteEmail}
                actions={actions_for?.(row, index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(EmailList);
