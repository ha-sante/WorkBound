import { add_days, next_clock_ts, ts_of_day } from "./time_math";

export const FILLER_WORDS = new Set(["send", "the", "at", "on", "for", "to"]);
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const RELATIVE_DAYS: RelativeDay[] = [
  { word: "tomorrow", aliases: ["tomorr", "tomo", "tomor", "tomoro", "tomorow", "tommorow", "tmro", "tmr", "tmrw", "2moro", "2morrow", "moro"] },
  { word: "tonight", aliases: ["tngt", "tonit", "tonite"] },
  { word: "today", aliases: ["tod", "tday"] },
];

export function weekday_prefix_token(tokens: string[], now: number): number | null {
  for (const t of tokens) {
    if (FILLER_WORDS.has(t) || /^\d/.test(t)) continue;
    const matches = WEEKDAYS.map((_, i) => i).filter((i) => WEEKDAYS[i].startsWith(t));
    if (matches.length === 0) continue;
    if (matches.length === 1) return matches[0];
    const today = new Date(now).getDay();
    let best = matches[0];
    let best_off = Infinity;
    for (const i of matches) {
      const js = (i + 1) % 7;
      const off = (js - today + 7) % 7;
      const next = off === 0 ? 7 : off;
      if (next < best_off) {
        best_off = next;
        best = i;
      }
    }
    return best;
  }
  return null;
}

export function relative_day_token(tokens: string[]): RelativeDay | null {
  for (const t of tokens) {
    if (FILLER_WORDS.has(t)) continue;
    for (const rd of RELATIVE_DAYS) {
      if (rd.aliases.includes(t) || (t.length >= 3 && rd.word.startsWith(t))) return rd;
    }
  }
  return null;
}

export function relative_day_ts(rd: RelativeDay, now: number, hour?: number, minute = 0): number {
  const d = new Date(now);
  if (rd.word === "tomorrow") {
    const day = add_days(now, 1);
    return ts_of_day(day, hour ?? 9, hour === undefined ? 0 : minute);
  }
  if (rd.word === "tonight") {
    return hour === undefined ? next_clock_ts(22, 0, now) : next_clock_ts(hour, minute, now);
  }
  return hour === undefined ? ts_of_day(now, d.getHours(), d.getMinutes()) : next_clock_ts(hour, minute, now);
}

export function is_relative_day_bare(rd: RelativeDay, text: string): boolean {
  const t = text.trim().toLowerCase();
  return rd.aliases.includes(t) || t === rd.word || (t.length >= 3 && rd.word.startsWith(t));
}
