import { get_pref, set_pref } from "../db/preferences";
import { delete_assignments_by_rule } from "../db/auto_label_assignments";
import { prompt_content_hash, make_auto_label_id } from "../utils/crypto";

const PROMPTS_KEY = "intelligence:auto_label_prompts";

function normalize(prompt: AutoLabelPromptWire): AutoLabelPromptWire {
  const legacy = prompt as unknown as { label_id?: string };
  const label_ids = Array.isArray(prompt.label_ids) ? prompt.label_ids : legacy.label_id ? [legacy.label_id] : [];
  return {
    ...prompt,
    label_ids,
    version: typeof prompt.version === "number" ? prompt.version : 1,
    content_hash: prompt.content_hash ?? prompt_content_hash(prompt.prompt, label_ids),
  };
}

export function list_prompts(account_id: string): AutoLabelPromptWire[] {
  const raw = get_pref(PROMPTS_KEY);
  if (!Array.isArray(raw)) return [];
  const prompts = raw as unknown as AutoLabelPromptWire[];
  return prompts.filter((p) => p.account_id === account_id).map(normalize);
}

const persist_prompts = (prompts: AutoLabelPromptWire[]): void => set_pref(PROMPTS_KEY, prompts as unknown as Record<string, unknown>[]);

export function create_prompt(account_id: string, input: AutoLabelPromptInputWire): AutoLabelPromptWire {
  const raw = get_pref(PROMPTS_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelPromptWire[]) : [];
  const prompt: AutoLabelPromptWire = {
    ...input,
    id: make_auto_label_id("alp"),
    account_id,
    created_at: new Date().toISOString(),
    version: 1,
    content_hash: prompt_content_hash(input.prompt, input.label_ids),
  };
  persist_prompts([...all, prompt]);
  return prompt;
}

export function update_prompt(account_id: string, id: string, input: AutoLabelPromptInputWire): AutoLabelPromptWire | null {
  const raw = get_pref(PROMPTS_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelPromptWire[]) : [];
  const idx = all.findIndex((p) => p.id === id && p.account_id === account_id);
  if (idx === -1) return null;
  const existing = normalize(all[idx]);
  const next_hash = prompt_content_hash(input.prompt, input.label_ids);
  const updated: AutoLabelPromptWire = {
    ...existing,
    ...input,
    account_id,
    content_hash: next_hash,
    version: next_hash === existing.content_hash ? existing.version : existing.version + 1,
  };
  all[idx] = updated;
  persist_prompts(all);
  return updated;
}

export function delete_prompt(account_id: string, id: string): void {
  const raw = get_pref(PROMPTS_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelPromptWire[]) : [];
  persist_prompts(all.filter((p) => !(p.id === id && p.account_id === account_id)));
  delete_assignments_by_rule(account_id, id);
}

export function disable_prompts_by_label_ids(account_id: string, removed_ids: string[]): void {
  if (removed_ids.length === 0) return;
  const remove_set = new Set(removed_ids);
  const raw = get_pref(PROMPTS_KEY);
  const all = Array.isArray(raw) ? (raw as unknown as AutoLabelPromptWire[]) : [];
  let changed = false;
  const updated = all.map((p) => {
    if (p.account_id !== account_id || !p.enabled) return p;
    if (!(p.label_ids ?? []).some((id) => remove_set.has(id))) return p;
    changed = true;
    return { ...p, enabled: false };
  });
  if (changed) persist_prompts(updated);
}
