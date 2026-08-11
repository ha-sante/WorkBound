import * as chrono from "chrono-node";
import { DAY, add_days, humanize_time, next_weekday_ts } from "./time_math";
import { WEEKDAYS, is_relative_day_bare, relative_day_token, relative_day_ts, weekday_prefix_token } from "./tokens";

export function resolve_with_chrono(ctx: ParseContext): ScheduleCandidate[] {
  const { s, tokens, now } = ctx;
  const wd = weekday_prefix_token(tokens, now);
  const wd_js = wd === null ? null : (wd + 1) % 7;
  const rd = relative_day_token(tokens);
  const has_next_token = tokens.some((t) => "next".startsWith(t));
  const has_week_token = tokens.some((t) => "week".startsWith(t));
  const seen = new Set<number>();
  const out: ScheduleCandidate[] = [];

  const results = chrono.casual.parse(s, new Date(now), { forwardDate: true });
  for (const r of results) {
    const day_certain = r.start.isCertain("day");
    let ts = r.start.date().getTime();
    const hour = r.start.get("hour");
    if (!day_certain && hour != null) {
      if (wd !== null && wd_js !== null && !r.text.includes(WEEKDAYS[wd])) {
        ts = next_weekday_ts(wd_js, hour, r.start.get("minute") ?? 0, now);
      } else if (rd !== null && !r.text.includes(rd.word)) {
        ts = relative_day_ts(rd, now, hour, r.start.get("minute") ?? 0);
      }
    } else if (rd !== null && is_relative_day_bare(rd, r.text)) {
      ts = relative_day_ts(rd, now);
    }
    if (!day_certain && ts <= now) ts += DAY;
    if (day_certain && ts < now) continue;
    if (seen.has(ts)) continue;
    seen.add(ts);
    const week_bare =
      ts === add_days(now, 7) &&
      (r.text.split(/\s+/).includes("week") || (has_next_token && has_week_token));
    out.push({ ts, label: week_bare ? "Next week" : humanize_time(ts) });
  }
  return out;
}
