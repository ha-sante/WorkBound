export type ParsedQuery = {
  fieldOps: { field: string; value: string }[];
  generalTerms: string[];
  hasFilters: string[];
  beforeDate: string | null;
  afterDate: string | null;
  label: string | null;
};

export type ResolvedDate = {
  op: "<" | ">=";
  sql: string;
};

const FIELD_OPERATORS = new Set(["from", "to", "cc", "bcc", "subject"]);

const FIELD_TO_FTS_COLUMNS: Record<string, string[]> = {
  from: ["from_name", "from_address"],
  to: ["to_addr"],
  cc: ["cc"],
  bcc: ["bcc"],
  subject: ["subject"],
};

export function parse_query(query: string): ParsedQuery {
  const result: ParsedQuery = {
    fieldOps: [],
    generalTerms: [],
    hasFilters: [],
    beforeDate: null,
    afterDate: null,
    label: null,
  };

  const normalized = query.replace(/[\u201C\u201D]/g, '"');
  let stripped = normalized;

  const op_re = /(\w+):("[^"]*"|\S+)/g;
  let m;
  while ((m = op_re.exec(normalized)) !== null) {
    const field = m[1].toLowerCase();
    const value = m[2].replace(/^"|"$/g, "");

    if (field === "has") {
      result.hasFilters.push(value.toLowerCase());
    } else if (field === "before") {
      result.beforeDate = value;
    } else if (field === "after") {
      result.afterDate = value;
    } else if (field === "label") {
      result.label = value;
    } else if (FIELD_OPERATORS.has(field)) {
      result.fieldOps.push({ field, value });
    }

    stripped = stripped.replace(m[0], "").trim();
  }

  if (stripped) {
    for (const word of stripped.split(/\s+/)) {
      if (word) result.generalTerms.push(word);
    }
  }

  return result;
}

export function build_fts_query(parsed: ParsedQuery): string {
  const parts: string[] = [];

  for (const op of parsed.fieldOps) {
    const cols = FIELD_TO_FTS_COLUMNS[op.field];
    if (!cols) continue;
    const val = op.value.replace(/[^\w@.\-+]/g, "").replace(/"/g, '""');
    if (!val) continue;
    if (cols.length === 1) {
      parts.push(`${cols[0]}:"${val}"*`);
    } else {
      parts.push(`(${cols.map((c) => `${c}:"${val}"*`).join(" OR ")})`);
    }
  }

  for (const term of parsed.generalTerms) {
    const t = term.replace(/[^\w@.\-+]/g, "").replace(/"/g, '""');
    if (t) parts.push(`"${t}"*`);
  }

  if (parts.length === 0) return "";
  return parts.join(" AND ");
}

export function matched_fields_from_parsed(parsed: ParsedQuery): string[] {
  return parsed.fieldOps.map((o) => o.field);
}

function start_of_day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function format_date(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function dir_boundary(dir: "before" | "after", start: Date, end: Date): ResolvedDate {
  return dir === "before"
    ? { op: "<", sql: format_date(end) }
    : { op: ">=", sql: format_date(start) };
}

export function resolve_date_value(value: string, dir: "before" | "after"): ResolvedDate | null {
  const v = value.toLowerCase();

  if (v === "today") {
    const s = start_of_day(0);
    return dir_boundary(dir, s, new Date(s.getTime() + 86400000 - 1));
  }

  if (v === "yesterday") {
    const s = start_of_day(-1);
    return dir_boundary(dir, s, s);
  }

  const full = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(v);
  if (full) {
    const d = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
    if (!isNaN(d.getTime())) return dir_boundary(dir, d, d);
  }

  const ym = /^(\d{4})\/(\d{1,2})$/.exec(v);
  if (ym) {
    const y = Number(ym[1]), m = Number(ym[2]) - 1;
    if (dir === "before") return { op: "<", sql: format_date(new Date(y, m, 1)) };
    return { op: ">=", sql: format_date(new Date(y, m + 1, 1)) };
  }

  const year = /^(\d{4})$/.exec(v);
  if (year) {
    const y = Number(year[1]);
    if (dir === "before") return { op: "<", sql: `${y}-01-01 00:00:00` };
    return { op: ">=", sql: `${y + 1}-01-01 00:00:00` };
  }

  return null;
}
