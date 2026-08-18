const number_formatter = new Intl.NumberFormat();

export const format_number = (value: number): string => number_formatter.format(value);

export function percent_progress(total: number, max: number): string {
  if (max <= 0) return "0";
  const value = Math.min(100, (total / max) * 100).toFixed(1);
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
