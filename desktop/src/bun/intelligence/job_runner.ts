import { sql } from "drizzle-orm";
import { APICallError, RetryError, TypeValidationError, InvalidResponseDataError, NoOutputGeneratedError, LoadAPIKeyError, AISDKError } from "ai";
import { getDb } from "../db/client";
import { emails } from "../db/schema/emails";
import { insert_auto_label_job, get_auto_label_job, list_auto_label_jobs, pick_queued_auto_label_job, update_auto_label_job } from "../db/auto_label_jobs";
import { cancel_outbox_for_job } from "../db/outbox";
import { rpc_send } from "../rpc";
import { messages } from "../../shared/rpc_messages";
import { error_message } from "../../shared/errors";
import { logger } from "../utils/logger";
import { backoff_delay_ms } from "../utils/retry";
import { make_auto_label_id } from "../utils/crypto";
import { build_rule_context, classify_and_enqueue, CancelledError } from "./engine";
import { get_connection } from "./connection";
import { resolve_model } from "./providers";

const running_jobs = new Map<string, AbortController>();
const job_retries = new Map<string, number>();

const push_progress = (row: AutoLabelJobWire) => rpc_send(messages.intelligence_auto_label_job_progress, row);
function push_finished(row: AutoLabelJobWire) {
  if (row.status === "failed") {
    rpc_send(messages.intelligence_auto_label_job_error, row);
  } else {
    rpc_send(messages.intelligence_auto_label_job_done, row);
  }
}

export function enqueue_job(input: AutoLabelJobEnqueueInputWire): AutoLabelJobWire {
  return insert_auto_label_job({
    ...input,
    scope_limit: input.scope === "recent" ? Math.max(1, Math.floor(input.scope_limit ?? 1000)) : null,
    id: make_auto_label_id("alj"),
    status: "queued",
    created_at: Date.now(),
  });
}

export function list_jobs(account_id: string): AutoLabelJobWire[] {
  return list_auto_label_jobs(account_id);
}

export function cancel_job(account_id: string, id: string): boolean {
  const row = get_auto_label_job(id);
  if (!row || row.account_id !== account_id) return false;
  if (row.status === "queued") {
    cancel_outbox_for_job(id);
    const updated = update_auto_label_job(id, { status: "cancelled", finished_at: Date.now() });
    push_finished(updated);
    return true;
  }
  if (row.status === "running") {
    const ctrl = running_jobs.get(id);
    ctrl?.abort();
    return true;
  }
  return false;
}

function build_candidate_ids(account_id: string, scope: AutoLabelJobScopeWire, scope_limit: number | null): string[] {
  const base = sql`${emails.account_id} = ${account_id} AND ${emails.folder} = 'inbox'`;
  const order = sql`COALESCE(${emails.received_at}, ${emails.created_at}) DESC, ${emails.id} DESC`;
  if (scope === "recent") {
    return getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(base)
      .orderBy(order)
      .limit(scope_limit ?? 1000)
      .all()
      .map((r) => r.id);
  }
  return getDb().select({ id: emails.id }).from(emails).where(base).orderBy(order).all().map((r) => r.id);
}

type ErrorVerdict =
  | { kind: "abort" }
  | { kind: "transient"; detail: string }
  | { kind: "permanent"; message: string };

function classify_error(e: unknown): ErrorVerdict {
  if (e instanceof CancelledError) return { kind: "abort" };
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return { kind: "abort" };

  if (RetryError.isInstance(e)) {
    return { kind: "transient", detail: e.message };
  }

  if (APICallError.isInstance(e)) {
    const code = e.statusCode;
    if (code === 401 || code === 403) {
      return { kind: "permanent", message: `AI authentication failed (HTTP ${code}). Check your API key in Settings → Intelligence.` };
    }
    if (e.isRetryable === true || (code !== undefined && (code >= 500 || code === 429))) {
      return { kind: "transient", detail: `AI API error (HTTP ${code ?? "unknown"}): ${e.message}` };
    }
    return { kind: "permanent", message: `AI API error (HTTP ${code ?? "unknown"}): ${e.message}` };
  }

  if (TypeValidationError.isInstance(e)) {
    return { kind: "permanent", message: `Model output failed validation: ${e.message}` };
  }

  if (InvalidResponseDataError.isInstance(e)) {
    return { kind: "permanent", message: `Provider returned invalid data: ${e.message}` };
  }

  if (NoOutputGeneratedError.isInstance(e)) {
    return { kind: "transient", detail: "Model was cut off before producing a complete result (output token limit). Retrying." };
  }

  if (LoadAPIKeyError.isInstance(e)) {
    return { kind: "permanent", message: "AI API key is missing or invalid. Check Settings → Intelligence." };
  }

  if (AISDKError.isInstance(e)) {
    if (e.cause !== undefined) return classify_error(e.cause);
    return { kind: "permanent", message: `AI error: ${e.message}` };
  }

  if (e instanceof TypeError) {
    return { kind: "transient", detail: e.message };
  }

  return { kind: "permanent", message: error_message(e) };
}

async function run_job(row: AutoLabelJobWire) {
  const ctrl = new AbortController();
  running_jobs.set(row.id, ctrl);
  const retry_count = job_retries.get(row.id) ?? 0;
  let updated = update_auto_label_job(row.id, { status: "running", started_at: Date.now(), error: null });
  push_progress(updated);
  try {
    const account_id = updated.account_id;
    const ctx = build_rule_context(account_id, updated);
    if (!ctx) throw new Error("Rule not found or was deleted.");

    const ids = build_candidate_ids(account_id, updated.scope, updated.scope_limit);
    if (ctrl.signal.aborted) throw new CancelledError();
    updated = update_auto_label_job(row.id, { total: ids.length });
    push_progress(updated);

    const conn = await get_connection();
    if (!conn) throw new Error("No AI connection configured. Set one up in Settings → Intelligence.");

    const model = resolve_model({ path: conn.path, provider: conn.provider, model: conn.model, endpoint: conn.endpoint, apiKey: conn.apiKey });
    const matches = await classify_and_enqueue(model, conn, account_id, ctx, ids, {
      auto_label_job_id: row.id,
      signal: ctrl.signal,
      reconcile: true,
      on_progress: (scanned, matches) => {
        updated = update_auto_label_job(row.id, { scanned, matches });
        push_progress(updated);
      },
    });

    updated = update_auto_label_job(row.id, { status: "done", applied: matches, finished_at: Date.now() });
    job_retries.delete(row.id);
    push_finished(updated);
  } catch (e) {
    const file_log = logger.file("intelligence");
    const err_ref = e as { name?: string; message?: string; cause?: unknown };
    const cause_ref = err_ref.cause as { name?: string; message?: string } | undefined;
    file_log.error(
      `auto label job ${row.id} error detail: [${err_ref.name ?? "UnknownError"}] ${err_ref.message ?? String(e)}${
        cause_ref ? ` | cause: [${cause_ref?.name}] ${cause_ref?.message}` : ""
      }`,
    );
    const verdict = classify_error(e);
    if (verdict.kind === "abort") {
      job_retries.delete(row.id);
      updated = update_auto_label_job(row.id, { status: "cancelled", finished_at: Date.now() });
      push_finished(updated);
    } else if (verdict.kind === "transient") {
      const next_retry = retry_count + 1;
      job_retries.set(row.id, next_retry);
      const delay = backoff_delay_ms(retry_count, 30_000, 30 * 60_000);
      logger.warn("intelligence", `auto label job ${row.id} transient error, retry in ${delay}ms: ${verdict.detail}`);
      updated = update_auto_label_job(row.id, { status: "queued", created_at: Date.now() + delay, error: verdict.detail, started_at: null, finished_at: null });
      push_progress(updated);
    } else {
      job_retries.delete(row.id);
      logger.error("intelligence", `auto label job ${row.id} failed: ${verdict.message}`);
      updated = update_auto_label_job(row.id, { status: "failed", error: verdict.message, finished_at: Date.now() });
      push_finished(updated);
    }
  } finally {
    running_jobs.delete(row.id);
  }
}

let runner_timer: ReturnType<typeof setInterval> | null = null;

export function start_auto_label_job_runner() {
  if (runner_timer) return;
  runner_timer = setInterval(() => {
    try {
      const job = pick_queued_auto_label_job();
      if (job && !running_jobs.has(job.id)) {
        void run_job(job);
      }
    } catch (e) {
      logger.error("intelligence", `auto label runner error: ${error_message(e)}`);
    }
  }, 2000);
}

export function stop_auto_label_job_runner() {
  if (runner_timer) {
    clearInterval(runner_timer);
    runner_timer = null;
  }
  for (const [id, ctrl] of running_jobs) {
    ctrl.abort();
    running_jobs.delete(id);
  }
  job_retries.clear();
}
