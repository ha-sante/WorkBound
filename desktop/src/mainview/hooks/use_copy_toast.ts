import { useSetAtom } from "jotai";
import { messages } from "@/shared/rpc_messages";
import { copyToastAtom } from "../state";
import { rpc } from "../rpc";

export function useCopyToast() {
  const setCopyToast = useSetAtom(copyToastAtom);

  const copy = (text: string) => {
    rpc.request(messages.clipboard_write, { text }).catch((err: unknown) => console.error("clipboard:write", err));
    setCopyToast(text);
  };

  return { copy };
}
