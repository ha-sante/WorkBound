import { getDb } from "./client";
import { signature_templates } from "./schema";
import { eq, and } from "drizzle-orm";

export type SignatureTemplateRow = typeof signature_templates.$inferSelect;

export type SignatureTemplateInsert = typeof signature_templates.$inferInsert;

export type SignatureTemplateUpdate = Partial<Pick<SignatureTemplateInsert, "name" | "body">>;

export function list_signature_templates(account_id: string): SignatureTemplateRow[] {
  return getDb()
    .select()
    .from(signature_templates)
    .where(eq(signature_templates.account_id, account_id))
    .all();
}

export function get_signature_template(id: string): SignatureTemplateRow | undefined {
  return getDb()
    .select()
    .from(signature_templates)
    .where(eq(signature_templates.id, id))
    .get();
}

export function find_signature_template_by_body(account_id: string, body: string): SignatureTemplateRow | undefined {
  return getDb()
    .select()
    .from(signature_templates)
    .where(and(eq(signature_templates.account_id, account_id), eq(signature_templates.body, body)))
    .get();
}

export function create_signature_template(data: SignatureTemplateInsert) {
  getDb().insert(signature_templates).values(data).run();
}

export function update_signature_template(id: string, data: SignatureTemplateUpdate) {
  getDb()
    .update(signature_templates)
    .set({ ...data, updated_at: new Date().toISOString() })
    .where(eq(signature_templates.id, id))
    .run();
}

export function delete_signature_template(id: string) {
  getDb().delete(signature_templates).where(eq(signature_templates.id, id)).run();
}

export function upsert_signature_template_by_body(
  account_id: string,
  body: string,
  name: string,
): SignatureTemplateRow {
  const existing = find_signature_template_by_body(account_id, body);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const data: SignatureTemplateInsert = { id, account_id, name, body };
  create_signature_template(data);
  return get_signature_template(id)!;
}
