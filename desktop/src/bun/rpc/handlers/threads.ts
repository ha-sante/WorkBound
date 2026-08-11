import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { Tel } from "../../utils/tel";
import { get_thread, get_thread_emails, get_thread_email_previews } from "../../db/threads";

const tel = new Tel("thread_rpc");

export default {
  [messages.thread_get]: async (params: EntityId) => {
    const t = tel.start("thread_get", params.id);
    const t0 = performance.now();
    try {
      const thread = get_thread(params.id);
      t.mark("query_db");
      logger.info("rpc", `thread:get id=${params.id} found=${!!thread} total=${(performance.now() - t0).toFixed(0)}ms`);
      return thread;
    } finally {
      t.done();
    }
  },
  [messages.thread_emails]: async (params: ThreadId) => {
    const t = tel.start("thread_emails", params.thread_id);
    const t0 = performance.now();
    try {
      const emails = get_thread_emails(params.thread_id);
      t.mark("query_db");
      logger.info("rpc", `thread:emails thread_id=${params.thread_id} count=${emails.length} total=${(performance.now() - t0).toFixed(0)}ms`);
      return emails;
    } finally {
      t.done();
    }
  },
  [messages.thread_previews]: async (params: ThreadId) => {
    const t = tel.start("thread_previews", params.thread_id);
    const t0 = performance.now();
    try {
      const previews = get_thread_email_previews(params.thread_id);
      t.mark("query_db");
      logger.info("rpc", `thread:previews thread_id=${params.thread_id} count=${previews.length} total=${(performance.now() - t0).toFixed(0)}ms`);
      return previews;
    } finally {
      t.done();
    }
  },
};
