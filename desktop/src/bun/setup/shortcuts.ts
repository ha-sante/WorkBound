import { GlobalShortcut, Utils, type BrowserWindow } from "electrobun/bun";
import { logger } from "../utils/logger";

const show_shortcuts = ["CommandOrControl+Alt+W", "CommandOrControl+Shift+3"];

function register_show_shortcut(accelerator: string, getWin: () => BrowserWindow): void {
  const registered = GlobalShortcut.register(accelerator, () => {
    try {
      if (process.platform === "darwin") Utils.setDockIconVisible(true);
      const win = getWin();
      win.show();
      win.activate();
    } catch (e) {
      logger.warn("shortcut", `Failed to show WorkBound: ${e}`);
    }
  });

  if (!registered) {
    logger.warn("shortcut", `Failed to register ${accelerator}`);
  }
}

export function setup_shortcuts(getWin: () => BrowserWindow): void {
  for (const accelerator of show_shortcuts) {
    register_show_shortcut(accelerator, getWin);
  }
}