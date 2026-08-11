import { BrowserWindow, Updater } from "electrobun/bun";
import { logger } from "./utils/logger";
import { get_pref, set_pref } from "./db/preferences";
import { get_auto_startup, get_app_data_dir } from "./utils/platform";
import { is_login_item_launch, record_manual_launch } from "./utils/startup";
import { writeFileSync } from "fs";
import { join } from "path";
import { resolve_saved_window_state, setup_window_state } from "./setup/window_state";
import { hydrate_config_secrets } from "./utils/config";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function get_main_view_url(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			logger.info("app", `HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			logger.info("app", "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

const url = await get_main_view_url();

let win: BrowserWindow;
let quitAction: "quit" | "hide" = "hide";
try {
	const val = get_pref("tray:quitAction");
	if (val === "hide" || val === "quit") quitAction = val;
} catch (e) {
	logger.warn("prefs", `Failed to read tray:quitAction: ${e}`);
}

let sysAutoStartup = false;
try {
	sysAutoStartup = get_auto_startup();
	const dbAutoStartup = get_pref("general:autoStartup") === true;
	if (dbAutoStartup !== sysAutoStartup) {
		set_pref("general:autoStartup", sysAutoStartup);
	}
} catch (e) {
	logger.warn("prefs", `Failed to sync auto-startup: ${e}`);
}

const start_in_tray = process.argv.includes("--start-in-tray") || is_login_item_launch(sysAutoStartup);

// async ops - loading it once
hydrate_config_secrets();

import { setup_rpc } from "./setup/rpc";
const bunRPC = setup_rpc(() => win, (v) => { quitAction = v; });

import { setup_menu } from "./setup/menu";
setup_menu(() => win, url);

function create_window(): BrowserWindow {
	const saved = resolve_saved_window_state();
	win = new BrowserWindow({
		url,
		renderer: "native",
		frame: saved,
		titleBarStyle: "hiddenInset",
		trafficLightOffset: { x: 12, y: 12 },
		hidden: start_in_tray,
		rpc: bunRPC,
	});
	setup_window_state(() => win);
	return win;
}

win = create_window();

if (!start_in_tray) {
	try {
		record_manual_launch();
	} catch (e) {
		logger.warn("prefs", `Failed to record manual launch: ${e}`);
	}
}

logger.info("app", "WorkBound app started!");

const relaunch_from = process.argv.find((a) => a.startsWith("--relaunch-from="));
if (relaunch_from) {
  try {
    writeFileSync(join(get_app_data_dir(), "relaunch-ok"), String(Date.now()), "utf-8");
    logger.info("app", "relaunch: wrote confirmation marker");
  } catch (e) {
    logger.warn("app", `relaunch: failed to write confirmation marker: ${e}`);
  }
}

import { setup_tray } from "./setup/tray";
setup_tray(() => win, create_window, () => quitAction, start_in_tray);

