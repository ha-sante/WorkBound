import { messages } from "../../../shared/rpc_messages";
import { pref_keys } from "../../../shared/pref_keys";
import { get_pref, set_pref } from "../../db/preferences";
import { logger } from "../../utils/logger";
import {
  add_launcher,
  get_launcher_label,
  get_launcher_present,
  is_default_mail_handler,
  is_dev_build,
  is_in_applications_folder,
  move_to_applications,
  register_mailto_handler,
} from "../../utils/platform";

function get_mail_handler_state(): MailHandlerState {
  const v = get_pref(pref_keys.app_setup_default_mail_handler_state);
  return v === "attempted" || v === "completed" ? v : "unattempted";
}

function get_move_auto_failed(): boolean {
  return get_pref(pref_keys.app_setup_move_auto_failed) === true;
}

function get_status(): AppSetupStatusWire {
  const platform = process.platform;
  const move_auto_failed = get_move_auto_failed();
  const in_applications = is_in_applications_folder();
  const should_auto_move = platform === "darwin" && !in_applications && !is_dev_build() && !move_auto_failed;

  const rows: AppSetupRowWire[] = [];

  if (platform === "darwin") {
    rows.push({
      key: "move",
      title: "Move to Applications",
      description: "Move WorkBound to your Applications folder.",
      guide_url: null,
      done: in_applications,
      done_label: "In /Applications",
      action_label: "Move to Applications",
    });
  }

  const launcher_present = get_launcher_present();
  const launcher_label = get_launcher_label();
  const launcher_place =
    platform === "darwin" ? "Dock" : platform === "win32" ? "Start Menu" : "app launcher";
  rows.push({
    key: "launcher",
    title: launcher_label,
    description: `Add WorkBound to your ${launcher_place} so it's one click away.`,
    guide_url: null,
    done: launcher_present,
    done_label: "Added",
    action_label: launcher_label,
  });

  const mail_handler_live = is_default_mail_handler();
  const mail_handler_state = get_mail_handler_state();
  const mail_done = mail_handler_live || mail_handler_state === "completed";
  const is_mac = platform === "darwin";
  rows.push({
    key: "mail_handler",
    title: "Default email reader",
    description: is_mac
      ? "Apple requires changing the default email reader in the Mail app."
      : "Open mailto links in WorkBound. We'll open your system settings to finish the job.",
    guide_url: is_mac ? "https://support.apple.com/en-us/102362" : null,
    done: mail_done,
    done_label: "Default reader",
    action_label: is_mac
      ? "Open Apple Mail"
      : mail_handler_state === "attempted"
        ? "Finish in settings"
        : "Set as default",
  });

  return {
    should_auto_move,
    move_auto_failed,
    rows,
  };
}

export default {
  [messages.app_setup_get_status]: async (): Promise<AppSetupStatusWire> => {
    logger.info("rpc", "app_setup:get_status");
    return get_status();
  },

  [messages.app_setup_move_to_applications]: async () => {
    logger.info("rpc", "app_setup:move_to_applications");
    try {
      move_to_applications();
      set_pref(pref_keys.app_setup_move_auto_failed, false);
      return { success: true };
    } catch (e) {
      logger.warn("rpc", `app_setup:move_to_applications failed: ${e}`);
      set_pref(pref_keys.app_setup_move_auto_failed, true);
      return { success: false, error: String(e) };
    }
  },

  [messages.app_setup_add_launcher]: async () => {
    logger.info("rpc", "app_setup:add_launcher");
    try {
      add_launcher();
      return { success: true };
    } catch (e) {
      logger.warn("rpc", `app_setup:add_launcher failed: ${e}`);
      return { success: false, error: String(e) };
    }
  },

  [messages.app_setup_set_default_mail_handler]: async (params: { completed?: boolean }) => {
    logger.info("rpc", `app_setup:set_default_mail_handler completed=${params?.completed ?? false}`);
    try {
      if (params?.completed) {
        set_pref(pref_keys.app_setup_default_mail_handler_state, "completed");
        return { success: true };
      }
      register_mailto_handler();
      if (get_mail_handler_state() === "unattempted") {
        set_pref(pref_keys.app_setup_default_mail_handler_state, "attempted");
      }
      return { success: true };
    } catch (e) {
      logger.warn("rpc", `app_setup:set_default_mail_handler failed: ${e}`);
      return { success: false, error: String(e) };
    }
  },
};
