import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import {
  list_signature_templates,
  create_signature_template,
  update_signature_template,
  delete_signature_template,
  upsert_signature_template_by_body,
  type SignatureTemplateRow,
  type SignatureTemplateInsert,
} from "../../db/signature_templates";
import { list_send_as_aliases } from "../../db/send_as";

function to_wire(row: SignatureTemplateRow): SignatureTemplateWire {
  return {
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    body: row.body,
  };
}

export default {
  [messages.signature_list]: async (params: AccountScope) => {
    let rows = list_signature_templates(params.account_id);

    if (rows.length === 0) {
      const aliases = list_send_as_aliases(params.account_id);
      let imported = 0;
      for (const a of aliases) {
        if (a.signature) {
          upsert_signature_template_by_body(
            params.account_id,
            a.signature,
            `Default (${a.send_as_email})`,
          );
          imported++;
        }
      }
      if (imported) {
        logger.info("signatures", `auto-imported ${imported} Gmail signatures as templates for ${params.account_id.slice(0, 8)}`);
        rows = list_signature_templates(params.account_id);
      }
    }

    return rows.map(to_wire);
  },

  [messages.signature_create]: async (params: { account_id: string; name: string; body: string }) => {
    const data: SignatureTemplateInsert = {
      id: crypto.randomUUID(),
      account_id: params.account_id,
      name: params.name,
      body: params.body,
    };
    create_signature_template(data);
    logger.info("signatures", `created template "${params.name}" for account ${params.account_id.slice(0, 8)}`);
    return to_wire(data as SignatureTemplateRow);
  },

  [messages.signature_update]: async (params: { id: string; name?: string; body?: string }) => {
    const updates: { name?: string; body?: string } = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.body !== undefined) updates.body = params.body;
    update_signature_template(params.id, updates);
    return { success: true };
  },

  [messages.signature_delete]: async (params: EntityId) => {
    delete_signature_template(params.id);
    return { success: true };
  },
};
