type RetryState = {
  count: number;
  timer?: ReturnType<typeof setTimeout>;
};

export type ScheduleRetryOptions = {
  base_ms: number;
  max_ms: number;
  is_permanent?: (err: unknown) => boolean;
};

type WithRetryOptions = {
  base_ms: number;
  max_ms: number;
  max_attempts: number;
  should_retry?: (err: unknown) => boolean;
};

const retry_state = new Map<string, RetryState>();

// normal sleep
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// calculates exponential backoffs
export const backoff_delay_ms = (count: number, base_ms: number, max_ms: number): number => Math.min(base_ms * 2 ** count, max_ms);

// stateful retries
export function schedule_retry(key: string, run: () => Promise<void>, opts: ScheduleRetryOptions): void {
  const existing = retry_state.get(key);
  if (existing?.timer) clearTimeout(existing.timer);

  const count = existing?.count ?? 0;
  const delay = backoff_delay_ms(count, opts.base_ms, opts.max_ms);

  const timer = setTimeout(async () => {
    try {
      await run();
    } catch (err) {
      if (opts.is_permanent?.(err)) {
        cancel_retry(key);
        return;
      }
      schedule_retry(key, run, opts);
      return;
    }
    cancel_retry(key);
  }, delay);

  retry_state.set(key, { count: count + 1, timer });
}

export function cancel_retry(key: string): void {
  const state = retry_state.get(key);
  if (state?.timer) clearTimeout(state.timer);
  retry_state.delete(key);
}

export function clear_all_retries(): void {
  for (const state of retry_state.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  retry_state.clear();
}

// stateless blocking retry
export async function with_retry<T>(fn: () => Promise<T>, opts: WithRetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (opts.should_retry && !opts.should_retry(err)) throw err;
      attempt++;
      if (attempt >= opts.max_attempts) throw err;
      await sleep(backoff_delay_ms(attempt - 1, opts.base_ms, opts.max_ms));
    }
  }
}