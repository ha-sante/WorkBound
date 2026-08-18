function normalize_text(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function day_start_ms(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function day_end_ms(day: string): number {
  return Date.parse(`${day}T23:59:59.999Z`);
}

export function filter_clause_matches_email(clause: ClientFilterClause, email: EmailPreviewWire): boolean {
  switch (clause.field) {
    case "category":
    case "label": {
      if (!clause.value) return false;
      const has = (email.labels ?? []).includes(clause.value);
      return clause.op === "is" ? has : clause.op === "is_not" ? !has : false;
    }
    case "is_important": {
      const target = clause.value_boolean;
      if (target === undefined) return false;
      const value = email.is_flagged === 1;
      return clause.op === "eq" ? value === target : clause.op === "neq" ? value !== target : false;
    }
    case "is_unread": {
      const target = clause.value_boolean;
      if (target === undefined) return false;
      const value = (email.is_read ?? 0) !== 1;
      return clause.op === "eq" ? value === target : clause.op === "neq" ? value !== target : false;
    }
    case "has_attachments": {
      const target = clause.value_boolean;
      if (target === undefined) return false;
      const value = !!email.has_attachments;
      return clause.op === "eq" ? value === target : clause.op === "neq" ? value !== target : false;
    }
    case "from":
    case "to":
    case "cc":
    case "bcc":
    case "subject": {
      if (!clause.value) return false;
      const field_value = clause.field === "from"
        ? `${email.from_name ?? ""} ${email.from_address ?? ""}`
        : clause.field === "to" ? email.toAddr : clause.field === "cc" ? email.cc : clause.field === "bcc" ? email.bcc : email.subject;
      const haystack = normalize_text(field_value);
      const needle = normalize_text(clause.value);
      if (clause.op === "contains") return haystack.includes(needle);
      if (clause.op === "not_contains") return !haystack.includes(needle);
      if (clause.op === "eq") return haystack === needle;
      if (clause.op === "neq") return haystack !== needle;
      return false;
    }
    case "date": {
      if (!email.received_at) return false;
      const timestamp = Date.parse(email.received_at);
      if (!Number.isFinite(timestamp)) return false;
      if (clause.op === "after") return !!clause.from && timestamp >= day_start_ms(clause.from);
      if (clause.op === "before") return !!clause.to && timestamp <= day_end_ms(clause.to);
      if (clause.op === "range") return !!clause.from && !!clause.to && timestamp >= day_start_ms(clause.from) && timestamp <= day_end_ms(clause.to);
      return false;
    }
    default:
      return false;
  }
}

export function filter_matches_email(email: EmailPreviewWire, clauses: ClientFilterClause[]): boolean {
  return clauses.length > 0 && clauses.every((clause) => filter_clause_matches_email(clause, email));
}
