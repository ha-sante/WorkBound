import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { search_contacts, list_contacts, create_contact, update_contact, delete_contact } from "../../db/contacts";

function to_wire(c: ContactRow): ContactWire {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    last_contacted_at: c.last_contacted_at ?? null,
    times_contacted: c.times_contacted,
    emails_received: c.emails_received,
    emails_sent: c.emails_sent,
    avatar_url: c.avatar_url ?? null,
  };
}

export default {
  [messages.contacts_search]: async (params: { account_id: string; q: string; limit?: number }) => {
    logger.info("rpc", `contacts:search account_id=${params.account_id} q="${params.q}"`);
    return search_contacts(params.account_id, params.q, params.limit ?? 10).map(to_wire);
  },

  [messages.contacts_list]: async (params: AccountScope) => {
    logger.info("rpc", `contacts:list account_id=${params.account_id}`);
    return list_contacts(params.account_id).map(to_wire);
  },

  [messages.contacts_create]: async (params: { account_id: string; name?: string; email: string }) => {
    logger.info("rpc", `contacts:create account_id=${params.account_id} email=${params.email}`);
    const row = create_contact(params.account_id, params);
    return to_wire(row);
  },

  [messages.contacts_update]: async (params: { id: string; name?: string; email?: string }) => {
    logger.info("rpc", `contacts:update id=${params.id}`);
    update_contact(params.id, { name: params.name, email: params.email });
    return { success: true };
  },

  [messages.contacts_delete]: async (params: EntityId) => {
    logger.info("rpc", `contacts:delete id=${params.id}`);
    delete_contact(params.id);
    return { success: true };
  },
};
