import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { list_providers } from "../../intelligence/providers";
import { get_connection, save_connection, delete_connection, test_connection, type IntelligenceConnectionInput } from "../../intelligence/connection";
import { list_prompts, create_prompt, update_prompt, delete_prompt } from "../../intelligence/prompts";
import { list_templates, create_template, update_template, delete_template } from "../../intelligence/templates";
import { enqueue_job, list_jobs, cancel_job } from "../../intelligence/job_runner";

export default {
  [messages.intelligence_get_providers]: async () => {
    logger.info("rpc", "intelligence:get_providers");
    return list_providers();
  },

  [messages.intelligence_get_connection]: async () => {
    logger.info("rpc", "intelligence:get_connection");
    return await get_connection();
  },

  [messages.intelligence_save_connection]: async (params: IntelligenceConnectionInput) => {
    logger.info("rpc", `intelligence:save_connection path=${params.path} provider=${params.provider} model=${params.model}`);
    const connection = await save_connection(params);
    const test = await test_connection(params);
    logger.info("rpc", `intelligence:save_connection test auth=${test.auth.ok} model=${test.model.ok} structured=${test.structuredOutput.ok}`);
    return { connection, test };
  },

  [messages.intelligence_test_connection]: async (params: IntelligenceConnectionInput) => {
    logger.info("rpc", `intelligence:test_connection path=${params.path} provider=${params.provider} model=${params.model}`);
    return test_connection(params);
  },

  [messages.intelligence_delete_connection]: async () => {
    logger.info("rpc", "intelligence:delete_connection");
    await delete_connection();
    return { success: true };
  },

  [messages.intelligence_auto_label_prompts_list]: async (params: AccountScope) => {
    logger.info("rpc", "intelligence:auto_label_prompts_list");
    return list_prompts(params.account_id);
  },

  [messages.intelligence_auto_label_prompts_create]: async (params: AccountScope & AutoLabelPromptInputWire) => {
    logger.info("rpc", `intelligence:auto_label_prompts_create labels=${params.label_ids.length} name=${params.name}`);
    return create_prompt(params.account_id, params);
  },

  [messages.intelligence_auto_label_prompts_update]: async (params: AccountScopedId & AutoLabelPromptInputWire) => {
    logger.info("rpc", `intelligence:auto_label_prompts_update id=${params.id.slice(0, 8)}`);
    return update_prompt(params.account_id, params.id, params);
  },

  [messages.intelligence_auto_label_prompts_delete]: async (params: AccountScopedId) => {
    logger.info("rpc", `intelligence:auto_label_prompts_delete id=${params.id.slice(0, 8)}`);
    delete_prompt(params.account_id, params.id);
    return { success: true };
  },

  [messages.intelligence_label_templates_list]: async (params: AccountScope) => {
    logger.info("rpc", "intelligence:label_templates_list");
    return list_templates(params.account_id);
  },

  [messages.intelligence_label_templates_create]: async (params: { account_id: string; name: string; entries: AutoLabelTemplateEntryInputWire[]; enabled: boolean }) => {
    logger.info("rpc", `intelligence:label_templates_create name=${params.name} entries=${params.entries.length}`);
    return create_template(params.account_id, { name: params.name, entries: params.entries, enabled: params.enabled });
  },

  [messages.intelligence_label_templates_update]: async (params: AccountScopedId & { name: string; entries: AutoLabelTemplateEntryInputWire[]; enabled: boolean }) => {
    logger.info("rpc", `intelligence:label_templates_update id=${params.id.slice(0, 8)} entries=${params.entries.length}`);
    return update_template(params.account_id, params.id, { name: params.name, entries: params.entries, enabled: params.enabled });
  },

  [messages.intelligence_label_templates_delete]: async (params: AccountScopedId) => {
    logger.info("rpc", `intelligence:label_templates_delete id=${params.id.slice(0, 8)}`);
    delete_template(params.account_id, params.id);
    return { success: true };
  },

  [messages.intelligence_auto_label_jobs_enqueue]: async (params: AutoLabelJobEnqueueInputWire) => {
    logger.info("rpc", `intelligence:auto_label_jobs_enqueue kind=${params.kind} rule=${params.rule_id.slice(0, 8)} scope=${params.scope}`);
    return enqueue_job(params);
  },

  [messages.intelligence_auto_label_jobs_list]: async (params: AccountScope) => {
    logger.info("rpc", "intelligence:auto_label_jobs_list");
    return list_jobs(params.account_id);
  },

  [messages.intelligence_auto_label_jobs_cancel]: async (params: AccountScopedId) => {
    logger.info("rpc", `intelligence:auto_label_jobs_cancel id=${params.id.slice(0, 8)}`);
    return { success: cancel_job(params.account_id, params.id) };
  },
};
