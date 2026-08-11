import { useEffect, useState } from "react";
import { Brain, Check, X, Loader2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSetAtom } from "jotai";
import { alertToastAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { error_message } from "@/shared/errors";
import { PromptEntryForm, type LabelTagValue } from "./intelligence_prompt_form";
import { job_key } from "../../utils/intelligence";
import { Tip } from "../ui/tip";
import { Select } from "../ui/select";

const STATUS_DISMISS_MS = 6000;
const TERMINAL_STATUSES = new Set<AutoLabelJobStatusWire>(["done", "failed", "cancelled"]);

const show_job_status = (job: AutoLabelJobWire | undefined): boolean => {
  if (!job) return false;
  if (!TERMINAL_STATUSES.has(job.status)) return true;
  return job.finished_at === null || Date.now() - job.finished_at <= STATUS_DISMISS_MS;
};

const PATHS: { id: IntelligenceConnectionPathWire; label: string; description: string }[] = [
  { id: "direct", label: "Direct Provider", description: "Connect straight to a provider such as OpenAI, Anthropic or Google." },
  { id: "gateway", label: "Gateway", description: "Route through an API gateway like OpenRouter." },
  { id: "custom", label: "Custom Endpoint", description: "Use a self-hosted or custom OpenAI-compatible endpoint." },
];

const EMPTY_CONNECTION: IntelligenceConnectionWire = {
  path: "direct",
  provider: "",
  model: "",
  endpoint: "",
  apiKey: undefined,
  capabilities: { imageInput: false, objectGeneration: true, toolUsage: true, toolStreaming: true },
  lastTestedAt: null,
  lastError: null,
};

const EMPTY_DRAFT: AutoLabelPromptDraftWire = { name: "", prompt: "" };

function make_entry_key(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function empty_template_entry(): AutoLabelTemplateEntryDraftWire {
  return { key: make_entry_key(), name: "", prompt: "", labels: [] };
}

const EMPTY_TEMPLATE_DRAFT: AutoLabelTemplateDraftWire = { name: "", entries: [] };

function parse_template_text(text: string): { name: string; entries: { name: string; labels: string[]; prompt: string }[] } {
  const lines = text.split(/\r?\n/);
  let name = "Imported template";
  const body: string[] = [];
  for (const line of lines) {
    const m = /^Template:\s*(.+)$/i.exec(line.trim());
    if (m) {
      name = m[1].trim() || name;
      continue;
    }
    body.push(line);
  }
  const entries: { name: string; labels: string[]; prompt: string }[] = [];
  for (const block of body.join("\n").split(/\n\s*\n/)) {
    let entry_name = "";
    let labels: string[] = [];
    let prompt = "";
    let prompt_started = false;
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const label_match = /^Label:\s*(.+)$/i.exec(t);
      const prompt_match = /^Prompt:\s*(.+)$/i.exec(t);
      if (label_match) {
        labels = label_match[1].split(",").map((s) => s.trim()).filter(Boolean);
        continue;
      }
      if (prompt_match) {
        prompt = (prompt ? prompt + "\n" : "") + prompt_match[1].trim();
        prompt_started = true;
        continue;
      }
      if (prompt_started) {
        prompt = prompt + "\n" + t;
        continue;
      }
      if (!entry_name) entry_name = t;
    }
    if (entry_name && labels.length > 0 && prompt.trim()) {
      entries.push({ name: entry_name, labels, prompt: prompt.trim() });
    }
  }
  return { name, entries };
}

export function IntelligencePanel({ account_id }: { account_id: string }) {
  const setAlert = useSetAtom(alertToastAtom);

  const [providers, setProviders] = useState<IntelligenceProviderWire[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState<IntelligenceConnectionWire>(EMPTY_CONNECTION);
  const [mode, setMode] = useState<AutoLabelModeWire>("setup");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [autoLabelingOpen, setAutoLabelingOpen] = useState(true);
  const [testResult, setTestResult] = useState<IntelligenceTestResultWire | null>(null);
  const [testError, setTestError] = useState("");

  const [prompts, setPrompts] = useState<AutoLabelPromptWire[]>([]);
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [userLabels, setUserLabels] = useState<{ id: string; name: string }[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutoLabelPromptDraftWire>(EMPTY_DRAFT);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [label_query, setLabelQuery] = useState("");
  const [selected_labels, setSelectedLabels] = useState<LabelTagValue[]>([]);

  const [templates, setTemplates] = useState<AutoLabelTemplateWire[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<AutoLabelTemplateDraftWire>(EMPTY_TEMPLATE_DRAFT);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [new_menu_open, setNewMenuOpen] = useState(false);

  const [apply_target, setApplyTarget] = useState<AutoLabelApplyTargetWire | null>(null);
  const [apply_scope, setApplyScope] = useState<"recent" | "all" | null>(null);
  const [apply_recent_count, setApplyRecentCount] = useState(1000);
  const [enqueuing, setEnqueuing] = useState(false);
  const [job_states, setJobStates] = useState<Record<string, AutoLabelJobWire>>({});

  const provider = providers.find((p) => p.id === conn.provider);
  const isDirect = conn.path === "direct";
  const isGateway = conn.path === "gateway";
  const isCustom = conn.path === "custom";
  const models = isDirect ? (provider?.models ?? []) : [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, saved] = await Promise.all([
          rpc.request(messages.intelligence_get_providers),
          rpc.request(messages.intelligence_get_connection),
        ]);
        if (cancelled) return;
        setProviders(list);
        if (saved) {
          setConn(saved);
          setMode("features");
        } else {
          setConn((prev) => ({ ...prev, provider: list[0]?.id ?? "" }));
        }
      } catch (e) {
        setAlert({ message: `Failed to load AI configuration: ${error_message(e)}`, type: "error" });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setAlert]);

  const load_auto_label_data = async () => {
    if (!account_id) return;
    try {
      const [promptList, labelRes, templateList, jobs] = await Promise.all([
        rpc.request(messages.intelligence_auto_label_prompts_list, { account_id }),
        rpc.request(messages.labels_list, { account_id }),
        rpc.request(messages.intelligence_label_templates_list, { account_id }),
        rpc.request(messages.intelligence_auto_label_jobs_list, { account_id }),
      ]);
      setPrompts(promptList ?? []);
      setUserLabels(labelRes?.userLabels ?? []);
      setTemplates(templateList ?? []);
      const states: Record<string, AutoLabelJobWire> = {};
      for (const j of jobs ?? []) {
        const key = job_key(j.kind, j.rule_id);
        if (!states[key]) states[key] = j;
      }
      setJobStates(states);
    } catch (e) {
      setAlert({ message: `Failed to load auto labeling data: ${error_message(e)}`, type: "error" });
    } finally {
      setPromptsLoaded(true);
    }
  };

  useEffect(() => {
    void load_auto_label_data();
  }, [account_id]);

  useEffect(() => {
    const on_job = (j: AutoLabelJobWire) => {
      const key = job_key(j.kind, j.rule_id);
      setJobStates((prev) => ({ ...prev, [key]: j }));
    };
    rpc.addMessageListener(messages.intelligence_auto_label_job_progress, on_job);
    rpc.addMessageListener(messages.intelligence_auto_label_job_done, on_job);
    rpc.addMessageListener(messages.intelligence_auto_label_job_error, on_job);
    return () => {
      rpc.removeMessageListener(messages.intelligence_auto_label_job_progress, on_job);
      rpc.removeMessageListener(messages.intelligence_auto_label_job_done, on_job);
      rpc.removeMessageListener(messages.intelligence_auto_label_job_error, on_job);
    };
  }, []);

  const ensure_label = async (name: string): Promise<{ id: string; name: string } | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = userLabels.find((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    try {
      const created = await rpc.request(messages.labels_create, { account_id, name: trimmed });
      const created_label = created as { id: string; name: string };
      setUserLabels((prev) => [...prev, created_label]);
      return created_label;
    } catch (e) {
      setAlert({ message: `Failed to create label: ${error_message(e)}`, type: "error" });
      return null;
    }
  };

  const openNewPrompt = () => {
    setDraft(EMPTY_DRAFT);
    setSelectedLabels([]);
    setLabelQuery("");
    setEditingPromptId("new");
    setNewMenuOpen(false);
  };

  const openEditPrompt = (p: AutoLabelPromptWire) => {
    setDraft({ name: p.name, prompt: p.prompt });
    setSelectedLabels(p.label_ids.map((id) => userLabels.find((l) => l.id === id)).filter((l): l is LabelTagValue => Boolean(l)));
    setLabelQuery("");
    setEditingPromptId(p.id);
    setNewMenuOpen(false);
  };

  const closePromptEditor = () => {
    setEditingPromptId(null);
    setDraft(EMPTY_DRAFT);
    setSelectedLabels([]);
    setLabelQuery("");
  };

  const handle_prompt_save = async () => {
    if (!draft.name.trim() || !draft.prompt.trim()) {
      setAlert({ message: "Fill in name and prompt.", type: "warning" });
      return;
    }
    let label_ids = selected_labels.map((l) => l.id);
    if (label_ids.length === 0) {
      if (!label_query.trim()) {
        setAlert({ message: "Choose at least one label or type a new one.", type: "warning" });
        return;
      }
      const created = await ensure_label(label_query);
      if (!created) return;
      label_ids = [created.id];
    }
    setSavingPrompt(true);
    try {
      const input = { name: draft.name.trim(), prompt: draft.prompt.trim(), label_ids, enabled: true };
      if (editingPromptId && editingPromptId !== "new") {
        const current = prompts.find((p) => p.id === editingPromptId);
        const updated = await rpc.request(messages.intelligence_auto_label_prompts_update, { account_id, id: editingPromptId, ...input, enabled: current?.enabled ?? true });
        if (updated && current && updated.content_hash !== current.content_hash) {
          setApplyTarget({ kind: "prompt", id: updated.id, name: updated.name, version: updated.version });
          setApplyScope(null);
          setApplyRecentCount(1000);
        } else {
          closePromptEditor();
        }
      } else {
        const created = await rpc.request(messages.intelligence_auto_label_prompts_create, { account_id, ...input });
        setApplyTarget({ kind: "prompt", id: created.id, name: created.name, version: created.version });
        setApplyScope(null);
        setApplyRecentCount(1000);
      }
      await load_auto_label_data();
    } catch (e) {
      setAlert({ message: `Failed to save prompt: ${error_message(e)}`, type: "error" });
    } finally {
      setSavingPrompt(false);
    }
  };

  const handle_prompt_toggle = async (p: AutoLabelPromptWire) => {
    try {
      await rpc.request(messages.intelligence_auto_label_prompts_update, {
        account_id, id: p.id, name: p.name, prompt: p.prompt, label_ids: p.label_ids, enabled: !p.enabled,
      });
      setPrompts((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: !p.enabled } : x)));
    } catch (e) {
      setAlert({ message: `Failed to update prompt: ${error_message(e)}`, type: "error" });
    }
  };

  const handle_prompt_delete = async (id: string) => {
    try {
      await rpc.request(messages.intelligence_auto_label_prompts_delete, { account_id, id });
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      if (editingPromptId === id) closePromptEditor();
    } catch (e) {
      setAlert({ message: `Failed to delete prompt: ${error_message(e)}`, type: "error" });
    }
  };

  const openNewTemplate = () => {
    setTemplateDraft({ name: "", entries: [empty_template_entry()] });
    setEditingTemplateId("new");
    setNewMenuOpen(false);
    setImportOpen(false);
    setImportText("");
  };

  const openEditTemplate = (t: AutoLabelTemplateWire) => {
    setTemplateDraft({
      name: t.name,
      entries: t.entries.map((e) => ({
        key: e.id,
        name: e.name,
        prompt: e.prompt,
        labels: e.labels.map((name) => userLabels.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? { id: "", name }),
      })),
    });
    setEditingTemplateId(t.id);
    setNewMenuOpen(false);
    setImportOpen(false);
    setImportText("");
  };

  const closeTemplateEditor = () => {
    setEditingTemplateId(null);
    setTemplateDraft(EMPTY_TEMPLATE_DRAFT);
    setImportOpen(false);
    setImportText("");
  };

  const update_template_entry = (key: string, patch: Partial<AutoLabelTemplateEntryDraftWire>) => {
    setTemplateDraft((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    }));
  };

  const handle_template_save = async () => {
    if (!templateDraft.name.trim()) {
      setAlert({ message: "Give the template a name.", type: "warning" });
      return;
    }
    if (templateDraft.entries.length === 0) {
      setAlert({ message: "Add at least one entry to the template.", type: "warning" });
      return;
    }
    const entries = [];
    for (const e of templateDraft.entries) {
      if (!e.name.trim() || !e.prompt.trim()) {
        setAlert({ message: "Each entry needs a name and prompt.", type: "warning" });
        return;
      }
      if (e.labels.length === 0) {
        setAlert({ message: "Each entry needs at least one label.", type: "warning" });
        return;
      }
      entries.push({ name: e.name.trim(), labels: e.labels.map((l) => l.name), prompt: e.prompt.trim(), enabled: true });
    }
    setSavingTemplate(true);
    try {
      if (editingTemplateId && editingTemplateId !== "new") {
        const existing = templates.find((t) => t.id === editingTemplateId);
        const updated = await rpc.request(messages.intelligence_label_templates_update, {
          account_id, id: editingTemplateId, name: templateDraft.name.trim(), entries,
          enabled: existing?.enabled ?? true,
        });
        if (updated && existing && updated.content_hash !== existing.content_hash) {
          setApplyTarget({ kind: "template", id: updated.id, name: updated.name, version: updated.version });
          setApplyScope(null);
          setApplyRecentCount(1000);
        } else {
          closeTemplateEditor();
        }
      } else {
        const created = await rpc.request(messages.intelligence_label_templates_create, {
          account_id, name: templateDraft.name.trim(), entries, enabled: true,
        });
        setApplyTarget({ kind: "template", id: created.id, name: created.name, version: created.version });
        setApplyScope(null);
        setApplyRecentCount(1000);
      }
      await load_auto_label_data();
    } catch (e) {
      setAlert({ message: `Failed to save template: ${error_message(e)}`, type: "error" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handle_template_delete = async (id: string) => {
    try {
      await rpc.request(messages.intelligence_label_templates_delete, { account_id, id });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingTemplateId === id) closeTemplateEditor();
    } catch (e) {
      setAlert({ message: `Failed to delete template: ${error_message(e)}`, type: "error" });
    }
  };

  const handle_template_toggle = async (t: AutoLabelTemplateWire) => {
    try {
      await rpc.request(messages.intelligence_label_templates_update, {
        account_id,
        id: t.id,
        name: t.name,
        entries: t.entries.map((e) => ({ name: e.name, labels: e.labels, prompt: e.prompt, enabled: e.enabled })),
        enabled: !t.enabled,
      });
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, enabled: !t.enabled } : x)));
    } catch (e) {
      setAlert({ message: `Failed to update template: ${error_message(e)}`, type: "error" });
    }
  };

  const close_apply_and_editor = () => {
    setApplyTarget(null);
    closePromptEditor();
    closeTemplateEditor();
  };

  const handle_apply_submit = async () => {
    if (!apply_target) return;
    if (apply_scope === null) {
      close_apply_and_editor();
      return;
    }
    setEnqueuing(true);
    try {
      const job = await rpc.request(messages.intelligence_auto_label_jobs_enqueue, {
        account_id,
        kind: apply_target.kind,
        rule_id: apply_target.id,
        rule_name: apply_target.name,
        rule_version: apply_target.version,
        scope: apply_scope,
        scope_limit: apply_scope === "recent" ? Math.max(1, Math.floor(apply_recent_count) || 1000) : undefined,
      });
      setJobStates((prev) => ({ ...prev, [job_key(job.kind, job.rule_id)]: job }));
      close_apply_and_editor();
      setAlert({ message: `Applying "${apply_target.name}" to existing emails.`, type: "success" });
    } catch (e) {
      setAlert({ message: `Failed to start applying: ${error_message(e)}`, type: "error" });
    } finally {
      setEnqueuing(false);
    }
  };

  const handle_apply_later = () => {
    close_apply_and_editor();
  };

  const handle_job_cancel = async (job: AutoLabelJobWire) => {
    try {
      await rpc.request(messages.intelligence_auto_label_jobs_cancel, { account_id, id: job.id });
      setJobStates((prev) => ({
        ...prev,
        [job_key(job.kind, job.rule_id)]: { ...prev[job_key(job.kind, job.rule_id)], status: "cancelled" },
      }));
    } catch (e) {
      setAlert({ message: `Failed to cancel apply: ${error_message(e)}`, type: "error" });
    }
  };

  const handle_import_template = () => {
    if (!importText.trim()) {
      setAlert({ message: "Paste a template to import.", type: "warning" });
      return;
    }
    const parsed = parse_template_text(importText);
    if (parsed.entries.length === 0) {
      setAlert({ message: "No valid entries found. Check the template format.", type: "warning" });
      return;
    }
    setTemplateDraft({
      name: parsed.name,
      entries: parsed.entries.map((e) => ({ key: make_entry_key(), name: e.name, prompt: e.prompt, labels: e.labels.map((name) => ({ id: "", name })) })),
    });
    setImportOpen(false);
    setImportText("");
    setAlert({ message: `Filled in ${parsed.entries.length} entries. Review and save.`, type: "success" });
  };

  const handle_export_template = async () => {
    if (!templateDraft.name.trim()) {
      setAlert({ message: "Give the template a name before exporting.", type: "warning" });
      return;
    }
    const text = [
      `Template: ${templateDraft.name.trim()}`,
      ...templateDraft.entries.filter((e) => e.name.trim()).map((e) => [
        "",
        e.name.trim(),
        `Label: ${e.labels.map((l) => l.name).join(", ")}`,
        `Prompt: ${e.prompt.trim()}`,
      ].join("\n")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setAlert({ message: "Template copied to clipboard.", type: "success" });
    } catch (err) {
      setAlert({ message: `Failed to copy template: ${error_message(err)}`, type: "error" });
    }
  };

  const handle_provider_change = (provider_id: string) => {
    const p = providers.find((x) => x.id === provider_id);
    setConn((prev) => ({
      ...prev,
      provider: provider_id,
      endpoint: p?.defaultEndpoint ?? prev.endpoint,
      model: isDirect ? (p?.models[0]?.id ?? "") : prev.model,
    }));
  };

  const handle_path_change = (path: IntelligenceConnectionPathWire) => {
    setConn((prev) => {
      if (path === "custom") {
        return { ...prev, path, provider: "openai-compatible", endpoint: prev.endpoint || "https://" };
      }
      if (path === "direct") {
        const current = providers.find((x) => x.id === prev.provider);
        const p = current ?? providers[0];
        return {
          ...prev,
          path,
          provider: p?.id ?? "",
          endpoint: p?.defaultEndpoint ?? prev.endpoint,
          model: p?.models[0]?.id ?? prev.model,
        };
      }
      const p = providers.find((x) => x.id === prev.provider);
      return { ...prev, path, endpoint: p?.defaultEndpoint ?? prev.endpoint };
    });
  };

  const run_test = async () => {
    setTesting(true);
    setTestError("");
    setTestResult(null);
    try {
      const result = await rpc.request(messages.intelligence_test_connection, {
        path: conn.path,
        provider: conn.provider,
        model: conn.model,
        endpoint: conn.endpoint,
        apiKey: conn.apiKey,
      });
      setTestResult(result);
      const pass = result.auth.ok && result.model.ok && result.structuredOutput.ok;
      setAlert({
        message: pass ? "Connection test passed." : "Connection test reported issues.",
        type: pass ? "success" : "warning",
      });
    } catch (e) {
      setTestError(error_message(e));
      setAlert({ message: `Connection test failed: ${error_message(e)}`, type: "error" });
    } finally {
      setTesting(false);
    }
  };

  const handle_save = async () => {
    if (!conn.provider) {
      setAlert({ message: "Choose a provider first.", type: "warning" });
      return;
    }
    if (!conn.model.trim()) {
      setAlert({ message: "Enter a model.", type: "warning" });
      return;
    }
    setSaving(true);
    setTestError("");
    setTestResult(null);
    try {
      const res = await rpc.request(messages.intelligence_save_connection, {
        path: conn.path,
        provider: conn.provider,
        model: conn.model,
        endpoint: conn.endpoint,
        apiKey: conn.apiKey,
      });
      setConn(res.connection);
      setTestResult(res.test);
      const pass = res.test.auth.ok && res.test.model.ok && res.test.structuredOutput.ok;
      setMode("features");
      setAlert({
        message: pass
          ? "AI connection saved and verified."
          : "AI connection saved, but the connection test reported issues.",
        type: pass ? "success" : "warning",
      });
    } catch (e) {
      setTestError(error_message(e));
      setAlert({ message: `Failed to save AI connection: ${error_message(e)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handle_remove = async () => {
    setRemoving(true);
    try {
      await rpc.request(messages.intelligence_delete_connection);
      setConn((prev) => ({ ...EMPTY_CONNECTION, provider: providers[0]?.id ?? prev.provider }));
      setTestResult(null);
      setTestError("");
      setMode("setup");
      setAlert({ message: "AI connection removed.", type: "success" });
    } catch (e) {
      setAlert({ message: `Failed to remove AI connection: ${error_message(e)}`, type: "error" });
    } finally {
      setRemoving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-medium text-text-primary">Intelligence</h2>
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (mode === "features") {
    const summaryLine = isCustom
      ? `Custom endpoint · ${conn.model}`
      : `${provider?.name ?? conn.provider} · ${conn.model}`;
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-text-primary" />
          <h2 className="text-lg font-medium text-text-primary">Intelligence</h2>
        </div>

        <div>
          <button onClick={() => setFeaturesOpen((v) => !v)} className="flex items-center justify-between w-full text-left cursor-pointer py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-primary">Connection</h3>
            </div>
            <ChevronRight size={16} className={`text-text-secondary transition-transform shrink-0 ${featuresOpen ? "rotate-90" : ""}`} />
          </button>
          {featuresOpen && (
            <div className="space-y-3 pb-3">
              <p className="text-sm text-text-primary">{summaryLine}</p>
              <div className="flex items-center gap-4 text-sm">
                <button onClick={() => setMode("setup")} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                  Reconfigure
                </button>
                <button onClick={handle_remove} disabled={removing} className="text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors cursor-pointer">
                  {removing ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <button onClick={() => setAutoLabelingOpen((v) => !v)} className="flex items-center justify-between w-full text-left cursor-pointer py-3">
            <h3 className="text-sm font-medium text-text-primary">Auto Labeling</h3>
            <ChevronRight size={16} className={`text-text-secondary transition-transform shrink-0 ${autoLabelingOpen ? "rotate-90" : ""}`} />
          </button>
          {autoLabelingOpen && (
            <div className="space-y-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-text-secondary">Describe what to label in plain language. When a matching email arrives, the label is applied automatically.</p>
                {!editingPromptId && !editingTemplateId && (
                  <div className="flex items-center gap-1 shrink-0">
                    {new_menu_open && (
                      <>
                        <button onClick={openNewPrompt} className="px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
                          Prompt
                        </button>
                        <button onClick={openNewTemplate} className="px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
                          Template
                        </button>
                      </>
                    )}
                    <button onClick={() => setNewMenuOpen((v) => !v)} className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
                      {new_menu_open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                      New
                    </button>
                  </div>
                )}
              </div>

              {apply_target && (
                <div className="border border-border-subtle rounded p-3 space-y-3">
                  <p className="text-sm text-text-primary">"{apply_target.name}" saved. Apply it to existing emails?</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="apply-scope" checked={apply_scope === null} onChange={() => setApplyScope(null)} className="accent-blue-500 cursor-pointer" />
                      Not now - only new mail will be labeled
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="apply-scope" checked={apply_scope === "recent"} onChange={() => setApplyScope("recent")} className="accent-blue-500 cursor-pointer" />
                      Recent emails - most recent
                      <input
                        type="number"
                        min={1}
                        value={apply_recent_count}
                        onChange={(e) => setApplyRecentCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                        disabled={apply_scope !== "recent"}
                        className="w-20 px-2 py-0.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                      />
                      emails
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input type="radio" name="apply-scope" checked={apply_scope === "all"} onChange={() => setApplyScope("all")} className="accent-blue-500 cursor-pointer" />
                      All existing emails
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handle_apply_submit} disabled={enqueuing} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">
                      {enqueuing ? "Applying..." : "Apply"}
                    </button>
                    <button onClick={handle_apply_later} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Not now</button>
                  </div>
                </div>
              )}

              {editingPromptId && !apply_target ? (
                <div className="space-y-2">
                  <PromptEntryForm
                    name={draft.name}
                    prompt={draft.prompt}
                    labels={selected_labels}
                    allLabels={userLabels}
                    onNameChange={(v) => setDraft((p) => ({ ...p, name: v }))}
                    onPromptChange={(v) => setDraft((p) => ({ ...p, prompt: v }))}
                    onLabelsChange={setSelectedLabels}
                    onCreateLabel={ensure_label}
                    onQueryChange={setLabelQuery}
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={handle_prompt_save} disabled={savingPrompt} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">{savingPrompt ? "Saving..." : "Save"}</button>
                    <button onClick={closePromptEditor} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
                  </div>
                  <Tip>
                    <p>
                      Use the format: <span className="text-text-primary">description → qualifiers → disqualifiers</span>.
                    </p>
                  </Tip>
                </div>
              ) : editingTemplateId && !apply_target ? (
                <div className="space-y-3">
                  <input
                    value={templateDraft.name}
                    onChange={(e) => setTemplateDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Template name"
                    className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <div className="space-y-2">
                    {templateDraft.entries.map((e, idx) => (
                      <div key={e.key} className="py-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Entry {idx + 1}</p>
                          <button
                            onClick={() => setTemplateDraft((prev) => ({ ...prev, entries: prev.entries.filter((x) => x.key !== e.key) }))}
                            className="text-text-secondary hover:text-text-primary cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <PromptEntryForm
                          name={e.name}
                          prompt={e.prompt}
                          labels={e.labels}
                          allLabels={userLabels}
                          onNameChange={(v) => update_template_entry(e.key, { name: v })}
                          onPromptChange={(v) => update_template_entry(e.key, { prompt: v })}
                          onLabelsChange={(v) => update_template_entry(e.key, { labels: v })}
                          onCreateLabel={ensure_label}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setTemplateDraft((prev) => ({ ...prev, entries: [...prev.entries, empty_template_entry()] }))}
                    className="flex items-center gap-1 px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">
                    <Plus size={14} />
                    Add entry
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={handle_template_save} disabled={savingTemplate} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40">{savingTemplate ? "Saving..." : "Save Template"}</button>
                    <button onClick={closeTemplateEditor} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
                    <div className="flex-1" />
                    <button onClick={() => setImportOpen((v) => !v)} className="px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">Import</button>
                    <button onClick={handle_export_template} className="px-3 py-1 text-xs border border-dashed border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer text-text-secondary">Export</button>
                  </div>

                  <Tip>
                    <div className="space-y-2">
                      <p>Template format (blank lines separate entries):</p>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-text-secondary">
{`Template: Client Workflow

Client inquiry
Label: Client
Prompt: Emails from potential clients asking about services
Extract the company and desired service.

Newsletter
Label: Newsletter
Prompt: Filter for newsletter subscribers and promotions`}
                      </pre>
                    </div>
                  </Tip>

                  {importOpen && (
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary">Paste a template to fill in this composer.</p>
                      <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        rows={6}
                        placeholder={"Template: Client Workflow\n\nClient inquiry\nLabel: Client\nPrompt: Emails from potential clients asking about services"}
                        className="w-full px-3 py-1.5 text-sm font-mono border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={handle_import_template} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Import</button>
                        <button onClick={() => { setImportOpen(false); setImportText(""); }} className="px-4 py-1 text-sm border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : promptsLoaded && !apply_target && prompts.length === 0 && templates.length === 0 ? (
                <p className="text-sm text-text-secondary">No auto labeling rules yet. Create a prompt or a template.</p>
              ) : !apply_target ? (
                <div className="space-y-3">
                  <div className="border border-border-subtle rounded divide-y divide-border-subtle">
                    {[
                      ...prompts.map((p) => ({ kind: "prompt" as const, id: p.id, name: p.name, enabled: p.enabled, created_at: p.created_at, data: p })),
                      ...templates.map((t) => ({ kind: "template" as const, id: t.id, name: t.name, enabled: t.enabled, created_at: t.created_at, data: t })),
                    ]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((item) => {
                        const job = job_states[job_key(item.kind, item.id)];
                        const show_job = show_job_status(job);
                        const busy = job?.status === "queued" || job?.status === "running";
                        return (
                        <div key={item.id} className="py-2 px-3 group">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.enabled}
                                  disabled={busy}
                                  onChange={() => (item.kind === "prompt" ? handle_prompt_toggle(item.data) : handle_template_toggle(item.data))}
                                  className="cursor-pointer disabled:cursor-not-allowed"
                                />
                                <p className="text-sm text-text-primary truncate">{item.name}</p>
                                <span className="text-[10px] px-1.5 py-0.5 bg-black/[0.06] rounded uppercase tracking-wide text-text-secondary shrink-0">{item.kind}</span>
                                <span className="text-[10px] uppercase tracking-wide text-text-secondary shrink-0">{item.enabled ? "On" : "Off"}</span>
                                {item.kind === "template" && (
                                  <span className="text-[10px] uppercase tracking-wide text-text-secondary shrink-0">{item.data.entries.length} {item.data.entries.length === 1 ? "entry" : "entries"}</span>
                                )}
                              </div>
                              {item.kind === "prompt" ? (
                                <>
                                  <p className="text-xs text-text-secondary break-words line-clamp-2">{item.data.prompt}</p>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {item.data.label_ids.length === 0 ? (
                                      <span className="text-xs text-text-secondary">No label</span>
                                    ) : (
                                      item.data.label_ids.map((id) => {
                                        const name = userLabels.find((l) => l.id === id)?.name ?? "(deleted label)";
                                        return (
                                          <span key={id} className="text-[10px] px-1.5 py-0.5 bg-black/[0.06] rounded text-text-secondary">{name}</span>
                                        );
                                      })
                                    )}
                                  </div>
                                </>
                              ) : (
                                item.data.entries.map((e) => (
                                  <div key={e.id} className="space-y-0.5">
                                    <p className="text-xs text-text-secondary truncate">{e.name}</p>
                                    <p className="text-xs text-text-secondary break-words line-clamp-1">{e.prompt}</p>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {e.labels.map((name) => (
                                        <span key={name} className="text-[10px] px-1.5 py-0.5 bg-black/[0.06] rounded text-text-secondary shrink-0">{name}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                              <button disabled={busy} onClick={() => (item.kind === "prompt" ? openEditPrompt(item.data) : openEditTemplate(item.data))} className="px-2 py-1 text-xs border border-border-subtle rounded hover:bg-black/[0.04] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Edit</button>
                              <button disabled={busy} onClick={() => (item.kind === "prompt" ? handle_prompt_delete(item.data.id) : handle_template_delete(item.data.id))} className="px-2 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
                            </div>
                          </div>
                          {job && show_job && (
                            <div className="mt-1.5">
                              {job.status === "queued" && (
                                <p className="text-xs text-text-secondary">Queued to apply…</p>
                              )}
                              {job.status === "running" && (
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-text-secondary">
                                    Applying… {job.total > 0 ? `${job.scanned.toLocaleString()}/${job.total.toLocaleString()}` : "counting emails"}
                                    {job.matches > 0 ? ` · ${job.matches.toLocaleString()} ${job.matches === 1 ? "match" : "matches"}` : ""}
                                  </p>
                                  <button onClick={() => handle_job_cancel(job)} className="text-xs text-text-secondary hover:text-text-primary cursor-pointer shrink-0">Cancel</button>
                                </div>
                              )}
                              {job.status === "done" && (
                                <p className="text-xs text-green-700">
                                  {job.applied > 0
                                    ? `Applied "${item.name}" to ${job.applied.toLocaleString()} email${job.applied === 1 ? "" : "s"}.`
                                    : "Scan complete — no emails matched."}
                                </p>
                              )}
                              {job.status === "failed" && (
                                <p className="text-xs text-red-600">Apply failed: {job.error ?? "unknown error"}</p>
                              )}
                              {job.status === "cancelled" && (
                                <p className="text-xs text-text-secondary">Apply cancelled.</p>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Brain size={20} className="text-text-primary" />
        <h2 className="text-lg font-medium text-text-primary">Intelligence</h2>
      </div>
      <p className="text-xs text-text-secondary max-w-lg">
        Configure the AI provider that powers optional intelligence features such as auto labeling. Your connection is
        tested when saved and reused by any intelligence feature you enable.
      </p>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Connection Type</p>
          <div className="space-y-2">
            {PATHS.map((p) => (
              <label key={p.id} className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer transition-colors ${conn.path === p.id ? "border-blue-400 bg-blue-50/40" : "border-border-subtle hover:bg-black/[0.03]"}`}>
                <input
                  type="radio"
                  name="connection-path"
                  checked={conn.path === p.id}
                  onChange={() => handle_path_change(p.id)}
                  className="mt-0.5 accent-blue-500 cursor-pointer"
                />
                <span>
                  <span className="block text-sm font-medium text-text-primary">{p.label}</span>
                  <span className="block text-xs text-text-secondary mt-0.5">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {isGateway && (
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">Gateway</p>
            <p className="text-xs text-text-secondary">
              Gateway connections aren't available just yet. This is on the roadmap. Express your interest by sending me
              feedback via Settings → Developer → Report Feedback, and I'll prioritize it.
            </p>
          </div>
        )}

        {!isGateway && (
          <>
            {isCustom ? (
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Provider</p>
                <p className="text-xs text-text-secondary">
                  Custom endpoints are handled as OpenAI-compatible. Enter the full base URL your endpoint requires,
                  including any version path like /v1. Nothing is appended automatically.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Provider</p>
                <Select
                  value={conn.provider}
                  onChange={(e) => handle_provider_change(e.target.value)}
                >
                  <option value="" disabled>Select a provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {isDirect ? (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Model</p>
                <Select
                  value={conn.model}
                  onChange={(e) => setConn((prev) => ({ ...prev, model: e.target.value }))}
                >
                  <option value="" disabled>Select a model</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Model</p>
                <input
                  value={conn.model}
                  onChange={(e) => setConn((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="e.g. gpt-5, deepseek-chat, my-model"
                  className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-text-primary mb-2">Endpoint</p>
              <input
                value={conn.endpoint}
                onChange={(e) => setConn((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder={isCustom ? "https://my-host.example.com/v1" : (provider?.defaultEndpoint ?? "https://...")}
                className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-text-primary mb-2">API Key</p>
              <input
                type="password"
                value={conn.apiKey ?? ""}
                onChange={(e) => setConn((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="If required by your provider"
                className="w-full px-3 py-1.5 text-sm border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handle_save}
                disabled={saving || testing}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? "Saving..." : "Save Connection"}
              </button>
              <button
                onClick={run_test}
                disabled={testing || saving || !conn.model.trim()}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md border border-border-subtle hover:bg-black/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer text-text-secondary"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : null}
                Test Connection
              </button>
            </div>

            {conn.lastTestedAt && !testResult && !testError && (
              <p className="text-xs text-text-secondary">Last tested {new Date(conn.lastTestedAt).toLocaleString()}</p>
            )}

            {testError && (
              <div className="border border-red-200 bg-red-50 rounded-md p-3">
                <p className="text-xs text-red-600">{testError}</p>
              </div>
            )}

            {testResult && (() => {
              const pass = testResult.auth.ok && testResult.model.ok && testResult.structuredOutput.ok;
              const failedProbe = [testResult.auth, testResult.model, testResult.structuredOutput].find((p) => !p.ok);
              return (
                <p className={`flex items-center gap-1.5 text-xs ${pass ? "text-green-700" : "text-red-600"}`} title={failedProbe?.error}>
                  {pass ? <Check size={13} /> : <X size={13} />}
                  {pass ? "Authenticated and generated an object." : `Failed — ${failedProbe?.error ?? "connection test reported issues."}`}
                </p>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
