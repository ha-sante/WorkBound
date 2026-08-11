import { getDb } from "./client";
import { auto_label_assignments } from "./schema";
import { eq, and } from "drizzle-orm";

export type AutoLabelAssignmentInsert = typeof auto_label_assignments.$inferInsert;

export function bulk_insert_assignments(rows: AutoLabelAssignmentInsert[]): void {
  if (rows.length === 0) return;
  getDb()
    .insert(auto_label_assignments)
    .values(rows)
    .onConflictDoNothing({
      target: [auto_label_assignments.email_id, auto_label_assignments.rule_id, auto_label_assignments.rule_version],
    })
    .run();
}

export function delete_assignments_by_rule(account_id: string, rule_id: string): void {
  getDb()
    .delete(auto_label_assignments)
    .where(and(
      eq(auto_label_assignments.account_id, account_id),
      eq(auto_label_assignments.rule_id, rule_id),
    ))
    .run();
}

export function list_assigned_email_ids(account_id: string, rule_id: string, rule_version: number): string[] {
  const rows = getDb()
    .select({ email_id: auto_label_assignments.email_id })
    .from(auto_label_assignments)
    .where(and(
      eq(auto_label_assignments.account_id, account_id),
      eq(auto_label_assignments.rule_id, rule_id),
      eq(auto_label_assignments.rule_version, rule_version),
    ))
    .all();
  return rows.map((r) => r.email_id);
}
