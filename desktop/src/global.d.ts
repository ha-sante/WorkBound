export {};

declare global {
  type AccountScope = {
    account_id: string;
  };

  type AccountScopedId = AccountScope & {
    id: string;
  };

  type EntityId = {
    id: string;
  };

  type ThreadId = {
    thread_id: string;
  };

  type EmailId = {
    email_id: string;
  };

  type AttachmentRef = {
    email_id: string;
    attachment_id: string;
  };

  type SuccessWire = {
    success: boolean;
  };

  type SuccessWithErrorWire = SuccessWire & {
    error?: string;
  };

  type ReminderWire = {
    id: string;
    account_id: string;
    email_id: string;
    thread_id: string | null;
    remind_at: number;
    status: "pending" | "completed" | "dismissed";
    created_at: number;
    subject?: string | null;
    from_name?: string | null;
    from_address?: string | null;
    snippet?: string | null;
  };

  type StartedWire = {
    started: boolean;
  };

  type ContactEntry = {
    id: string;
    email: string;
    name: string | null;
  };

  type DraftAttachment = {
    id: string;
    name: string;
    mime_type: string;
    data: string;
    local_path: string | null;
    size: number;
  };

  type DraftMode = "new" | "reply" | "reply_all" | "forward";

  type ComposeMeta = {
    mode: DraftMode;
    email: EmailPreviewWire | null;
    fullEmail: EmailRowWire | null;
    draft_id: string | null;
    from_address: string;
    from_name: string;
    is_domain_match: boolean;
    toContacts: ContactEntry[];
    ccContacts: ContactEntry[];
    bccContacts: ContactEntry[];
    toInput: string;
    ccInput: string;
    bccInput: string;
    showCc: boolean;
    showBcc: boolean;
    subject: string;
    attachments: DraftAttachment[];
    phase: "composing" | "sending" | "sent" | "conflicted" | "closed";
    countdown: number;
    outboxId: string | null;
  };

  type ComposeActions = {
    send: () => void;
    discard: () => void;
    attach: () => void;
    close: () => void;
    send_later: () => void;
    undo_send: () => void;
    send_at: (ts: number) => void;
  };

  type ScheduleCandidate = {
    ts: number;
    label: string;
  };

  type RecommendationRule = {
    words: string[];
    allow_number?: boolean;
    number_ok?: (n: number) => boolean;
    candidates: (now: number, n: number) => ScheduleCandidate[];
  };

  type RelativeDay = {
    word: string;
    aliases: string[];
  };

  type ParseContext = {
    s: string;
    tokens: string[];
    now: number;
  };

  type BackfillStartWire = {
    account_id: string;
    total: number;
    totalMessages: number | null;
    resume: boolean;
  };

  type BackfillProgressWire = {
    account_id: string;
    total: number;
    totalMessages: number | null;
  };

  type BackfillDoneWire = {
    account_id: string;
    total: number;
    totalMessages: number | null;
  };

  type BackfillErrorWire = {
    account_id: string;
    error?: string;
  };

  type BackfillStateWire = {
    backfill_done: number | null;
    backfill_status: string | null;
    backfill_next_page_token: string | null;
    backfill_oldest_synced_at: string | null;
    backfill_initial_total_messages: number | null;
    backfill_fetched_total: number | null;
  };

  type AttachmentsMetaBackfillDoneWire = {
    account_id: string;
  };

  type NewfillProgressWire = {
    account_id: string;
    email: string;
    state: "syncing" | "done" | "error";
    error?: string;
    hasChanges?: boolean;
    deletedIds?: string[];
  };

  type AuthLoginCompleteWire = {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    provider: string;
  };

  type OAuthPrepareWire = {
    url: string;
  };

  type InvalidGrantWire = {
    account_id: string;
    email: string;
    reason: "credentials_changed" | "unknown";
  };

  type AuthReconnectCompleteWire = {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    provider: string;
    error?: string;
  };

  type AttachmentWire = {
    id: string;
    email_id: string;
    filename: string;
    mime_type: string | null;
    size: number | null;
    local_path: string | null;
    cid: string | null;
    disposition: string | null;
    part_id: string | null;
    headers: string | null;
    data: string | null;
  };

  type MailGetResponse = {
    email: EmailRowWire | null;
    attachments: AttachmentWire[];
  };

  type AttachmentDownloadResponse = {
    data: string;
    mime_type: string;
    filename: string;
  };

  type PickFilesResponse = {
    files: {
      name: string;
      mime_type: string;
      data: string;
      local_path: string;
      size: number;
    }[];
  };

  type SaveFileResponse = {
    savedTo: string | null;
    cancelled: boolean;
  };

  type EmailPreviewWire = {
    id: string;
    account_id: string;
    thread_id: string | null;
    thread_message_count: number | null;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    toAddr: string | null;
    cc: string | null;
    bcc: string | null;
    snippet: string | null;
    labels?: string[];
    classification_labels?: string[] | null;
    folder: string;
    is_read: number | null;
    is_starred: number | null;
    is_flagged: number | null;
    sent_at: string | null;
    received_at: string | null;
    draft_mode: DraftMode | null;
    original_email_id: string | null;
    gmail_draft_id?: string | null;
    local_draft_id?: string | null;
    message_id?: string | null;
    matchedFields?: string[];
    snippet_hl?: string | null;
    has_attachments?: boolean;
    avatar_url?: string | null;
  };

  type ScheduledListRow = {
    kind: "scheduled";
    id: string;
    account_id: string;
    name: string;
    subject: string;
    snippet: string;
    time_label: string;
    status?: "queued" | "sending" | "failed";
    item: OutboxItemWire;
  };

  type ReminderListRow = {
    kind: "reminder";
    id: string;
    folder: string;
    account_id: string;
    name: string;
    subject: string;
    snippet: string;
    time_label: string;
    reminder: ReminderWire;
  };

  type MailListRow = EmailPreviewWire | ScheduledListRow | ReminderListRow;

  type ClientFilterClause = {
    id: string;
    // What to match against
    field:
       | "category"
       | "label"
       | "is_important"
       | "is_unread"
      | "has_attachments"
      | "from"
      | "to"
      | "cc"
      | "bcc"
      | "subject"
      | "date";
    // Condition/operator
    op:
      | "is"
      | "is_not"
      | "eq"
      | "neq"
      | "contains"
      | "not_contains"
      | "before"
      | "after"
      | "range";
    // Text/value membership
    value?: string;
    value_boolean?: boolean;
    // Date range boundaries (YYYY-MM-DD)
    from?: string;
    to?: string;
  };

  type FilteredViewWire = {
    id: string;
    name: string;
    icon_name: string;
    clauses: ClientFilterClause[];
    folder: string;
    visible: boolean;
    position: number;
  };

  type NotificationFilterWire = {
    id: string;
    name: string;
    icon_name: string;
    clauses: ClientFilterClause[];
    enabled: boolean;
    position: number;
  };

  type EmailRowWire = {
    id: string;
    provider: string;
    account_id: string;
    thread_id: string | null;
    message_id: string | null;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    to: string | null;
    cc: string | null;
    bcc: string | null;
    reply_to: string | null;
    reply_to_address: string | null;
    body_text: string | null;
    body_html: string | null;
    mail_cached_at: string | null;
    image_dimensions: string | null;
    images_measured: number | null;
    snippet: string | null;
    folder: string;
    is_read: number | null;
    is_starred: number | null;
    is_flagged: number | null;
    is_phishing: number | null;
    received_at: string | null;
    sent_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    synced_at: string | null;
  };

  type AccountRowWire = {
    id: string;
    provider: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    has_credentials: number;
    is_active: number | null;
    created_at: string | null;
  };

  type ThreadRowWire = {
    id: string;
    subject: string | null;
    latest_received_at: string | null;
    message_count: number | null;
    snippet: string | null;
  };

  type ContactInteraction = {
    email: string;
    name: string | null;
    type: "received" | "sent";
  };

  type ContactRow = {
    id: string;
    account_id: string;
    name: string | null;
    email: string;
    last_contacted_at: string | null;
    times_contacted: number;
    emails_received: number;
    emails_sent: number;
    avatar_url: string | null;
    photo_fetched_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  };

  type ContactWire = {
    id: string;
    name: string | null;
    email: string;
    last_contacted_at: string | null;
    times_contacted: number;
    emails_received: number;
    emails_sent: number;
    avatar_url: string | null;
  };

  type SendAsAliasWire = {
    id: string;
    account_id: string;
    send_as_email: string;
    display_name: string | null;
    reply_to_address: string | null;
    signature: string | null;
    is_primary: boolean;
    is_default: boolean;
    treat_as_alias: boolean;
    verification_status: string | null;
  };

  type SignatureTemplateWire = {
    id: string;
    account_id: string;
    name: string;
    body: string;
  };

  type NoteWire = {
    id: string;
    email_id: string | null;
    account_id: string | null;
    content: string;
    created_at: string | null;
    updated_at: string | null;
  };

  type FilterCriteriaWire = {
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
    negatedQuery?: string;
    hasAttachment?: boolean;
    excludeChats?: boolean;
    size?: number;
    sizeComparison?: string;
  };

  type FilterActionWire = {
    add_label_ids?: string[];
    remove_label_ids?: string[];
    forward?: string;
  };

  type FilterWire = {
    id: string;
    account_id: string;
    criteria: FilterCriteriaWire;
    action: FilterActionWire;
    actionRaw?: FilterActionWire;
  };

  type EmailTemplateWire = {
    id: string;
    account_id: string;
    name: string;
    subject: string;
    body: string;
  };

  type DraftWire = {
    id: string;
    account_id: string;
    mode: DraftMode;
    to: string;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    from_address: string | null;
    from_name: string | null;
    original_email_id: string | null;
    quote_text: string | null;
    snippet: string | null;
    attachments: AttachmentWire[];
    gmail_draft_id: string | null;
    gmail_message_id: string | null;
    updated_at: string | null;
  };

  type DraftEmailSavedWire = {
    draft_id: string;
    gmail_draft_id: string;
    gmail_message_id: string;
    original_email_id?: string;
  };

  type DraftEmailSentWire = {
    draft_id: string;
    sent_message_id: string;
    thread_id: string;
  };

  type SendTiming = {
    undo_enabled: boolean;
    undo_seconds: number;
  };

  type OutboxItemWire = {
    id: string;
    account_id: string;
    command: string;
    payload: string | null;
    extras: string | null;
    to_addr: string | null;
    subject: string | null;
    thread_id: string | null;
    status: "queued" | "sending" | "sent" | "failed" | "cancelled";
    error: string | null;
    created_at: number;
    sent_at: number | null;
    scheduled_at: number | null;
    available_at: number | null;
    attempt_count: number;
    next_retry_at: number | null;
    locked_at: number | null;
    locked_by: string | null;
  };

  type OutboxChangedWire = {
    account_id: string;
    thread_id: string | null;
  };

  type DiagData = {
    database: {
      path: string;
      size: number;
      emailCount: number;
      threadCount: number;
      attachmentCount: number;
      accountCount: number;
    };
    accounts: {
      id: string;
      provider: string;
      email: string;
      name: string | null;
      created_at: string | null;
      is_active: number;
      backfill_state: {
        backfill_done: number | null;
        backfill_status: string | null;
        backfill_next_page_token: string | null;
        backfill_oldest_synced_at: string | null;
        backfill_initial_total_messages: number | null;
      } | null;
      newfill_state: {
        newfill_current_history_id: string | null;
        newfill_last_synced_at: string | null;
        newfill_status: string | null;
      } | null;
    }[];
    environment: {
      platform: string;
      arch: string;
      bun: string;
    };
  };

  type ContextMenuActionWire = {
    action: string;
    data?: unknown;
  };

  type EmailCommandWire = {
    cmd: "draft-deleted" | "folder-changed";
    email_id: string;
    fromFolder?: string;
    toFolder?: string;
    updates?: Record<string, unknown>;
  };

  type NotificationEmailWire = {
    account_id: string;
    email_id: string;
    subject: string;
    from: string;
  };

  type MessageSend = (msg: string, payload?: unknown) => void;

  type GmailDraftRef = {
    id: string;
    message_id: string;
    thread_id: string;
  };

  type AttachmentPayload = {
    name: string;
    mime_type: string;
    data: string;
    local_path: string | null;
    size: number;
  };

  type ContextMenuShowParams = {
    kind: string;
    url?: string;
    email_id?: string;
    account_id?: string;
    is_read?: boolean;
    is_flagged?: boolean;
    folder?: string;
    quote_text?: string;
    x: number;
    y: number;
  };

  type SendAsAliasRow = {
    id: string;
    account_id: string;
    send_as_email: string;
    display_name: string | null;
    reply_to_address: string | null;
    signature: string | null;
    is_primary: number | null;
    is_default: number | null;
    treat_as_alias: number | null;
    verification_status: string | null;
  };

  type FtsSearchRow = {
    rowid: number;
    id: string;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    to: string | null;
    cc: string | null;
    bcc: string | null;
  };

  type OutboxCommand =
    | "draft_send"
    | "draft_save"
    | "draft_delete"
    | "send_email"
    | "delete_email"
    | "label_update"
    | "label_batch"
    | "mark_as_read"
    | "mark_as_unread"
    | "mark_as_spam"
    | "mark_as_phishing"
    | "move_to_archive"
    | "move_to_inbox"
    | "untrash"
    | "block_sender"
    | "toggle_important"
    | "toggle_starred";

  type OutboxItemRow = {
    id: string;
    account_id: string;
    command: OutboxCommand;
    payload: string | null;
    extras: string | null;
    to_addr: string | null;
    subject: string | null;
    thread_id: string | null;
    created_at: number;
    scheduled_at: number | null;
  };

  type ParsedLabels = {
    folder: string;
    is_read: number;
    is_starred: number;
    is_flagged: number;
  };

  type ContactAutocompleteState = {
    field: "to" | "cc" | "bcc";
    query: string;
    results: ContactWire[];
    index: number;
  };

  type SidebarUserInfo = {
    name: string | null;
    email: string;
    avatar_url: string | null;
  };

  type SavedToastState = {
    filename: string;
    path: string;
    isLocal?: boolean;
  };

  type MediaQueryOpts = {
    account_id: string;
    cursor?: number;
    limit?: number;
  };

  type VerifyDomainResult = {
    access_token: string;
    email: string;
    name: string;
  };

  type GmailUserInfo = {
    email: string;
    name: string;
    picture: string;
  };

  type DraftStatus =
    "loading" | "loaded" | "saving" | "saved" | "sending" | "error";

  type SendResult =
    { ok: true; outboxId: string } | { ok: false; error: string };

  type ComposeBody = {
    body_html: string;
    body_text: string;
  };

  type SentToastState = {
    status: "pending" | "sent" | "failed";
    outbox_id: string | null;
    error?: string;
    undo_enabled: boolean;
    is_draft: boolean;
    mode: DraftMode;
    countdown_total: number;
  };

  type ComposePreviousState = {
    meta: ComposeMeta;
    body: ComposeBody;
  };

  type UseDraftEmailParams = {
    account_id: string | null;
    initialMode: DraftMode;
    email?: EmailPreviewWire;
    quote_text: string;
    draft_id: string | null | undefined;
    editorRef: React.RefObject<HTMLDivElement | null>;
    setComposeState: (
      updater:
        ComposeMeta | ((prev: ComposeMeta) => ComposeMeta),
    ) => void;
    onClose: () => void;
  };

  type LabelWire = {
    id: string;
    name: string;
    icon_name?: string | null;
    type?: string;
  };

  type LabelRefWire = {
    id: string;
    name: string;
    icon_name?: string | null;
  };

  type LabelsListWire = {
    userLabels: LabelRefWire[];
    systemLabels: LabelRefWire[];
    categories: LabelRefWire[];
  };

  type ConfigEntryWire = {
    key: string;
    displayValue: string;
    source: "override" | "env" | "default";
    meta: { description: string; sensitive: boolean };
  };

  type MailHandlerState = "unattempted" | "attempted" | "completed";

  type AppSetupRowWire = {
    key: "move" | "launcher" | "mail_handler";
    title: string;
    description: string;
    guide_url: string | null;
    done: boolean;
    done_label: string;
    action_label: string;
  };

  type AppSetupStatusWire = {
    should_auto_move: boolean;
    move_auto_failed: boolean;
    rows: AppSetupRowWire[];
  };

  type UpdateLocalInfoWire = {
    version: string;
    hash: string;
    baseUrl: string;
    channel: string;
    name: string;
    identifier: string;
  };

  type UpdateStatusDetailsWire = {
    fromHash?: string;
    toHash?: string;
    currentHash?: string;
    latestHash?: string;
    patchNumber?: number;
    totalPatchesApplied?: number;
    progress?: number;
    bytesDownloaded?: number;
    totalBytes?: number;
    usedPatchPath?: boolean;
    errorMessage?: string;
    url?: string;
    zstdPath?: string;
    exitCode?: number | null;
  };

  type UpdateStatusEntryWire = {
    status: string;
    message: string;
    timestamp: number;
    details?: UpdateStatusDetailsWire;
  };

  type UpdateGetStatusWire = {
    local: UpdateLocalInfoWire;
    status: UpdateStatusEntryWire | null;
    updateReady: boolean;
    latestHash: string;
    latestVersion: string;
  };

  type UpdateCheckResultWire = {
    version: string;
    hash: string;
    updateAvailable: boolean;
    updateReady: boolean;
    error: string;
  };

  type IntelligenceModelCapabilitiesWire = {
    imageInput: boolean;
    objectGeneration: boolean;
    toolUsage: boolean;
    toolStreaming: boolean;
  };

  type IntelligenceModelWire = {
    id: string;
    capabilities: IntelligenceModelCapabilitiesWire;
  };

  type IntelligenceProviderWire = {
    id: string;
    name: string;
    defaultEndpoint: string;
    models: IntelligenceModelWire[];
  };

  type IntelligenceConnectionPathWire = "direct" | "gateway" | "custom";

  type IntelligenceConnectionWire = {
    path: IntelligenceConnectionPathWire;
    provider: string;
    model: string;
    endpoint: string;
    apiKey?: string;
    capabilities: IntelligenceModelCapabilitiesWire;
    lastTestedAt: string | null;
    lastError: string | null;
  };

  type IntelligenceProbeWire = {
    ok: boolean;
    error?: string;
  };

  type IntelligenceTestResultWire = {
    auth: IntelligenceProbeWire;
    model: IntelligenceProbeWire;
    structuredOutput: IntelligenceProbeWire;
    lastTestedAt: string;
  };

  type AutoLabelPromptInputWire = {
    name: string;
    prompt: string;
    label_ids: string[];
    enabled: boolean;
  };

  type AutoLabelPromptWire = {
    id: string;
    account_id: string;
    name: string;
    prompt: string;
    label_ids: string[];
    enabled: boolean;
    created_at: string;
    version: number;
    content_hash: string;
  };

  type AutoLabelTemplateEntryInputWire = {
    name: string;
    labels: string[];
    prompt: string;
    enabled: boolean;
  };

  type AutoLabelTemplateEntryWire = {
    id: string;
    name: string;
    labels: string[];
    prompt: string;
    enabled: boolean;
  };

  type AutoLabelTemplateInputWire = {
    name: string;
    entries: AutoLabelTemplateEntryInputWire[];
    enabled: boolean;
  };

  type AutoLabelTemplateWire = {
    id: string;
    account_id: string;
    name: string;
    enabled: boolean;
    entries: AutoLabelTemplateEntryWire[];
    created_at: string;
    version: number;
    content_hash: string;
  };

  type AutoLabelJobStatusWire =
    "queued" | "running" | "done" | "failed" | "cancelled";

  type AutoLabelRuleKindWire = "prompt" | "template";

  type AutoLabelJobScopeWire = "recent" | "all";

  type AutoLabelJobEnqueueInputWire = {
    account_id: string;
    kind: AutoLabelRuleKindWire;
    rule_id: string;
    rule_name: string;
    rule_version: number;
    scope: AutoLabelJobScopeWire;
    scope_limit?: number;
  };

  type AutoLabelJobWire = {
    id: string;
    account_id: string;
    kind: AutoLabelRuleKindWire;
    rule_id: string;
    rule_name: string;
    rule_version: number;
    scope: AutoLabelJobScopeWire;
    scope_limit: number | null;
    status: AutoLabelJobStatusWire;
    scanned: number;
    matches: number;
    applied: number;
    total: number;
    error: string | null;
    created_at: number;
    started_at: number | null;
    finished_at: number | null;
  };

  type AutoLabelModeWire = "setup" | "features";

  type AutoLabelPromptDraftWire = {
    name: string;
    prompt: string;
  };

  type AutoLabelTemplateEntryDraftWire = {
    key: string;
    name: string;
    prompt: string;
    labels: { id: string; name: string }[];
  };

  type AutoLabelTemplateDraftWire = {
    name: string;
    entries: AutoLabelTemplateEntryDraftWire[];
  };

  type AutoLabelApplyTargetWire = {
    kind: AutoLabelRuleKindWire;
    id: string;
    name: string;
    version: number;
  };
}
