const TIME_12 = { hour: "numeric", minute: "2-digit", hour12: true } as const;
const TIME_12_PADDED = { hour: "2-digit", minute: "2-digit", hour12: true } as const;
const DATE_SHORT = { month: "short", day: "numeric" } as const;
const DATE_MEDIUM = { weekday: "short" } as const;

function days_between(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function format_time(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const day = 86_400_000;

  if (diffMs < day && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString(undefined, TIME_12);
  }
  if (diffMs < 2 * day) return "Yesterday";
  if (days_between(now, d) < 7) {
    return d.toLocaleDateString(undefined, DATE_MEDIUM);
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, DATE_SHORT);
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function format_date(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, DATE_SHORT) + " " + d.toLocaleTimeString(undefined, TIME_12_PADDED);
}

export function format_date_full(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function format_date_only(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, DATE_SHORT);
}
