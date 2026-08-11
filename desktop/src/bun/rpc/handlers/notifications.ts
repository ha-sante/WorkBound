import { Utils } from "electrobun/bun";
import { messages } from "../../../shared/rpc_messages";
import { format_time } from "../../../shared/datetime";
import { logger } from "../../utils/logger";
import electrobunConfig from "../../../../electrobun.config";

const app_bundle_identifier = electrobunConfig.app.identifier;
let last_open_settings_at = 0;

function open_mac_notification_settings(url: string): boolean {
  const result = Bun.spawn(["open", url], {
    stdout: "ignore",
    stderr: "ignore",
  });
  result.unref();
  return true;
}

function open_notification_settings(): boolean {
  if (process.platform === "darwin") {
    try {
      return open_mac_notification_settings(`x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=${app_bundle_identifier}`);
    } catch {
      return open_mac_notification_settings("x-apple.systempreferences:com.apple.preference.notifications");
    }
  }

  if (process.platform === "win32") {
    return Utils.openExternal("ms-settings:notifications");
  }

  return false;
}

export default {
  [messages.notifications_request_permission]: async () => {
    logger.info("rpc", "notifications:request_permission");
    try {
      Utils.showNotification({
        title: "WorkBound",
        body: "Notifications are ready",
        silent: true,
      });
    } catch (e) {
      logger.warn("rpc", `notifications:request_permission failed: ${e}`);
    }
    return { success: true };
  },

  [messages.notifications_test]: async () => {
    const sent_at = format_time(new Date().toISOString());
    logger.info("rpc", `notifications:test sent_at=${sent_at}`);
    try {
      Utils.showNotification({
        title: "WorkBound",
        body: `Test notification sent at ${sent_at}`,
        silent: false,
      });
    } catch (e) {
      logger.warn("rpc", `notifications:test failed: ${e}`);
    }
    return { success: true };
  },

  [messages.notifications_open_settings]: async () => {
    logger.info("rpc", "notifications:open_settings");
    const now = Date.now();
    if (now - last_open_settings_at < 1500) {
      return { success: true };
    }
    last_open_settings_at = now;

    let success = false;
    try {
      success = open_notification_settings();
    } catch (e) {
      logger.warn("rpc", `notifications:open_settings failed: ${e}`);
    }

    if (!success) {
      logger.warn("rpc", `notifications:open_settings unsupported platform=${process.platform}`);
    }
    return { success };
  },
};
