function normalize_text(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim();
}

function day_start_ms(day: string): number {
  // Interpret day in UTC to keep comparisons stable across timezones.
  return Date.parse(`${day}T00:00:00.000Z`);
}

function day_end_ms(day: string): number {
  return Date.parse(`${day}T23:59:59.999Z`);
}

function clause_matches_email(clause: ClientFilterClause, email: EmailPreviewWire): boolean {
  switch (clause.field) {
    case "category": {
      const v = clause.value;
      if (!v) return false;
      const has = (email.labels ?? []).includes(v);
      return clause.op === "is" ? has : clause.op === "is_not" ? !has : false;
    }
    case "label": {
      const v = clause.value;
      if (!v) return false;
      const has = (email.labels ?? []).includes(v);
      return clause.op === "is" ? has : clause.op === "is_not" ? !has : false;
    }
    case "is_unread": {
      const target = clause.value_boolean;
      if (target === undefined) return false;
      const is_unread = (email.is_read ?? 0) !== 1;
      if (clause.op === "eq") return is_unread === target;
      if (clause.op === "neq") return is_unread !== target;
      return false;
    }
    case "has_attachments": {
      const target = clause.value_boolean;
      if (target === undefined) return false;
      const has = !!email.has_attachments;
      if (clause.op === "eq") return has === target;
      if (clause.op === "neq") return has !== target;
      return false;
    }
    case "from": {
      const needle = clause.value;
      if (!needle) return false;
      const haystack = normalize_text(`${email.from_name ?? ""} ${email.from_address ?? ""}`);
      const n = normalize_text(needle);
      switch (clause.op) {
        case "contains": return haystack.includes(n);
        case "not_contains": return !haystack.includes(n);
        case "eq": return haystack === n;
        case "neq": return haystack !== n;
        default: return false;
      }
    }
    case "to": {
      const needle = clause.value;
      if (!needle) return false;
      const haystack = normalize_text(email.toAddr);
      const n = normalize_text(needle);
      switch (clause.op) {
        case "contains": return haystack.includes(n);
        case "not_contains": return !haystack.includes(n);
        case "eq": return haystack === n;
        case "neq": return haystack !== n;
        default: return false;
      }
    }
    case "cc": {
      const needle = clause.value;
      if (!needle) return false;
      const haystack = normalize_text(email.cc);
      const n = normalize_text(needle);
      switch (clause.op) {
        case "contains": return haystack.includes(n);
        case "not_contains": return !haystack.includes(n);
        case "eq": return haystack === n;
        case "neq": return haystack !== n;
        default: return false;
      }
    }
    case "bcc": {
      const needle = clause.value;
      if (!needle) return false;
      const haystack = normalize_text(email.bcc);
      const n = normalize_text(needle);
      switch (clause.op) {
        case "contains": return haystack.includes(n);
        case "not_contains": return !haystack.includes(n);
        case "eq": return haystack === n;
        case "neq": return haystack !== n;
        default: return false;
      }
    }
    case "subject": {
      const needle = clause.value;
      if (!needle) return false;
      const haystack = normalize_text(email.subject);
      const n = normalize_text(needle);
      switch (clause.op) {
        case "contains": return haystack.includes(n);
        case "not_contains": return !haystack.includes(n);
        case "eq": return haystack === n;
        case "neq": return haystack !== n;
        default: return false;
      }
    }
    case "date": {
      const received_at = email.received_at;
      if (!received_at) return false;
      const ts = Date.parse(received_at);
      if (!Number.isFinite(ts)) return false;

      if (clause.op === "after") {
        if (!clause.from) return false;
        return ts >= day_start_ms(clause.from);
      }
      if (clause.op === "before") {
        if (!clause.to) return false;
        return ts <= day_end_ms(clause.to);
      }
      if (clause.op === "range") {
        if (!clause.from || !clause.to) return false;
        const start = day_start_ms(clause.from);
        const end = day_end_ms(clause.to);
        return ts >= start && ts <= end;
      }
      return false;
    }
    default:
      return false;
  }
}

export function apply_filter_clauses(emails: EmailPreviewWire[], clauses: ClientFilterClause[]): EmailPreviewWire[] {
  if (!clauses.length) return emails;
  return emails.filter((e) => clauses.every((c) => clause_matches_email(c, e)));
}
