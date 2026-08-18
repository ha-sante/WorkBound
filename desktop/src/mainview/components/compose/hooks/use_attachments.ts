import { useCallback, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { composeMetaAtom, alertToastAtom } from "../../../state";
import { messages } from "@/shared/rpc_messages";
import { file_to_base64 } from "../../../utils/file";
import { SOFT_LIMIT } from "../editor/constants";
import { rpc } from "../../../rpc";

type UseAttachmentsParams = {
  trigger_local_save: () => void;
};

export function useAttachments({ trigger_local_save }: UseAttachmentsParams) {
  const composeState = useAtomValue(composeMetaAtom);
  const setComposeState = useSetAtom(composeMetaAtom);
  const setAlertToast = useSetAtom(alertToastAtom);

  const total_attachments_size = useMemo(
    () => composeState.attachments.reduce((sum, a) => sum + a.size, 0),
    [composeState.attachments],
  );

  const add_attachment = useCallback((data: AttachmentPayload) => {
    setComposeState(prev => ({
      ...prev,
      attachments: [...prev.attachments, { id: crypto.randomUUID(), ...data }],
    }));
    trigger_local_save();
  }, [trigger_local_save]);

  const remove_attachment = useCallback((id: string) => {
    setComposeState(prev => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
    }));
    trigger_local_save();
  }, [trigger_local_save]);

  const handle_pick_files = useCallback(async () => {
    try {
      const result = await rpc.request(messages.file_pick) as PickFilesResponse;
      const currentSize = total_attachments_size;
      let runningTotal = currentSize;
      for (const f of result.files) {
        if (f.size > SOFT_LIMIT) {
          setAlertToast({ message: `"${f.name}" exceeds the 25MB limit.`, type: "error" });
          continue;
        }
        if (runningTotal + f.size > SOFT_LIMIT) {
          setAlertToast({ message: `Adding "${f.name}" would exceed the 25MB total limit.`, type: "error" });
          continue;
        }
        runningTotal += f.size;
        add_attachment(f);
      }
    } catch (e) {
      console.error("[attachments] file:pick failed", e);
    }
  }, [total_attachments_size, add_attachment]);

  const handle_attach_files = useCallback(async (files: File[]) => {
    const currentSize = total_attachments_size;
    let runningTotal = currentSize;
    for (const file of files) {
      if (file.size > SOFT_LIMIT) {
        setAlertToast({ message: `"${file.name}" exceeds the 25MB limit.`, type: "error" });
        continue;
      }
      if (runningTotal + file.size > SOFT_LIMIT) {
        setAlertToast({ message: `Adding "${file.name}" would exceed the 25MB total limit.`, type: "error" });
        continue;
      }
      runningTotal += file.size;
      const data = await file_to_base64(file);
      add_attachment({
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        data,
        local_path: null,
        size: file.size,
      });
    }
  }, [total_attachments_size, add_attachment]);

  return {
    add_attachment,
    remove_attachment,
    handle_pick_files,
    handle_attach_files,
    total_attachments_size,
  };
}
