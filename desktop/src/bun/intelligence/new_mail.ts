import type { LanguageModel } from "ai";
import { list_prompts } from "./prompts";
import { list_templates } from "./templates";
import { build_rule_context, classify_and_enqueue } from "./engine";
import { get_connection } from "./connection";
import { resolve_model } from "./providers";
import { logger } from "../utils/logger";
import { error_message } from "../../shared/errors";

type NewMailRule = {
  kind: AutoLabelRuleKindWire;
  rule_id: string;
  rule_name: string;
  rule_version: number;
};

async function classify_new_emails_for_rule(model: LanguageModel, conn: { provider: string; model: string }, account_id: string, rule: NewMailRule, email_ids: string[]): Promise<void> {
  const ctx = build_rule_context(account_id, rule);
  if (!ctx) return;

  const matched = await classify_and_enqueue(model, conn, account_id, ctx, email_ids);
  if (matched > 0) {
    logger.info("intelligence", `new mail auto-label: rule=${rule.rule_name} matched=${matched}`);
  }
}

export async function apply_auto_labels_to_new_emails(account_id: string, email_ids: string[]): Promise<void> {
  if (email_ids.length === 0) return;

  const prompts = list_prompts(account_id).filter((p) => p.enabled);
  const templates = list_templates(account_id).filter((t) => t.enabled);
  if (prompts.length === 0 && templates.length === 0) return;

  const conn = await get_connection();
  if (!conn) return;

  const model = resolve_model({ path: conn.path, provider: conn.provider, model: conn.model, endpoint: conn.endpoint, apiKey: conn.apiKey });

  const rules: NewMailRule[] = [
    ...prompts.map((p) => ({ kind: "prompt" as const, rule_id: p.id, rule_name: p.name, rule_version: p.version })),
    ...templates.map((t) => ({ kind: "template" as const, rule_id: t.id, rule_name: t.name, rule_version: t.version })),
  ];

  for (const rule of rules) {
    try {
      await classify_new_emails_for_rule(model, conn, account_id, rule, email_ids);
    } catch (e) {
      logger.error("intelligence", `new mail auto-label rule ${rule.rule_name} failed: ${error_message(e)}`);
    }
  }
}
