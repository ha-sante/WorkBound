import { useSetAtom } from "jotai";
import { alertToastAtom } from "../state";

export function useAlertToast() {
  const setAlertToast = useSetAtom(alertToastAtom);

  const alert = (message: string, type?: "error" | "warning" | "info" | "success") => {
    setAlertToast({ message, type });
  };

  return { alert };
}