import Electrobun, { ApplicationMenu, Updater, Utils } from "electrobun/bun";
import { logger } from "../utils/logger";

export async function setup_menu(getWin: () => any, url: string) {
  logger.info("app", "setup:menu");
  const channel = await Updater.localInfo.channel();
  const is_dev = channel === "dev";

  Electrobun.events.on("application-menu-clicked", (e) => {
    const action = e.data.action;
    const w = getWin();
    if (action === "reload") w.webview.executeJavascript("location.reload()");
    if (action === "force-reload") w.webview.loadURL(url);
    if (action === "toggle-dev-tools") w.webview.toggleDevTools();
    if (action === "quit") Utils.quit();
  });

  const viewSubmenu: any[] = [
    { label: "Reload", action: "reload" },
    { label: "Force Reload", action: "force-reload" },
  ];
  if (is_dev) {
    viewSubmenu.push({ type: "separator" }, { label: "Toggle Developer Tools", action: "toggle-dev-tools" });
  }
  viewSubmenu.push({ type: "separator" }, { role: "toggleFullScreen" });

  ApplicationMenu.setApplicationMenu([
    {
      submenu: [
        { label: "About WorkBound", role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "Quit", action: "quit", accelerator: "Command+Q" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: viewSubmenu,
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
      ],
    },
  ]);
}
