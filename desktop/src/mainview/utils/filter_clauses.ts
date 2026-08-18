import { filter_clause_matches_email, filter_matches_email } from "@/shared/filter_matcher";

export { filter_clause_matches_email };

export function apply_filter_clauses(emails: EmailPreviewWire[], clauses: ClientFilterClause[]): EmailPreviewWire[] {
  if (!clauses.length) return emails;
  return emails.filter((email) => filter_matches_email(email, clauses));
}
