import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { withGmailAuth } from "../../providers/gmail/auth";
import {
  fetch_filters,
  create_filter,
  delete_filter,
} from "../../providers/gmail/api";
import { getDb } from "../../db/client";
import { labels } from "../../db/schema/labels";
import { and, eq, inArray } from "drizzle-orm";

const SYSTEM_LABEL_NAMES: Record<string, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFT: "Drafts",
  STARRED: "Starred",
  IMPORTANT: "Important",
  TRASH: "Trash",
  SPAM: "Spam",
  CATEGORY_PRIMARY: "Primary",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
  UNREAD: "Unread",
};

const CATEGORY_IDS: Record<string, string> = {
  CATEGORY_PRIMARY: "Primary",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

export default {
  [messages.filters_list]: async (params: AccountScope) => {
    logger.info(
      "rpc",
      `filters:list account_id=${params.account_id.slice(0, 8)}`,
    );
    const filters = await withGmailAuth(params.account_id, (token) =>
      fetch_filters(token),
    );

    const allIds = new Set<string>();
    for (const f of filters) {
      for (const id of [
        ...(f.action.add_label_ids ?? []),
        ...(f.action.remove_label_ids ?? []),
      ]) {
        if (!SYSTEM_LABEL_NAMES[id]) allIds.add(id);
      }
    }
    const labelMap = new Map<string, string>();
    if (allIds.size > 0) {
      const rows = getDb()
        .select({ id: labels.id, name: labels.name })
        .from(labels)
        .where(
          and(
            eq(labels.account_id, params.account_id),
            inArray(labels.id, [...allIds]),
          ),
        )
        .all();
      for (const r of rows) labelMap.set(r.id, r.name);
    }
    const resolve = (id: string) =>
      labelMap.get(id) ?? SYSTEM_LABEL_NAMES[id] ?? id;

    return filters.map((f) => ({
      ...f,
      account_id: params.account_id,
      criteria: f.criteria,
      action: {
        add_label_ids: f.action.add_label_ids?.map(resolve),
        remove_label_ids: f.action.remove_label_ids?.map(resolve),
        forward: f.action.forward,
      },
      actionRaw: f.action,
    }));
  },

  [messages.filters_create]: async (params: {
    account_id: string;
    criteria: FilterCriteriaWire;
    action: FilterActionWire;
  }) => {
    logger.info(
      "rpc",
      `filters:create account_id=${params.account_id.slice(0, 8)}`,
    );
    const result = await withGmailAuth(params.account_id, (token) =>
      create_filter(token, params.criteria, params.action),
    );
    return { id: result.id };
  },

  [messages.filters_delete]: async (params: AccountScopedId) => {
    logger.info("rpc", `filters:delete id=${params.id.slice(0, 8)}`);
    await withGmailAuth(params.account_id, (token) =>
      delete_filter(token, params.id),
    );
    return { success: true };
  },

  [messages.labels_list]: async (params: AccountScope) => {
    logger.info(
      "rpc",
      `labels:list account_id=${params.account_id.slice(0, 8)}`,
    );
    const userLabels = getDb()
      .select({ id: labels.id, name: labels.name, icon_name: labels.icon_name })
      .from(labels)
      .where(
        and(eq(labels.account_id, params.account_id), eq(labels.type, "user")),
      )
      .all();
    const systemLabels = Object.entries(SYSTEM_LABEL_NAMES)
      .filter(([id]) => !id.startsWith("CATEGORY_") && id !== "UNREAD")
      .map(([id, name]) => ({ id, name }));
    const categories = Object.entries(CATEGORY_IDS).map(([id, name]) => ({
      id,
      name,
    }));
    return { userLabels, systemLabels, categories };
  },
};
