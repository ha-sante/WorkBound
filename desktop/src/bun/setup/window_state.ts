import Electrobun, { Screen, type Display } from "electrobun/bun";
import { get_pref, set_pref } from "../db/preferences";
import { logger } from "../utils/logger";

const PREF_KEY = "window:state";
const DEFAULT_SIZE = { width: 1200, height: 800 };
const DEFAULT_POSITION = { x: 200, y: 200 };
const MIN_SIZE = { width: 800, height: 600 };
const MAX_SIZE = { width: 4000, height: 2500 };
const EDGE_MARGIN = 80;

type Rect = { x: number; y: number; width: number; height: number };
type SavedWindowState = {
	x: number;
	y: number;
	width: number;
	height: number;
	display_id: number | null;
};

function clamp_dim(value: unknown, min: number, max: number): number | null {
	const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : NaN;
	if (Number.isNaN(n)) return null;
	return Math.max(min, Math.min(max, n));
}

function clamp_pos(value: number, min: number, max: number): number {
	if (min > max) return min;
	return Math.max(min, Math.min(max, value));
}

function read_saved_window_state(): SavedWindowState {
	try {
		const saved = get_pref(PREF_KEY);
		if (saved && typeof saved === "object" && !Array.isArray(saved)) {
			const s = saved as Record<string, unknown>;
			const width = clamp_dim(s.width, MIN_SIZE.width, MAX_SIZE.width);
			const height = clamp_dim(s.height, MIN_SIZE.height, MAX_SIZE.height);
			if (width !== null && height !== null) {
				const x = typeof s.x === "number" && Number.isFinite(s.x) ? Math.round(s.x) : null;
				const y = typeof s.y === "number" && Number.isFinite(s.y) ? Math.round(s.y) : null;
				return {
					x: x ?? DEFAULT_POSITION.x,
					y: y ?? DEFAULT_POSITION.y,
					width,
					height,
					display_id: typeof s.display_id === "number" && Number.isFinite(s.display_id) ? s.display_id : null,
				};
			}
		}
	} catch (e) {
		logger.warn("window:state", `failed to read saved state: ${e}`);
	}
	return { ...DEFAULT_POSITION, ...DEFAULT_SIZE, display_id: null };
}

function display_by_id(displays: Display[], id: number): Display | null {
	for (const d of displays) {
		if (d.id === id) return d;
	}
	return null;
}

function display_for_point(displays: Display[], cx: number, cy: number): Display | null {
	for (const d of displays) {
		const b = d.bounds;
		if (cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) return d;
	}
	return null;
}

function clamp_frame_to_display(frame: Rect, b: Rect): Rect {
	const x = clamp_pos(frame.x, b.x - frame.width + EDGE_MARGIN, b.x + b.width - EDGE_MARGIN);
	const y = clamp_pos(frame.y, b.y - frame.height + EDGE_MARGIN, b.y + b.height - EDGE_MARGIN);
	return { ...frame, x, y };
}

export function resolve_saved_window_state(): Rect {
	const saved = read_saved_window_state();
	const displays = Screen.getAllDisplays();
	const target = saved.display_id != null ? display_by_id(displays, saved.display_id) : null;

	if (target) {
		return clamp_frame_to_display({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }, target.bounds);
	}

	const primary = Screen.getPrimaryDisplay();
	const wa = primary.workArea && primary.workArea.width > 0 ? primary.workArea : primary.bounds;
	const width = Math.min(saved.width, wa.width);
	const height = Math.min(saved.height, wa.height);
	const x = wa.x + Math.round((wa.width - width) / 2);
	const y = wa.y + Math.round((wa.height - height) / 2);
	return { x, y, width, height };
}

export function setup_window_state(getWin: () => any): void {
	logger.info("app", "setup:window:state");

	function current_display_id(frame: Rect): number | null {
		const cx = frame.x + frame.width / 2;
		const cy = frame.y + frame.height / 2;
		const d = display_for_point(Screen.getAllDisplays(), cx, cy);
		return d ? d.id : null;
	}

	function persist(frame: Rect) {
		try {
			set_pref(PREF_KEY, {
				x: frame.x,
				y: frame.y,
				width: frame.width,
				height: frame.height,
				display_id: current_display_id(frame),
			});
		} catch (e) {
			logger.warn("window:state", `failed to persist state: ${e}`);
		}
	}

	function read_frame(): Rect | null {
		const f = getWin()?.getFrame?.();
		if (!f || typeof f.x !== "number" || typeof f.y !== "number" || typeof f.width !== "number" || typeof f.height !== "number") return null;
		const width = clamp_dim(f.width, MIN_SIZE.width, MAX_SIZE.width);
		const height = clamp_dim(f.height, MIN_SIZE.height, MAX_SIZE.height);
		if (width === null || height === null) return null;
		return { x: Math.round(f.x), y: Math.round(f.y), width, height };
	}

	function persist_now() {
		const frame = read_frame();
		if (frame) persist(frame);
	}

	const win = getWin();
	if (win && typeof win.on === "function") {
		win.on("resize", persist_now);
		win.on("move", persist_now);
		win.on("close", persist_now);
	} else {
		logger.warn("window:state", "window not ready, state persistence skipped");
	}

	Electrobun.events.on("before-quit", () => persist_now());
}