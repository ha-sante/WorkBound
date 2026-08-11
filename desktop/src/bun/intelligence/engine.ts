import { z } from "zod";
import crypto from "node:crypto";
import { generateText, Output, type LanguageModel } from "ai";
import { eq, and, inArray, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import { emails } from "../db/schema/emails";
import { auto_label_assignments } from "../db/schema/auto_label_assignments";
import { list_prompts } from "./prompts";
import { list_templates } from "./templates";
import { resolve_label_id } from "../db/labels";
import { get_model_input_tokens } from "./providers";
import { list_assigned_email_ids } from "../db/auto_label_assignments";
import { insert_outbox } from "../db/outbox";
import { outbox_commands } from "../../shared/outbox_commands";

export type ClassifyEmail = {
  id: string;
  from_address: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
};

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

export type RuleContext = {
  kind: AutoLabelRuleKindWire;
  rule_id: string;
  rule_version: number;
  instruction: string;
  target_label_ids: string[];
  prompt_label_ids?: string[];
  entry_label_sets?: string[][];
};

export function build_rule_context(account_id: string, job: Pick<AutoLabelJobWire, "kind" | "rule_id" | "rule_version">): RuleContext | null {
  if (job.kind === "prompt") {
    const prompt = list_prompts(account_id).find((p) => p.id === job.rule_id);
    if (!prompt) return null;
    const label_ids = prompt.label_ids.filter((id) => !!id);
    const target_label_ids = label_ids;
    const instruction = [
      `You are a mail auto-labeling assistant. For each email below, decide whether it matches the rule.`,
      `Rule: ${prompt.prompt}`,
      target_label_ids.length > 0
        ? `When an email matches, reply with apply=true — the system will add the configured labels automatically.`
        : `When an email matches, reply with apply=true.`,
    ].join("\n");
    return {
      kind: "prompt",
      rule_id: prompt.id,
      rule_version: job.rule_version,
      instruction,
      target_label_ids,
      prompt_label_ids: label_ids,
    };
  }

  const template = list_templates(account_id).find((t) => t.id === job.rule_id);
  if (!template) return null;
  const entry_label_sets = template.entries.map((e) => e.labels.map((name) => resolve_label_id(name, account_id)).filter((id): id is string => !!id));
  const target_label_ids = [...new Set(entry_label_sets.flat())];
  const entries_text = template.entries.map((e, i) =>
    `${i}: ${e.name}${e.labels.length > 0 ? ` (labels: ${e.labels.join(", ")})` : ""}\n   ${e.prompt}`,
  ).join("\n");
  const instruction = [
    `You are a mail auto-labeling assistant. For each email below, choose at most one matching category, or none.`,
    `Categories:\n${entries_text}`,
    `Reply with entry_index set to the category number that best matches, or null if no category fits.`,
  ].join("\n");
  return {
    kind: "template",
    rule_id: template.id,
    rule_version: job.rule_version,
    instruction,
    target_label_ids,
    entry_label_sets,
  };
}

export function load_email_content(account_id: string, ids: string[]): ClassifyEmail[] {
  if (ids.length === 0) return [];
  return getDb()
    .select({
      id: emails.id,
      from_address: emails.from_address,
      subject: emails.subject,
      snippet: emails.snippet,
      body_text: emails.body_text,
      body_html: emails.body_html,
    })
    .from(emails)
    .where(and(eq(emails.account_id, account_id), inArray(emails.id, ids)))
    .all() as ClassifyEmail[];
}

export function estimate_tokens(text: string | null | undefined): number {
  const chars = (text ?? "").length;
  return Math.ceil(chars / 4) + 50;
}

function strip_html(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function email_content_text(email: ClassifyEmail): string {
  const body = email.body_text && email.body_text.trim().length > 0
    ? email.body_text
    : email.body_html ? strip_html(email.body_html) : "";
  const parts = [
    email.from_address ? `From: ${email.from_address}` : null,
    email.subject ? `Subject: ${email.subject}` : null,
    email.snippet ? `Snippet: ${email.snippet}` : null,
    body ? `Body: ${body.slice(0, 2000)}` : null,
  ].filter((p): p is string => !!p);
  return parts.join("\n");
}

export const estimate_email_tokens = (email: ClassifyEmail) => estimate_tokens(email_content_text(email));

// system is a 2 way budget
// each email is counted at input & output (70% input max & output max budget)
// stops batching if any is met.
const INPUT_FRACTION = 0.7;
const OUTPUT_TOKENS_PER_DECISION = 25;
const OUTPUT_BATCH_OVERHEAD = 150;
const OUTPUT_CEILING = 8000;

const output_budget = (model_limit: number): number => Math.min((1 - INPUT_FRACTION) * model_limit, OUTPUT_CEILING);

export function pack_batches(emails_list: ClassifyEmail[], instruction_chars: number, model_limit: number): ClassifyEmail[][] {
  const budget = model_limit * INPUT_FRACTION;
  const instruction_tokens = Math.ceil(instruction_chars / 4) + 50;
  const output_max = output_budget(model_limit);
  const batches: ClassifyEmail[][] = [];
  let current: ClassifyEmail[] = [];
  let current_tokens = instruction_tokens;

  const output_cost = (count: number) => count * OUTPUT_TOKENS_PER_DECISION + OUTPUT_BATCH_OVERHEAD;

  for (const email of emails_list) {
    const cost = estimate_email_tokens(email);
    if (current.length > 0 && (current_tokens + cost > budget || output_cost(current.length + 1) > output_max)) {
      batches.push(current);
      current = [];
      current_tokens = instruction_tokens;
    }
    current.push(email);
    current_tokens += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const prompt_schema = z.object({
  decisions: z.array(z.object({ id: z.string(), apply: z.boolean() })),
});

const template_schema = z.object({
  decisions: z.array(z.object({ id: z.string(), entry_index: z.number().nullable() })),
});

export async function classify_batch(model: LanguageModel, ctx: RuleContext, emails_list: ClassifyEmail[],): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (emails_list.length === 0) return result;

  const id_set = new Set(emails_list.map((e) => e.id));
  const batch_output_tokens = emails_list.length * OUTPUT_TOKENS_PER_DECISION + OUTPUT_BATCH_OVERHEAD;
  const prompt = [
    ctx.instruction,
    "",
    ...emails_list.map((e) => `<email id="${e.id}">\n${email_content_text(e)}\n</email>`),
    "",
    `Now decide for each email. Return a decision for every email id listed above.`,
  ].join("\n");

  if (ctx.kind === "prompt") {
    const gen = await generateText({
      model,
      output: Output.object({ schema: prompt_schema }),
      prompt,
      maxOutputTokens: batch_output_tokens,
    });
    const parsed = await gen.output;
    const target = ctx.prompt_label_ids ?? [];
    for (const d of parsed.decisions) {
      if (!id_set.has(d.id)) continue;
      if (d.apply) result.set(d.id, target);
    }
    return result;
  }

  const gen = await generateText({
    model,
    output: Output.object({ schema: template_schema }),
    prompt,
    maxOutputTokens: batch_output_tokens,
  });
  const parsed = await gen.output;
  const entry_sets = ctx.entry_label_sets ?? [];
  for (const d of parsed.decisions) {
    if (!id_set.has(d.id)) continue;
    if (d.entry_index === null || d.entry_index === undefined) continue;
    if (d.entry_index < 0 || d.entry_index >= entry_sets.length) continue;
    const labels = entry_sets[d.entry_index];
    if (labels.length === 0) continue;
    result.set(d.id, labels);
  }
  return result;
}

function parse_labels_json(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function chunk_array<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

type ReconGroup = { add_label_ids: string[]; remove_label_ids: string[]; email_ids: string[] };

function get_old_applied_by_email(account_id: string, rule_id: string, current_rule_version: number, target_set: Set<string>): Map<string, string[]> {
  return new Map<string, string[]>(
    getDb()
      .select({ email_id: auto_label_assignments.email_id, label_ids: auto_label_assignments.label_ids })
      .from(auto_label_assignments)
      .where(and(
        eq(auto_label_assignments.account_id, account_id),
        eq(auto_label_assignments.rule_id, rule_id),
        ne(auto_label_assignments.rule_version, current_rule_version),
      ))
      .all()
      .map((r) => {
        let parsed: unknown = [];
        try {
          parsed = r.label_ids ? JSON.parse(r.label_ids) : [];
        } catch {
          parsed = [];
        }
        const labels = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
        return [r.email_id, labels.filter((l) => target_set.has(l))] as const;
      }),
  );
}

function enqueue_add_only_batches(params: {
  account_id: string;
  ctx: RuleContext;
  auto_label_job_id?: string;
  matched: { email_id: string; label_ids: string[] }[];
}): number {
  const { account_id, ctx, auto_label_job_id, matched } = params;

  const by_labels = new Map<string, { label_ids: string[]; email_ids: string[] }>();
  for (const m of matched) {
    const key = [...m.label_ids].sort().join(",");
    if (!by_labels.has(key)) by_labels.set(key, { label_ids: m.label_ids, email_ids: [] });
    by_labels.get(key)!.email_ids.push(m.email_id);
  }

  for (const group of by_labels.values()) {
    for (const ids of chunk_array(group.email_ids, 1000)) {
      insert_outbox({
        id: crypto.randomUUID(),
        account_id,
        command: outbox_commands.label_batch,
        payload: JSON.stringify({ add_label_ids: group.label_ids }),
        extras: JSON.stringify({
          email_ids: ids,
          rule_id: ctx.rule_id,
          rule_version: ctx.rule_version,
          ...(auto_label_job_id ? { auto_label_job_id } : {}),
        }),
        status: "queued",
        created_at: Date.now(),
      });
    }
  }

  return matched.length;
}

function enqueue_reconcile_batches(params: {
  account_id: string;
  ctx: RuleContext;
  auto_label_job_id?: string;
  to_classify: string[];
  new_labels_by_email: Map<string, string[]>;
  old_applied_by_email: Map<string, string[]>;
}): number {
  const { account_id, ctx, auto_label_job_id, to_classify, new_labels_by_email, old_applied_by_email } = params;

  const by_add_remove = new Map<string, ReconGroup>();
  let matches_count = 0;

  for (const email_id of to_classify) {
    const new_labels = new_labels_by_email.get(email_id) ?? [];
    const old_labels = old_applied_by_email.get(email_id) ?? [];

    if (new_labels.length > 0) matches_count++;

    const remove_label_ids = old_labels.filter((l) => !new_labels.includes(l));
    const add_label_ids = new_labels;
    if (add_label_ids.length === 0 && remove_label_ids.length === 0) continue;

    const key = `${[...add_label_ids].sort().join(",")}|${[...remove_label_ids].sort().join(",")}`;
    if (!by_add_remove.has(key)) by_add_remove.set(key, { add_label_ids, remove_label_ids, email_ids: [] });
    by_add_remove.get(key)!.email_ids.push(email_id);
  }

  for (const group of by_add_remove.values()) {
    for (const ids of chunk_array(group.email_ids, 1000)) {
      insert_outbox({
        id: crypto.randomUUID(),
        account_id,
        command: outbox_commands.label_batch,
        payload: JSON.stringify({ add_label_ids: group.add_label_ids, remove_label_ids: group.remove_label_ids }),
        extras: JSON.stringify({
          email_ids: ids,
          rule_id: ctx.rule_id,
          rule_version: ctx.rule_version,
          ...(auto_label_job_id ? { auto_label_job_id } : {}),
        }),
        status: "queued",
        created_at: Date.now(),
      });
    }
  }

  return matches_count;
}

export type ClassifyAndEnqueueOpts = {
  auto_label_job_id?: string;
  signal?: AbortSignal;
  on_progress?: (scanned: number, matches: number) => void | Promise<void>;
  // When true, we reconcile label assignments for this rule/version by:
  // - removing label_ids that were previously applied by older versions
  // - adding label_ids for the new classification
  // This is used for "apply prompt update" flows.
  reconcile?: boolean;
};

export async function classify_and_enqueue(
  model: LanguageModel,
  conn: { provider: string; model: string },
  account_id: string,
  ctx: RuleContext,
  email_ids: string[],
  opts: ClassifyAndEnqueueOpts = {},
): Promise<number> {
  const { auto_label_job_id, signal, on_progress, reconcile } = opts;

  const assigned = new Set(list_assigned_email_ids(account_id, ctx.rule_id, ctx.rule_version));
  const candidates = email_ids.filter((id) => !assigned.has(id));
  if (candidates.length === 0) return 0;

  const label_rows = getDb()
    .select({ id: emails.id, labels: emails.labels, folder: emails.folder })
    .from(emails)
    .where(inArray(emails.id, candidates))
    .all();
  const target_set = new Set(ctx.target_label_ids);

  // Map of label IDs that were previously applied by this rule_id in older versions.
  // Used to compute remove_label_ids during reconciliation.
  const old_applied_by_email = reconcile
    ? get_old_applied_by_email(account_id, ctx.rule_id, ctx.rule_version, target_set)
    : new Map<string, string[]>();

  const to_classify = label_rows
    .filter((r) => {
      if (r.folder !== "inbox") return false;
      const old_labels = old_applied_by_email.get(r.id) ?? [];
      const has_old = old_labels.length > 0;
      const has_target_now = parse_labels_json(r.labels).some((l) => target_set.has(l));

      // Add-only behavior: classify only when we don't already see any target labels.
      // Reconcile behavior: classify when we might need additions OR removals.
      return reconcile ? (!has_target_now || has_old) : !has_target_now;
    })
    .map((r) => r.id);
  if (to_classify.length === 0) return 0;

  const content = load_email_content(account_id, to_classify);
  const model_limit = get_model_input_tokens(conn.provider, conn.model);
  const batches = pack_batches(content, ctx.instruction.length, model_limit);

  const matched: { email_id: string; label_ids: string[] }[] = [];
  let scanned = 0;
  for (const batch of batches) {
    if (signal?.aborted) throw new CancelledError();
    const decisions = await classify_batch(model, ctx, batch);
    for (const [id, labels] of decisions) matched.push({ email_id: id, label_ids: labels });
    scanned += batch.length;
    if (on_progress) await on_progress(scanned, matched.length);
    await Bun.sleep(0);
  }
  if (!reconcile && matched.length === 0) return 0;

  if (!reconcile) {
    return enqueue_add_only_batches({ account_id, ctx, auto_label_job_id, matched });
  }

  // Reconciliation: we need a decision for every classified email.
  const new_labels_by_email = new Map<string, string[]>();
  for (const m of matched) new_labels_by_email.set(m.email_id, m.label_ids);

  return enqueue_reconcile_batches({
    account_id,
    ctx,
    auto_label_job_id,
    to_classify,
    new_labels_by_email,
    old_applied_by_email,
  });
}
