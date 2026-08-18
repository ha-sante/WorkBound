import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";

let last_open_settings_at = 0;

function open_accessibility_settings_mac(): boolean {
  const url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
  const result = Bun.spawn(["open", url], {
    stdout: "ignore",
    stderr: "ignore",
  });
  result.unref();
  return true;
}

function open_accessibility_settings(): boolean {
  if (process.platform === "darwin") {
    try {
      return open_accessibility_settings_mac();
    } catch (e) {
      logger.warn("rpc", `shortcuts:open_accessibility_settings failed: ${e}`);
    }
  }

  if (process.platform === "win32") {
    const result = Bun.spawn(["cmd", "/c", "start", "ms-settings:easeofaccess-keyboard"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    result.unref();
    return true;
  }

  return false;
}

export default {
  [messages.shortcuts_open_accessibility_settings]: async () => {
    logger.info("rpc", "shortcuts:open_accessibility_settings");
    const now = Date.now();
    if (now - last_open_settings_at < 1500) {
      return { success: true };
    }
    last_open_settings_at = now;

    const success = open_accessibility_settings();
    if (!success) {
      logger.warn("rpc", `shortcuts:open_accessibility_settings unsupported platform=${process.platform}`);
    }
    return { success };
  },
};
