import { memo, useRef, useState, useEffect, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import EmailRow from "./email_row";
import { email_idsWithDraftsAtom, prefsAtom, labelsAtom, email_list_selection_atom, email_list_hover_atom } from "../state";
import { pref_keys } from "@/shared/pref_keys";

type LabelRenderFormat = "iconOnly" | "textOnly" | "textAndIcon";

type Props = {
  emails: EmailPreviewWire[];
  loading: boolean;
  onSelectEmail?: (email: EmailPreviewWire) => void;
  onContextMenu?: (e: React.MouseEvent, email: EmailPreviewWire) => void;
  onDeleteEmail?: (id: string) => void;
};

function Dots() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const t = setInterval(
      () => setDots((p) => (p.length >= 3 ? "" : p + ".")),
      500,
    );
    return () => clearInterval(t);
  }, []);
  return <span>{dots}</span>;
}

function EmailList({
  emails,
  loading,
  onSelectEmail,
  onContextMenu,
  onDeleteEmail,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const email_idsWithDrafts = useAtomValue(email_idsWithDraftsAtom);
  const email_list_selection = useAtomValue(email_list_selection_atom);
  const set_email_list_hover = useSetAtom(email_list_hover_atom);

  const prefs = useAtomValue(prefsAtom);
  const labels = useAtomValue(labelsAtom);
  const show_labels =
    (prefs[pref_keys.interface_show_labels] as boolean | undefined) ?? true;
  const label_render_format =
    (prefs[pref_keys.interface_label_render_format] as
      LabelRenderFormat | undefined) ?? "textOnly";

  const label_id_to_name = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of [
      ...labels.userLabels,
      ...labels.systemLabels,
      ...labels.categories,
    ]) {
      map[l.id] = l.name;
    }
    return map;
  }, [labels]);

  const label_id_to_icon = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const l of [
      ...labels.userLabels,
      ...labels.systemLabels,
      ...labels.categories,
    ]) {
      map[l.id] = l.icon_name ?? undefined;
    }
    return map;
  }, [labels]);

  const rowVirtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  useEffect(() => {
    if (email_list_selection >= 0 && email_list_selection < emails.length) {
      rowVirtualizer.scrollToIndex(email_list_selection, { align: "auto" });
    }
  }, [email_list_selection, rowVirtualizer, emails.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {emails.length === 0 ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-text-secondary">
              fetching up your mail
              <Dots />
            </p>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-text-secondary">No emails yet</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      onMouseLeave={() => set_email_list_hover(-1)}
      className="flex-1 bg-white w-full max-w-full pb-10 overflow-auto"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const email = emails[virtualItem.index];
          const draft = email_idsWithDrafts.get(email.id);
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <EmailRow
                email={email}
                hasDraft={!!draft}
                show_labels={show_labels}
                label_id_to_name={label_id_to_name}
                label_id_to_icon={label_id_to_icon}
                label_render_format={label_render_format}
                is_selected={email_list_selection === virtualItem.index}
                onHover={() => set_email_list_hover(virtualItem.index)}
                onClick={() => onSelectEmail?.(email)}
                onContextMenu={(e) => onContextMenu?.(e, email)}
                onDelete={onDeleteEmail}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(EmailList);
