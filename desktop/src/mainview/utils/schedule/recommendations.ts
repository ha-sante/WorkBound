import {
  add_days,
  add_hours,
  add_months,
  humanize_time,
  last_day_of_month_ts,
  next_clock_ts,
  next_day_of_month,
  next_month_day_ts,
  next_weekday_ts,
} from "./time_math";
import { FILLER_WORDS, WEEKDAYS } from "./tokens";

export const cand = (ts: number, label: string): ScheduleCandidate => ({ ts, label });

export const next_trio = (now: number): ScheduleCandidate[] => [
  cand(add_days(now, 7), "Next week"),
  cand(add_months(now, 1), "Next month"),
  cand(add_months(now, 12), "Next year"),
];

export const TRIO_RULE: RecommendationRule = {
  words: ["next", "go", "following", "week", "month", "year"],
  candidates: (now) => next_trio(now),
};

const RECOMMENDATIONS: RecommendationRule[] = [
  { words: ["in"], allow_number: true, number_ok: (n) => n >= 1 && n <= 24, candidates: (now, n) => [cand(add_hours(now, n), `In ${n} hour${n === 1 ? "" : "s"}`)] },
  { words: ["end", "of", "day", "eod"], candidates: (now) => [cand(next_clock_ts(17, 0, now), "End of day")] },
  { words: ["end", "of", "week", "eow"], candidates: (now) => [cand(next_weekday_ts(5, 17, 0, now), "End of week")] },
  { words: ["end", "of", "month"], candidates: (now) => [cand(last_day_of_month_ts(9, now), "End of month")] },
  { words: ["start", "of", "week"], candidates: (now) => [cand(next_weekday_ts(1, 9, 0, now), "Start of week")] },
  { words: ["in", "am"], candidates: (now) => [cand(next_clock_ts(9, 0, now), "In the morning")] },
  { words: ["lunch"], candidates: (now) => [cand(next_clock_ts(12, 30, now), "Lunch")] },
  { words: ["dinner"], candidates: (now) => [cand(next_clock_ts(19, 0, now), "Dinner")] },
  { words: ["after"], allow_number: true, number_ok: (n) => n >= 1 && n <= 10, candidates: (now, n) => [cand(next_clock_ts(n + 13, 0, now), `After ${n}`)] },
  TRIO_RULE,
];

function match_words(words: string[], rule_words: string[]): string[] | null {
  const used = new Array(rule_words.length).fill(false);
  const matched: string[] = [];
  for (const w of words) {
    let found = false;
    for (let i = 0; i < rule_words.length; i++) {
      if (!used[i] && rule_words[i].startsWith(w)) {
        used[i] = true;
        matched.push(rule_words[i]);
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return matched;
}

export function best_rule_match(tokens: string[]): { rule: RecommendationRule; n: number; matched: string[] } | null {
  const nums = tokens.filter((t) => /^\d+$/.test(t));
  const words = tokens.filter((t) => !FILLER_WORDS.has(t) && !/^\d+$/.test(t));
  if (words.length === 0) return null;

  let best: { rule: RecommendationRule; n: number; matched: string[] } | null = null;
  let best_extra = Infinity;
  for (const rule of RECOMMENDATIONS) {
    const matched = match_words(words, rule.words);
    if (!matched) continue;
    let n = 0;
    if (rule.allow_number) {
      if (nums.length !== 1) continue;
      n = parseInt(nums[0], 10);
      if (rule.number_ok && !rule.number_ok(n)) continue;
    } else if (nums.length !== 0) {
      continue;
    }
    const extra = rule.words.length - words.length;
    if (extra < best_extra) {
      best_extra = extra;
      best = { rule, n, matched };
    }
  }
  return best;
}

export function recommendation_candidates(tokens: string[], now: number): ScheduleCandidate[] {
  const best = best_rule_match(tokens);
  return best ? best.rule.candidates(now, best.n) : [];
}

export function number_ordinal_candidates(tokens: string[], now: number): ScheduleCandidate[] {
  const nums = tokens.filter((t) => /^\d{1,2}(?:st|nd|rd|th)?$/.test(t));
  const rest = tokens.filter((t) => !/^\d{1,2}(?:st|nd|rd|th)?$/.test(t));
  if (nums.length !== 1 || !rest.every((t) => FILLER_WORDS.has(t))) return [];

  const m = nums[0].match(/^(\d{1,2})(st|nd|rd|th)?$/);
  if (!m) return [];
  const n = parseInt(m[1], 10);
  const has_suffix = m[2] !== undefined;

  const out: ScheduleCandidate[] = [];
  if (!has_suffix && n >= 1 && n <= 24) {
    const hour = n <= 12 ? (n === 12 ? 12 : n <= 6 ? n + 12 : n) : n;
    out.push(cand(next_clock_ts(hour, 0, now), humanize_time(next_clock_ts(hour, 0, now))));
  }
  if (n >= 1 && n <= 31) {
    const ts = next_day_of_month(n, now);
    if (ts !== null) out.push(cand(ts, humanize_time(ts)));
  }
  return out;
}

export function next_month_day_candidates(tokens: string[], now: number): ScheduleCandidate[] {
  const nums = tokens.filter((t) => /^\d{1,2}(?:st|nd|rd|th)?$/.test(t));
  const words = tokens.filter((t) => !/^\d{1,2}(?:st|nd|rd|th)?$/.test(t) && !FILLER_WORDS.has(t));
  const has_next = words.some((t) => "next".startsWith(t));
  const has_month = words.some((t) => "month".startsWith(t));
  if (!has_next || !has_month || nums.length !== 1 || words.some((t) => !"next month".split(" ").some((word) => word.startsWith(t)))) return [];

  const day = parseInt(nums[0], 10);
  if (day < 1 || day > 31) return [];
  const ts = next_month_day_ts(day, now);
  return ts === null ? [] : [cand(ts, `Next month ${day}`)];
}

export function epoch_list_tokens(tokens: string[], min_epochs = 2): string[] | null {
  const has_next = tokens.some((t) => "next".startsWith(t));
  if (!has_next) return null;
  const epochs = ["week", "month", "year"].filter((ep) => tokens.some((t) => ep.startsWith(t)));
  return epochs.length >= min_epochs ? epochs : null;
}

export function safe_epoch_tokens(tokens: string[]): string[] | null {
  const has_next = tokens.some((t) => "next".startsWith(t));
  if (!has_next) return null;
  const epochs = ["week", "month", "year"].filter((ep) =>
    tokens.some((t) => ep.startsWith(t) && !WEEKDAYS.some((d) => d.startsWith(t)))
  );
  return epochs.length >= 1 ? epochs : null;
}
