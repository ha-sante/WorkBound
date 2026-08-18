import { X, FileText, Image as ImageIcon } from "lucide-react";
import { format_file_size } from "../../../utils/mail_display_utils";

type Attachment = { id: string; name: string; mime_type: string; data: string; local_path: string | null; size: number };

type Props = {
  attachments: Attachment[];
  onRemove: (id: string) => void;
};

function file_icon(att: Attachment) {
  if (att.mime_type.startsWith("image/")) return <ImageIcon size={14} className="shrink-0 text-text-secondary" />;
  return <FileText size={14} className="shrink-0 text-text-secondary" />;
}

function AttachmentChips({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-slate-100 shrink-0">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1 text-xs">
          {file_icon(a)}
          <span className="text-text-secondary max-w-28 truncate">{a.name}</span>
           <span className="text-text-secondary">{format_file_size(a.size)}</span>
          <button
            onClick={() => onRemove(a.id)}
            className="text-text-secondary hover:text-red-500 transition-colors cursor-pointer ml-0.5">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default AttachmentChips;
