import { useState, useEffect, useCallback } from "react";
import { ChevronRight, Send, Trash2, ExternalLink, Check, RefreshCw } from "lucide-react";
import { messages } from "@/shared/rpc_messages";
import { outbox_commands } from "@/shared/outbox_commands";
import type { AccountDiag } from "./types";
import { Row, format_size } from "./row";
import { ConfigRow } from "./config_row";
import { useConfig } from "../../hooks/use_config";
import { useOutboxItems } from "../../hooks/use_outbox_items";
import type { SyncEngineState } from "../../hooks/sync_state";
import { rpc } from "../../rpc";
import { format_date, format_date_full } from "@/shared/datetime";
import { percent_progress } from "@/mainview/utils/percent";
import { workbound_config } from "@/shared/config";
import { WorkboundedBadge } from "./workbounded_badge";

const WORKBOUNDED_PREF_KEY = "workbounded";
const WORKBOUNDED_PAYMENT_LINK = workbound_config.GET_WORKBOUNDED_PAYMENT_LINK;
const SUPPORT_PERSON_EMAIL = workbound_config.SUPPORT_PERSON_EMAIL;

function WorkboundedSection() {
  const [status, setStatus] = useState<"loading" | "not_started" | "workbounded">("loading");

  useEffect(() => {
    let mounted = true;
    rpc.request(messages.prefs_get, { key: WORKBOUNDED_PREF_KEY })
      .then((res) => {
        if (mounted) setStatus(Boolean(res?.value) ? "workbounded" : "not_started");
      })
      .catch(() => {
        if (mounted) setStatus("not_started");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handle_get_workbounded = () => {
    rpc.request(messages.url_open, { url: WORKBOUNDED_PAYMENT_LINK }).catch(() => {});
  };

  const handle_i_am_workbounded = async () => {
    await rpc.request(messages.prefs_set, { key: WORKBOUNDED_PREF_KEY, value: true });
    setStatus("workbounded");
  };

  return (
    <div className="space-y-4">
      <div className="text-sm space-y-2">
        <ol className="list-decimal list-inside space-y-1 text-text-secondary">
          <li>Payment for using the shared Services follows an Honor System.</li>
          <li>Nothing in the app is going to block you from using it.</li>
          <li>
            However it is worth it to know the shared service costs money:
            <ul className="list-disc list-inside ml-4 mt-1 text-text-secondary">
              <li>image proxy</li>
              <li>auth proxy</li>
              <li>code signing</li>
              <li>and future project related costs.</li>
            </ul>
          </li>
          <li>If you choose to pay, the minimum payment is $10 and you get the workbounded badge.</li>
          <li>Thank you very much.</li>
        </ol>
      </div>

        {status === "workbounded" ? (
          <WorkboundedBadge />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handle_get_workbounded}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md border border-border-subtle text-text-secondary hover:bg-black/[0.04] transition-colors cursor-pointer">
              <ExternalLink size={14} />
              Get Workbounded
            </button>
            <button
              onClick={handle_i_am_workbounded}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md border border-border-subtle text-text-secondary hover:bg-black/[0.04] transition-colors cursor-pointer">
              <Check size={14} />
              I am workbounded
            </button>
          </div>
        )}
    </div>
  );
}

function ConfigurationsSection() {
  const { entries, refresh } = useConfig();

  const handleSave = async (key: string, value: string) => {
    await rpc.request(messages.config_set, { key, value: value || undefined });
    await refresh();
  };

  const handleReset = async (key: string) => {
    await rpc.request(messages.config_set, { key, value: undefined });
    await refresh();
  };

  return (
    <div className="border border-border-subtle rounded divide-y divide-border-subtle">
      {entries.map((entry) => (
        <ConfigRow key={entry.key} entry={entry} onSave={handleSave} onReset={handleReset} />
      ))}
    </div>
  );
}

function DatabaseSection({ database }: { database: DiagData["database"] }) {
  return (
    <div className="space-y-1">
      <Row label="Path" mono>{database.path}</Row>
      <Row label="Size">{format_size(database.size)}</Row>
      <Row label="Emails">{database.emailCount.toLocaleString()}</Row>
      <Row label="Threads">{database.threadCount.toLocaleString()}</Row>
      <Row label="Attachments">{database.attachmentCount.toLocaleString()}</Row>
      <Row label="Accounts">{database.accountCount}</Row>
    </div>
  );
}

function AccountCard({ account }: { account: AccountDiag }) {
  return (
    <div className="mb-3 pb-3 border-b border-border-subtle last:border-0 last:mb-0 last:pb-0">
      <p className="font-medium text-text-primary">{account.email}</p>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row label="Provider">{account.provider}</Row>
        <Row label="Created">{format_date_full(account.created_at ?? null) || "\u2014"}</Row>
        <Row label="Active">{account.is_active ? "Yes" : "No"}</Row>
      </div>
    </div>
  );
}

function AccountsSection({ accounts }: { accounts: AccountDiag[] }) {
  return (
    <div>
      {accounts.length === 0 && <p className="text-text-secondary italic text-sm">No accounts</p>}
      {accounts.map((acc) => <AccountCard key={acc.id} account={acc} />)}
    </div>
  );
}

function SyncCard({ account, syncState }: { account: AccountDiag; syncState: SyncEngineState }) {
  const totalMessages = syncState.backfill.totalMessages ?? account.backfill_state?.backfill_initial_total_messages ?? null;
  const isLiveSyncing = syncState.backfill.status === "syncing";
  const backfill_status = syncState.backfill.status !== "idle" ? syncState.backfill.status : (account.backfill_state?.backfill_done ? "done" : account.backfill_state?.backfill_status ?? "idle");
  const newfill_status = syncState.newfill.isSyncing ? "syncing" : (account.newfill_state?.newfill_status ?? "idle");
  const nf = account.newfill_state;
  const backfill_done = backfill_status === "done";

  return (
    <div className="mb-3 pb-3 border-b border-border-subtle last:border-0 last:mb-0 last:pb-0">
      <p className="font-medium text-text-primary">{account.email}</p>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row label="Backfill status">{backfill_status}</Row>
        {backfill_status === "error" && (
          <>
            {syncState.backfill.error && (
              <Row label="Last error">{syncState.backfill.error}</Row>
            )}
            <button
              onClick={() => rpc.request(messages.sync_past, { account_id: account.id }).catch(() => {})}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors cursor-pointer">
              <RefreshCw size={12} />
              Resume backfill
            </button>
          </>
        )}
        {backfill_done && totalMessages !== null && (
          <Row label="Emails backfilled">{totalMessages.toLocaleString()}</Row>
        )}
        {isLiveSyncing && totalMessages !== null && (
          <Row label="Progress">
            {syncState.backfill.total.toLocaleString()} / {totalMessages.toLocaleString()} ({percent_progress(syncState.backfill.total, totalMessages)}%)
          </Row>
        )}
        <Row label="New-fill status">{newfill_status}</Row>
        <Row label="History ID">{nf?.newfill_current_history_id ?? "\u2014"}</Row>
        <Row label="Last synced">
          {format_date_full(nf?.newfill_last_synced_at ?? null) || "Never"}
        </Row>
      </div>
    </div>
  );
}

function SyncSection({ accounts, syncState }: { accounts: AccountDiag[]; syncState: SyncEngineState }) {
  return (
    <div>
      {accounts.length === 0 && <p className="text-text-secondary italic text-sm">No accounts</p>}
      {accounts.map((acc) => <SyncCard key={acc.id} account={acc} syncState={syncState} />)}
    </div>
  );
}

const commandLabels: Record<string, string> = {
  draft_send: "Send Draft",
  draft_save: "Save Draft",
  draft_delete: "Delete Draft",
  send_email: "Send Email",
  delete_email: "Delete Email",
  label_update: "Update Labels",
  mark_as_read: "Mark Read",
  mark_as_unread: "Mark Unread",
  mark_as_spam: "Mark Spam",
  mark_as_phishing: "Mark Phishing",
  move_to_archive: "Archive",
  move_to_inbox: "Move to Inbox",
  untrash: "Untrash",
  block_sender: "Block Sender",
  toggle_important: "Toggle Important",
  toggle_starred: "Toggle Starred",
};

function OutboxSection({ outboxItems, onDelete }: {
  outboxItems: OutboxItemWire[];
  onDelete: (id: string) => void;
}) {
  if (outboxItems.length === 0) {
    return <p className="text-sm text-text-secondary">No outbox items.</p>;
  }
  const sorted = [...outboxItems].sort((a, b) => b.created_at - a.created_at);

  return (
    <div>
      <p className="text-xs text-text-secondary mb-3">
        Outbox items are queued sends and background actions waiting to be processed. Delete an item to remove it before it runs.
      </p>
      <div className="border border-border-subtle rounded divide-y divide-border-subtle">
        {sorted.map((item) => {
          const time = item.scheduled_at
            ? `Sends ${format_date(new Date(item.scheduled_at).toISOString())}`
            : item.sent_at
            ? `Sent ${format_date(new Date(item.sent_at).toISOString())}`
            : `Created ${format_date(new Date(item.created_at).toISOString())}`;
          return (
            <div key={item.id} className="py-1.5 px-3 group">
              <div className="flex items-center justify-between gap-2 min-h-[28px]">
                <p className="text-sm truncate min-w-0">
                  <span className="text-text-secondary mr-1.5">○</span>
                  Job: {commandLabels[item.command] ?? item.command}
                  <span className="text-text-secondary mx-1.5">|</span>
                  Status: {item.status}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-text-secondary whitespace-nowrap">{time}</span>
                  {item.status !== "sending" && (
                    <button
                      onClick={async () => {
                        try {
                          await rpc.request(messages.outbox_delete, { id: item.id });
                          onDelete(item.id);
                        } catch (e) {
                          console.error("outbox:delete failed", e);
                        }
                      }}
                      className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {item.subject && (
                <p className="text-sm text-text-primary truncate ml-5" title={item.subject}>
                  Subject: {item.subject}
                </p>
              )}
              {item.to_addr && (
                <p className="text-xs text-text-tertiary ml-5">To: {item.to_addr}</p>
              )}
              {item.error && (
                <p className="text-xs text-text-tertiary ml-5 truncate" title={item.error}>{item.error}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnvironmentSection({ environment }: { environment: DiagData["environment"] }) {
  return (
    <div className="space-y-1">
      <Row label="Platform">{environment.platform}</Row>
      <Row label="Arch">{environment.arch}</Row>
      <Row label="Bun">{environment.bun}</Row>
    </div>
  );
}

function UpdatesSection() {
  const [local, setLocal] = useState<UpdateLocalInfoWire | null>(null);
  const [status_entry, set_status_entry] = useState<UpdateStatusEntryWire | null>(null);
  const [check_result, set_check_result] = useState<UpdateCheckResultWire | null>(null);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState("");

  useEffect(() => {
    const handler = (entry: UpdateStatusEntryWire) => set_status_entry(entry);
    rpc.addMessageListener(messages.updates_status, handler);
    rpc
      .request(messages.updates_get_status)
      .then((res) => {
        setLocal(res.local);
        set_status_entry(res.status);
        if (res.updateReady) {
          set_check_result({
            version: res.latestVersion,
            hash: res.latestHash,
            updateAvailable: true,
            updateReady: true,
            error: "",
          });
        }
      })
      .catch((e) => set_error(String(e)));
    return () => rpc.removeMessageListener(messages.updates_status, handler);
  }, []);

  const handle_check = useCallback(async () => {
    set_busy(true);
    set_error("");
    try {
      const res = await rpc.request(messages.updates_check);
      set_check_result(res);
    } catch (e) {
      set_error(String(e));
    }
    set_busy(false);
  }, []);

  const handle_download = useCallback(async () => {
    set_busy(true);
    set_error("");
    try {
      await rpc.request(messages.updates_download);
    } catch (e) {
      set_error(String(e));
    }
    set_busy(false);
  }, []);

  const handle_install = useCallback(async () => {
    set_busy(true);
    set_error("");
    try {
      await rpc.request(messages.updates_install);
    } catch (e) {
      set_error(String(e));
      set_busy(false);
    }
  }, []);

  const status = status_entry?.status ?? "";
  const ready_to_install = check_result?.updateReady || status === "download-complete" || status === "complete";
  const update_available = check_result?.updateAvailable || status === "update-available";
  const in_progress = [
    "checking",
    "downloading",
    "download-starting",
    "checking-local-tar",
    "local-tar-found",
    "fetching-patch",
    "patch-found",
    "downloading-patch",
    "applying-patch",
    "patch-applied",
    "extracting-version",
    "downloading-full-bundle",
    "download-progress",
    "decompressing",
    "applying",
    "extracting",
    "replacing-app",
  ].includes(status);

  return (
    <div className="space-y-3">
      <div className="border border-border-subtle rounded divide-y divide-border-subtle text-sm">
        <p className="px-2 py-2 flex gap-2">
          <span className="shrink-0 text-text-secondary w-28">Channel</span>
          <span className="text-text-primary">{local?.channel ?? "\u2014"}</span>
        </p>
        <p className="px-2 py-2 flex gap-2">
          <span className="shrink-0 text-text-secondary w-28">Version</span>
          <span className="text-text-primary">{local?.version ?? "\u2014"}</span>
        </p>
        <p className="px-2 py-2 flex gap-2">
          <span className="shrink-0 text-text-secondary w-28">Build hash</span>
          <span className="text-text-primary">{local ? local.hash.slice(0, 8) : "\u2014"}</span>
        </p>
        {local?.baseUrl && (
          <p className="px-2 py-2 flex gap-2">
            <span className="shrink-0 text-text-secondary w-28">Release host</span>
            <span className="text-text-primary font-mono text-xs break-all leading-relaxed pt-0.5">
              {local.baseUrl}
            </span>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 px-0.5">{error}</p>}
      {status_entry && (
        <p className="text-xs text-text-secondary px-0.5">{status_entry.message}</p>
      )}

      <div className="flex items-center gap-2">
        {ready_to_install ? (
          <button
            onClick={handle_install}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Restart to update
          </button>
        ) : in_progress ? (
          <span className="text-sm text-text-secondary">In progress…</span>
        ) : (
          <>
            <button
              onClick={handle_check}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {busy ? "Working..." : "Check for updates"}
            </button>
            {update_available && (
              <button
                onClick={handle_download}
                disabled={busy}
                className="text-sm px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Download & Install
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedbackSection({ account_id }: { account_id?: string }) {
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handle_send = useCallback(async () => {
    if (!feedback.trim() || !account_id) return;
    setSending(true);
    try {
      await rpc.request(messages.outbox_enqueue, {
        account_id,
        command: outbox_commands.send_email,
        to: SUPPORT_PERSON_EMAIL,
        subject: "WorkBound Feedback",
        body_html: feedback.trim(),
      });
      setSent(true);
      setFeedback("");
    } catch (e) {
      console.error("Failed to send feedback", e);
    }
    setSending(false);
  }, [feedback, account_id]);

  return (
    <div className="space-y-2">
      {sent ? (
        <p className="text-sm text-green-600">Thank you! Your feedback has been sent.</p>
      ) : (
        <>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe your feedback or issue..."
            rows={3}
            className="w-full text-sm border border-border-subtle rounded-md p-2 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handle_send}
            disabled={sending || !feedback.trim() || !account_id}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send"}
          </button>
        </>
      )}
      {sent && (
        <button
          onClick={() => setSent(false)}
          className="text-xs text-blue-500 hover:underline cursor-pointer"
        >
          Send another
        </button>
      )}
    </div>
  );
}

type Props = {
  diag: DiagData | null;
  loading: boolean;
  onRefresh: () => void;
  syncState: SyncEngineState;
  account_id?: string;
};

export function DeveloperPanel({ diag, loading, onRefresh, syncState, account_id }: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    diagnostics: true,
    outbox: false,
    configurations: false,
    updates: false,
    feedback: false,
    workbounded: false,
  });

  const toggle = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const { items: outboxItems, removeItem: removeOutboxItem } = useOutboxItems();

  useEffect(() => {
    if (!openSections.diagnostics) return;
    onRefresh();
    if (syncState.backfill.status !== "syncing") return;
    const id = setInterval(onRefresh, 5000);
    return () => clearInterval(id);
  }, [openSections.diagnostics, syncState.backfill.status, onRefresh]);

  const Collapsible = ({ sectionKey, title, children }: { sectionKey: string; title: string; children: React.ReactNode }) => {
    const isOpen = openSections[sectionKey];
    return (
      <div>
        <button onClick={() => toggle(sectionKey)} className="flex items-center justify-between w-full text-left cursor-pointer py-3">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <ChevronRight size={16} className={`text-text-secondary transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} />
        </button>
        {isOpen && <div className="space-y-3 pb-3">{children}</div>}
      </div>
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-text-primary mb-4">Developer</h2>

      <Collapsible sectionKey="diagnostics" title="Diagnostics">
        {!diag && !loading && (
          <p className="text-sm text-text-secondary">Failed to load diagnostics.</p>
        )}
        {loading && !diag && (
          <p className="text-sm text-text-secondary">Loading...</p>
        )}
        {diag && (
          <div className="space-y-4 text-sm">
            <DatabaseSection database={diag.database} />
            <hr className="border-border-subtle" />
            <AccountsSection accounts={diag.accounts} />
            <hr className="border-border-subtle" />
            <SyncSection accounts={diag.accounts} syncState={syncState} />
            <hr className="border-border-subtle" />
            <EnvironmentSection environment={diag.environment} />
          </div>
        )}
      </Collapsible>

      <Collapsible sectionKey="outbox" title="Outbox">
        <OutboxSection outboxItems={outboxItems} onDelete={removeOutboxItem} />
      </Collapsible>

      <Collapsible sectionKey="configurations" title="Configurations">
        <p className="text-xs text-text-secondary mb-3">Override environment variables at runtime. Values are persisted across restarts and take precedence over .env file values.</p>
        <ConfigurationsSection />
      </Collapsible>

      <Collapsible sectionKey="updates" title="Updates">
        <p className="text-sm text-text-secondary">Check for and install app updates.</p>
        <UpdatesSection />
      </Collapsible>

      <Collapsible sectionKey="feedback" title="Report Feedback or Issues">
        <FeedbackSection account_id={account_id} />
      </Collapsible>

      <Collapsible sectionKey="workbounded" title="Get Workbounded">
        <WorkboundedSection />
      </Collapsible>
    </div>
  );
}
