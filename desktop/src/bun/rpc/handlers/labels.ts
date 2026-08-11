import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { rpc_send } from "../index";
import { withGmailAuth } from "../../providers/gmail/auth";
import {
  create_label,
  update_label,
  delete_label,
} from "../../providers/gmail/api";
import { getDb } from "../../db/client";
import { labels } from "../../db/schema/labels";
import { eq, and } from "drizzle-orm";

export default {
  [messages.labels_create]: async (params: {
    account_id: string;
    name: string;
    icon_name?: string | null;
  }) => {
    logger.info("rpc", `labels:create name=${params.name}`);
    const result = await withGmailAuth(params.account_id, (token) =>
      create_label(token, params.name),
    );
    getDb()
      .insert(labels)
      .values({
        id: result.id,
        account_id: params.account_id,
        name: result.name,
        icon_name: params.icon_name ?? null,
        type: result.type ?? "user",
      })
      .onConflictDoUpdate({
        target: labels.id,
        set: {
          name: result.name,
          type: result.type ?? "user",
          icon_name: params.icon_name ?? null,
        },
      })
      .run();
    rpc_send(messages.labels_changed, { account_id: params.account_id });
    return {
      id: result.id,
      name: result.name,
      icon_name: params.icon_name ?? null,
    };
  },

  [messages.labels_update]: async (
    params: AccountScopedId & { name: string; icon_name?: string | null },
  ) => {
    logger.info(
      "rpc",
      `labels:update id=${params.id.slice(0, 12)} name=${params.name}`,
    );
    await withGmailAuth(params.account_id, (token) =>
      update_label(token, params.id, params.name),
    );
    getDb()
      .update(labels)
      .set({ name: params.name, icon_name: params.icon_name ?? null })
      .where(
        and(eq(labels.id, params.id), eq(labels.account_id, params.account_id)),
      )
      .run();
    rpc_send(messages.labels_changed, { account_id: params.account_id });
    return { success: true };
  },

  [messages.labels_delete]: async (params: AccountScopedId) => {
    logger.info("rpc", `labels:delete id=${params.id.slice(0, 12)}`);
    await withGmailAuth(params.account_id, (token) =>
      delete_label(token, params.id),
    );
    getDb()
      .delete(labels)
      .where(
        and(eq(labels.id, params.id), eq(labels.account_id, params.account_id)),
      )
      .run();
    rpc_send(messages.labels_changed, { account_id: params.account_id });
    return { success: true };
  },
};
