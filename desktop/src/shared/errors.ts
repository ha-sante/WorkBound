export const error_message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
