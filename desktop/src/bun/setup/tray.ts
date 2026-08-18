import Electrobun, { Tray, Utils } from "electrobun/bun";
import { logger } from "../utils/logger";
import { record_manual_launch } from "../utils/startup";

let force_quit = false;
let update_quit = false;
export function set_update_quit() {
  update_quit = true;
}

export function setup_tray(getWin: () => any, createWindow: () => any, getQuitAction: () => "quit" | "hide", start_in_tray = false) {
  logger.info("app", "setup:tray");
  let isWindowAlive = true;
  let isWindowVisible = !start_in_tray;

  const is_mac = process.platform === "darwin";

  const tray = new Tray({
    image: is_mac ? "views://assets/tray_icon_mac.svg" : "views://assets/taskbar_icon.png",
    template: false,
    width: 16,
    height: 16,
  });

  function update_tray_menu() {
    tray.setMenu([
      {
        type: "normal",
        label: "Show",
        action: "show",
      },
      {
        type: "normal",
        label: "Quit",
        action: "quit",
      },
    ]);
  }

  function on_window_closed() {
    isWindowAlive = false;
    isWindowVisible = false;
    if (getQuitAction() === "hide" && is_mac) {
      Utils.setDockIconVisible(false);
    }
  }

  function go_to_tray() {
    if (is_mac) {
      Utils.setDockIconVisible(false);
    }
  }

  function restore_window() {
    let win = getWin();
    if (!isWindowAlive) {
      win = createWindow();
      win.on("close", on_window_closed);
      isWindowAlive = true;
    }
    if (is_mac) {
      Utils.setDockIconVisible(true);
    }
    try {
      win.show();
      win.activate();
    } catch (e) {
      logger.warn("tray", `restore_window failed: ${e}`);
    }
    isWindowVisible = true;
    try {
      record_manual_launch();
    } catch (e) {
      logger.warn("tray", `failed to record manual launch: ${e}`);
    }
  }

  tray.on("tray-clicked", (e: any) => {
    const { action } = e.data;
    const win = getWin();

    if (action === "show") {
      restore_window();
    } else if (action === "") {
      if (isWindowAlive && isWindowVisible) {
        try {
          win.hide();
        } catch (e) {
          logger.warn("tray", `hide_window failed: ${e}`);
        }
        isWindowVisible = false;
        if (getQuitAction() === "hide") {
          go_to_tray();
        }
      } else {
        restore_window();
      }
    } else if (action === "quit") {
      force_quit = true;
      Utils.quit();
    }
  });

  update_tray_menu();

  if (start_in_tray && is_mac) {
    go_to_tray();
  }

  const win = getWin();
  win.on("close", on_window_closed);

  Electrobun.events.on("reopen", () => {
    restore_window();
  });

  Electrobun.events.on("before-quit", (e: any) => {
    if (!force_quit && !update_quit && getQuitAction() === "hide") {
      e.response = { allow: false };
      const w = getWin();
      if (isWindowAlive) {
        try {
          w.hide();
        } catch (err) {
          logger.warn("tray", `hide_window failed: ${err}`);
        }
        isWindowVisible = false;
      }
      go_to_tray();
    } else {
      tray.remove();
    }
  });
}
