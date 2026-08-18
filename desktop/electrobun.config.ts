import type { ElectrobunConfig } from "electrobun";
import { APP_IDENTIFIER } from "./src/shared/app_ident";

export default {
	runtime: {
		exitOnLastWindowClosed: false,
	},
	app: {
		name: "WorkBound",
		identifier: APP_IDENTIFIER,
		version: "1.0.4",
		description: "Calm email desktop client for business and professionals.",
		urlSchemes: ["mailto"],
	},
	release: {
		baseUrl: "https://github.com/ha-sante/WorkBound/releases/latest/download",
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"src/assets/tray_icon_mac.png": "views/assets/tray_icon_mac.png",
			"src/assets/tray_icon_mac@2x.png": "views/assets/tray_icon_mac@2x.png",
			"src/assets/tray_icon_mac.svg": "views/assets/tray_icon_mac.svg",
			"src/assets/taskbar_icon.png": "views/assets/taskbar_icon.png",
			"src/assets/wrapped_icon.png": "views/assets/wrapped_icon.png",
			"src/assets/logo.png": "views/assets/logo.png",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			defaultRenderer: "native",
			icons: "src/assets/icon.iconset",
		},
		linux: {
			bundleCEF: false,
			icon: "src/assets/icon.iconset/icon_256x256.png",
		},
		win: {
			bundleCEF: false,
			icon: "src/assets/icon.iconset/icon_256x256.png",
		},
	},
} satisfies ElectrobunConfig;
