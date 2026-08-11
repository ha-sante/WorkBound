import { atom, getDefaultStore } from "jotai";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

const DEFAULT_WIDTH = 240;
const DEFAULT_OPEN = true;
const WIDTH_KEY = "ui:sidebar_width";
const OPEN_KEY = "ui:sidebar_open";
const MIN_WIDTH = 60;
const MAX_WIDTH = 240;

const store = getDefaultStore();
const width_base = atom<number>(DEFAULT_WIDTH);
const open_base = atom<boolean>(DEFAULT_OPEN);

export const sidebarWidthAtom = atom(
	(get) => get(width_base),
	(get, set, update: number | ((prev: number) => number)) => {
		const next = typeof update === "function" ? update(get(width_base)) : update;
		set(width_base, next);
		rpc.request(messages.prefs_set, { key: WIDTH_KEY, value: next }).catch(() => {});
	},
);

export const sidebarOpenAtom = atom(
	(get) => get(open_base),
	(get, set, value: boolean | ((prev: boolean) => boolean)) => {
		const next = typeof value === "function" ? value(get(open_base)) : value;
		set(open_base, next);
		rpc.request(messages.prefs_set, { key: OPEN_KEY, value: next }).catch(() => {});
	},
);

export async function hydrate_sidebar_state(): Promise<void> {
	try {
		const { prefs } = await rpc.request(messages.prefs_get_all);
		const wv = prefs[WIDTH_KEY];
		const ov = prefs[OPEN_KEY];
		if (typeof wv === "number" && Number.isFinite(wv)) {
			store.set(width_base, Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(wv))));
		}
		if (typeof ov === "boolean") {
			store.set(open_base, ov);
		}
	} catch {}
}
