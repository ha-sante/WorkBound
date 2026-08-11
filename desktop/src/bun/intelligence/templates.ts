import { get_pref, set_pref } from "../db/preferences";
import { getDb } from "../db/client";
import { delete_assignments_by_rule } from "../db/auto_label_assignments";
import { labels } from "../db/schema/labels";
import { eq, and } from "drizzle-orm";
import { withGmailAuth } from "../providers/gmail/auth";
import { create_label } from "../providers/gmail/api";
import { template_content_hash, make_auto_label_id } from "../utils/crypto";
import { rpc_send } from "../rpc";
import { messages } from "../../shared/rpc_messages";

const TEMPLATES_KEY = "intelligence:label_templates";

function normalize(template: AutoLabelTemplateWire): AutoLabelTemplateWire {
  const entries = template.entries.map((e) => {
    const legacy = e as unknown as { label?: string };
    return {
      ...e,
      labels: Array.isArray(e.labels) ? e.labels : legacy.label ? [legacy.label] : [],
    };
  });
  return {
    ...template,
    enabled: typeof template.enabled === "boolean" ? template.enabled : true,
    entries,
    version: typeof template.version === "number" ? template.version : 1,
    content_hash: template.content_hash ?? template_content_hash(entries),
  };
}

export function list_templates(account_id: string): AutoLabelTemplateWire[] {
  const raw = get_pref(TEMPLATES_KEY);
  if (!Array.isArray(raw)) return [];
  const templates = raw as unknown as AutoLabelTemplateWire[];
  return templates.filter((t) => t.account_id === account_id).map(normalize);
}

function persist_templates(templates: AutoLabelTemplateWire[]): void {
  set_pref(TEMPLATES_KEY, templates as unknown as Record<string, unknown>[]);
}

async function ensure_label(account_id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const matches = getDb().select({ id: labels.id, name: labels.name }).from(labels)
    .where(and(eq(labels.account_id, account_id), eq(labels.type, "user")))
    .all()
    .filter((l) => l.name.toLowerCase() === trimmed.toLowerCase());
  if (matches.length > 0) return;
  const result = await withGmailAuth(account_id, (token) => create_label(token, trimmed));
  getDb().insert(labels).values({
    id: result.id,
    account_id,
    name: result.name,
    type: "user",
  }).onConflictDoUpdate({
    target: labels.id,
    set: { name: result.name, type: "user" },
  }).run();
  rpc_send(messages.labels_changed, { account_id });
}

function ensure_entries(entries: AutoLabelTemplateEntryInputWire[]): AutoLabelTemplateEntryWire[] {
  return entries.map((e) => ({
    ...e,
    id: make_auto_label_id("alte"),
  }));
}

export async function create_template(account_id: string, input: AutoLabelTemplateInputWire): Promise<AutoLabelTemplateWire> {
  for (const entry of input.entries) {
    for (const name of entry.labels) {
      await ensure_label(account_id, name);
    }
  }
  const raw = get_pref(TEMPLATES_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelTemplateWire[]) : [];
  const template: AutoLabelTemplateWire = {
    name: input.name,
    entries: ensure_entries(input.entries),
    enabled: input.enabled,
    id: make_auto_label_id("alt"),
    account_id,
    created_at: new Date().toISOString(),
    version: 1,
    content_hash: template_content_hash(input.entries),
  };
  persist_templates([...all, template]);
  return template;
}

export async function update_template(account_id: string, id: string, input: AutoLabelTemplateInputWire): Promise<AutoLabelTemplateWire | null> {
  for (const entry of input.entries) {
    for (const name of entry.labels) {
      await ensure_label(account_id, name);
    }
  }
  const raw = get_pref(TEMPLATES_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelTemplateWire[]) : [];
  const idx = all.findIndex((t) => t.id === id && t.account_id === account_id);
  if (idx === -1) return null;
  const existing = normalize(all[idx]);
  const next_hash = template_content_hash(input.entries);
  const updated: AutoLabelTemplateWire = {
    ...existing,
    name: input.name,
    entries: ensure_entries(input.entries),
    enabled: input.enabled,
    content_hash: next_hash,
    version: next_hash === existing.content_hash ? existing.version : existing.version + 1,
  };
  all[idx] = updated;
  persist_templates(all);
  return updated;
}

export function delete_template(account_id: string, id: string): void {
  const raw = get_pref(TEMPLATES_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelTemplateWire[]) : [];
  persist_templates(all.filter((t) => !(t.id === id && t.account_id === account_id)));
  delete_assignments_by_rule(account_id, id);
}

export function disable_template_entries_by_label_names(account_id: string, removed_names: string[]): void {
  if (removed_names.length === 0) return;
  const remove_set = new Set(removed_names.map((n) => n.toLowerCase()));
  const raw = get_pref(TEMPLATES_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelTemplateWire[]) : [];
  let changed = false;
  const updated = all.map((t) => {
    if (t.account_id !== account_id) return t;
    const entries = t.entries.map((e) => {
      if (!e.enabled) return e;
      if (!(e.labels ?? []).some((name) => remove_set.has(name.toLowerCase()))) return e;
      changed = true;
      return { ...e, enabled: false };
    });
    return { ...t, entries };
  });
  if (changed) persist_templates(updated);
}
