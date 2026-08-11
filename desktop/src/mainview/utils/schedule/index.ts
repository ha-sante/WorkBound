import { resolve_with_chrono } from "./chrono_bridge";
import { cand, epoch_list_tokens, next_trio, number_ordinal_candidates, recommendation_candidates, safe_epoch_tokens, TRIO_RULE, best_rule_match } from "./recommendations";
import { FILLER_WORDS, relative_day_token, relative_day_ts, weekday_prefix_token } from "./tokens";
import { humanize_time, next_weekday_ts } from "./time_math";

function build_context(input: string): ParseContext | null {
  const s = input.trim().toLowerCase().replace(/,/g, " ");
  if (!s) return null;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return { s, tokens, now: Date.now() };
}

export function parse_schedule_candidates(input: string): ScheduleCandidate[] {
  const ctx = build_context(input);
  if (!ctx) return [];
  if (epoch_list_tokens(ctx.tokens)) return next_trio(ctx.now);

  const chrono_matches = resolve_with_chrono(ctx);
  return chrono_matches.length > 0 ? chrono_matches : fallback_candidates(ctx);
}

function fallback_candidates(ctx: ParseContext): ScheduleCandidate[] {
  const { tokens, now } = ctx;
  const ordinal = number_ordinal_candidates(tokens, now);
  if (ordinal.length > 0) return ordinal;
  const rec = recommendation_candidates(tokens, now);
  if (rec.length > 0) return rec;
  const rd = relative_day_token(tokens);
  if (rd !== null) {
    const ts = relative_day_ts(rd, now);
    return [cand(ts, humanize_time(ts))];
  }
  const wd = weekday_prefix_token(tokens, now);
  if (wd !== null) {
    const ts = next_weekday_ts((wd + 1) % 7, 12, 0, now);
    return [cand(ts, humanize_time(ts))];
  }
  return [];
}

export function expand_schedule_query(input: string): string | null {
  const ctx = build_context(input);
  if (!ctx) return null;
  const { s, tokens } = ctx;

  const filler = tokens.filter((t) => FILLER_WORDS.has(t)).join(" ");
  const epochs = safe_epoch_tokens(tokens);
  if (epochs) {
    const list = ["next week, month, year"];
    const out = filler ? filler + " " + list[0] : list[0];
    return out === s ? null : out;
  }

  const best = best_rule_match(tokens);
  if (best && best.rule !== TRIO_RULE) {
    let wi = 0;
    const rebuilt = tokens.map((t) => {
      if (FILLER_WORDS.has(t) || /^\d+$/.test(t)) return t;
      return best.matched[wi++];
    });
    const out = rebuilt.join(" ");
    if (out !== s) return out;
  }

  const rd = relative_day_token(tokens);
  if (rd !== null) {
    const rebuilt = tokens.map((t) =>
      FILLER_WORDS.has(t) || /^\d+$/.test(t) || (!rd.aliases.includes(t) && !rd.word.startsWith(t)) ? t : rd.word
    );
    const out = rebuilt.join(" ");
    if (out !== s) return out;
  }
  return null;
}

export { humanize_time };
