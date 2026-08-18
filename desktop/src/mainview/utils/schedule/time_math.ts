const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function ts_of_day(ts: number, hour: number, minute = 0): number {
  const d = new Date(ts);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export const add_days = (now: number, days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

export const add_hours = (now: number, hours: number) => now + hours * HOUR;

export const add_months = (now: number, months: number) => {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
};

export function next_clock_ts(hour: number, minute: number, now: number): number {
  const ts = ts_of_day(now, hour, minute);
  return ts > now ? ts : ts + DAY;
}

export function next_weekday_ts(weekday: number, hour: number, minute: number, now: number): number {
  const d = new Date(now);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  let ts = ts_of_day(d.getTime(), hour, minute);
  if (ts <= now) {
    d.setDate(d.getDate() + 7);
    ts = ts_of_day(d.getTime(), hour, minute);
  }
  return ts;
}

export function last_day_of_month_ts(hour: number, now: number): number {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  let ts = ts_of_day(d.getTime(), hour, 0);
  if (ts <= now) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    ts = ts_of_day(d.getTime(), hour, 0);
  }
  return ts;
}

export function next_day_of_month(day: number, now: number): number | null {
  for (let m = 0; m < 4; m++) {
    const base = new Date(now);
    base.setDate(1);
    base.setMonth(base.getMonth() + m);
    base.setHours(9, 0, 0, 0);
    base.setDate(day);
    if (base.getDate() !== day || base.getTime() <= now) continue;
    return base.getTime();
  }
  return null;
}

export function next_month_day_ts(day: number, now: number): number | null {
  const date = new Date(now);
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  date.setHours(9, 0, 0, 0);
  date.setDate(day);
  if (date.getDate() !== day) return null;
  return date.getTime();
}

export function humanize_time(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  const opts: Intl.DateTimeFormatOptions = ts - Date.now() <= WEEK ? { weekday: "long" } : { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts) + " at " + time;
}
