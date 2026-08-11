export function percent_progress(total: number, max: number): string {
  if (max <= 0) return "0";
  const value = Math.min(100, (total / max) * 100).toFixed(1);
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}