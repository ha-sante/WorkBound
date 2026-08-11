import { uptime } from "os";
import { get_pref, set_pref } from "../db/preferences";

export const START_IN_TRAY_LOGIN_WINDOW_SECONDS = 150;

function current_boot_epoch(): number {
  return Date.now() / 1000 - uptime();
}

export function record_manual_launch(): void {
  set_pref("general:lastManualLaunch", { boot: current_boot_epoch(), uptime: uptime() });
}

export function is_login_item_launch(sys_auto_startup: boolean): boolean {
  if (process.platform !== "darwin") return false;
  if (!sys_auto_startup) return false;
  const current_uptime = uptime();
  if (current_uptime >= START_IN_TRAY_LOGIN_WINDOW_SECONDS) return false;
  const last = get_pref("general:lastManualLaunch") as { boot?: number; uptime?: number } | null;
  const same_boot =
    !!last &&
    typeof last.boot === "number" &&
    Math.abs(last.boot - current_boot_epoch()) < 30;
  const recently_shown =
    same_boot &&
    typeof last.uptime === "number" &&
    current_uptime - last.uptime < START_IN_TRAY_LOGIN_WINDOW_SECONDS;
  return !recently_shown;
}
