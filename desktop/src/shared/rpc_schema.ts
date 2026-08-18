import type { ElectrobunRPCSchema } from "electrobun";

export interface WorkBoundRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      "mail:list": {
        params: {
          account_id: string;
          folder: string;
          cursor?: string;
          limit?: number;
        };
        response: EmailPreviewWire[];
      };
      "mail:listAll": {
        params: AccountScope;
        response: EmailPreviewWire[];
      };
      "mail:listPage": {
        params: {
          account_id: string;
          limit: number;
          offset?: number;
          before?: { received_at: string; id: string };
        };
        response: { emails: EmailPreviewWire[]; total: number };
      };
      "mail:count": {
        params: AccountScope;
        response: { total: number };
      };
      "mail:listUp": {
        params: { account_id: string; since: string };
        response: EmailPreviewWire[];
      };
      "mail:listDown": {
        params: { account_id: string; before: string };
        response: EmailPreviewWire[];
      };
      "mail:fetchFirstPage": {
        params: { account_id: string; maxResults?: number };
        response: EmailPreviewWire[];
      };
      "mail:get": {
        params: EntityId;
        response: EmailRowWire | null;
      };
      "mail:get_attachments": {
        params: EmailId;
        response: AttachmentWire[];
      };
      "mail:downloadEml": {
        params: EntityId;
        response: { content: string };
      };
      "sync:latest": {
        params: AccountScope;
        response: SuccessWire;
      };
      "attachment:download": {
        params: AttachmentRef;
        response: { content: string; filename: string; mime_type: string };
      };
      "attachment:save": {
        params: EntityId;
        response: SaveFileResponse;
      };
      "reveal:inFinder": {
        params: { path: string };
        response: SuccessWire;
      };
      "mail:update": {
        params: {
          id: string;
          data: {
            is_read?: number;
            is_starred?: number;
            is_flagged?: number;
            folder?: string;
          };
        };
        response: SuccessWire;
      };
      "mail:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "mail:search": {
        params: { query: string; limit?: number };
        response: EmailRowWire[];
      };
      "mail:search_local": {
        params: {
          query: string;
          limit?: number;
          account_id?: string;
          folder?: string;
        };
        response: EmailPreviewWire[];
      };
      "reminders:list": {
        params: AccountScope;
        response: ReminderWire[];
      };
      "reminders:create": {
        params: { account_id: string; email_id: string; thread_id?: string | null; remind_at: number };
        response: ReminderWire;
      };
      "reminders:update": {
        params: { id: string; account_id?: string; remind_at?: number; status?: "pending" | "completed" | "dismissed" };
        response: SuccessWire;
      };
      "reminders:delete": {
        params: EntityId & { account_id?: string };
        response: SuccessWire;
      };
      "thread:get": {
        params: EntityId;
        response: ThreadRowWire | null;
      };
      "thread:emails": {
        params: ThreadId;
        response: EmailRowWire[];
      };
      "thread:previews": {
        params: ThreadId;
        response: EmailPreviewWire[];
      };
      "account:list": {
        params: void;
        response: AccountRowWire[];
      };
      "account:get": {
        params: EntityId;
        response: AccountRowWire | null;
      };
      "account:getByEmail": {
        params: { email: string };
        response: AccountRowWire | null;
      };
      "account:add": {
        params: { provider: string; email: string; name?: string };
        response: EntityId;
      };
      "sync:past": {
        params: AccountScope;
        response: StartedWire;
      };
      "sync:pastAll": {
        params: void;
        response: StartedWire;
      };
      "account:logout": {
        params: void;
        response: SuccessWire;
      };
      "account:deleteAll": {
        params: void;
        response: SuccessWire;
      };
      "sync:polling:start": {
        params: { account_id: string; intervalMs?: number };
        response: SuccessWire;
      };
      "sync:polling:stop": {
        params: AccountScope;
        response: SuccessWire;
      };
      "sync:past:cancel": {
        params: AccountScope;
        response: SuccessWire;
      };
      "sync:backfill_state": {
        params: AccountScope;
        response: BackfillStateWire | null;
      };
      "auth:start_gmail_oauth": {
        params: void;
        response: StartedWire;
      };
      "auth:prepare_gmail_oauth": {
        params: void;
        response: OAuthPrepareWire;
      };
      "auth:launch_gmail_oauth": {
        params: { skip_open?: boolean };
        response: StartedWire;
      };
      "auth:cancelGmailOAuth": {
        params: void;
        response: SuccessWire;
      };
      "auth:reconnect_gmail": {
        params: AccountScope;
        response: StartedWire;
      };
      "db:stats": {
        params: void;
        response: {
          emailCount: number;
          threadCount: number;
          attachmentCount: number;
          accountCount: number;
        };
      };
      "diag:snapshot": {
        params: void;
        response: DiagData;
      };
      "outbox:enqueue": {
        params: {
          account_id: string;
          command?: string;
          payload?: string;
          extras?: string;
          to?: string;
          cc?: string;
          bcc?: string;
          subject?: string;
          body_html?: string;
          body_text?: string;
          quote_text?: string;
          attachments?: {
            name: string;
            mime_type: string;
            data: string;
            local_path: string | null;
          }[];
          from_address?: string;
          from_name?: string;
          draft_id?: string;
          scheduled_at?: number;
        };
        response: EntityId;
      };
      "outbox:cancel": {
        params: EntityId & { source?: "undo" | "edit" };
        response: { success: boolean; draft_id: string | null };
      };
      "outbox:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "outbox:list": {
        params: { thread_id?: string; status?: string | string[] } | void;
        response: OutboxItemWire[];
      };
      "outbox:get": {
        params: EntityId;
        response: OutboxItemWire | null;
      };
      "outbox:send_now": {
        params: EntityId;
        response: SuccessWire;
      };
      "draft:save": {
        params: {
          id?: string;
          account_id: string;
          mode: string;
          to: string;
          cc?: string;
          bcc?: string;
          subject: string;
          body_html: string;
          body_text: string;
          from_address?: string;
          from_name?: string;
          original_email_id?: string;
          quote_text?: string;
          lastGmailMessageId?: string;
          force?: boolean;
          attachments: {
            name: string;
            mime_type: string;
            data: string;
            local_path: string | null;
            size: number;
          }[];
        };
        response: { id: string; conflict?: boolean };
      };
      "draft:get": {
        params: EntityId;
        response: DraftWire | null;
      };
      "draft:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "draft:find_by_original": {
        params: { account_id: string; original_email_id: string };
        response: DraftWire | null;
      };
      "draft:list": {
        params: AccountScope;
        response: EmailPreviewWire[];
      };
      "draft:sync": {
        params: AccountScope;
        response: { synced: number; removed: number };
      };
      "contacts:search": {
        params: { account_id: string; q: string; limit?: number };
        response: ContactWire[];
      };
      "file:save": {
        params: { filename: string; content: string };
        response: SaveFileResponse;
      };
      "file:pick": {
        params: void;
        response: PickFilesResponse;
      };
      "clipboard:write": {
        params: { text: string };
        response: SuccessWire;
      };
      "url:open": {
        params: { url: string };
        response: SuccessWire;
      };
      "shortcuts:open_accessibility_settings": {
        params: void;
        response: SuccessWire;
      };
      toggleZoom: {
        params: void;
        response: SuccessWire;
      };
      "window:setTrafficLights": {
        params: { visible: boolean };
        response: SuccessWire;
      };
      "context_menu:show": {
        params: {
          kind: "link" | "image" | "text" | "email";
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
        response: SuccessWire;
      };
      "services:start": {
        params: void;
        response: SuccessWire;
      };
      "services:stop": {
        params: void;
        response: SuccessWire;
      };
      "email:command": {
        params: {
          cmd: "draft-deleted" | "folder-changed";
          email_id: string;
          fromFolder?: string;
          toFolder?: string;
          updates?: Record<string, unknown>;
        };
        response: never;
      };
      "prefs:get": {
        params: { key: string };
        response: { value: unknown };
      };
      "prefs:set": {
        params: { key: string; value: unknown };
        response: SuccessWire;
      };
      "prefs:getAll": {
        params: void;
        response: { prefs: Record<string, unknown> };
      };
      "sendAs:list": {
        params: AccountScope;
        response: SendAsAliasWire[];
      };
      "sendAs:sync": {
        params: AccountScope;
        response: { synced: number };
      };
      "sendAs:update": {
        params: {
          id: string;
          send_as_email: string;
          display_name: string;
          reply_to?: string;
          signature?: string;
        };
        response: SuccessWire;
      };
      "signature:list": {
        params: AccountScope;
        response: SignatureTemplateWire[];
      };
      "signature:create": {
        params: { account_id: string; name: string; body: string };
        response: SignatureTemplateWire;
      };
      "signature:update": {
        params: { id: string; name: string; body: string };
        response: SuccessWire;
      };
      "signature:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "notes:list": {
        params: AccountScope;
        response: NoteWire[];
      };
      "notes:getByEmail": {
        params: EmailId;
        response: NoteWire[];
      };
      "notes:create": {
        params: { email_id?: string; account_id?: string; content: string };
        response: NoteWire;
      };
      "notes:update": {
        params: { id: string; content: string };
        response: SuccessWire;
      };
      "notes:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "filtered_views:list": {
        params: AccountScope;
        response: FilteredViewWire[];
      };
      "filtered_views:save": {
        params: { account_id: string; view: FilteredViewWire };
        response: FilteredViewWire;
      };
      "filtered_views:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "filtered_views:replace": {
        params: { account_id: string; views: FilteredViewWire[] };
        response: SuccessWire;
      };
      "notification_filters:list": {
        params: AccountScope;
        response: NotificationFilterWire[];
      };
      "notification_filters:replace": {
        params: { account_id: string; filters: NotificationFilterWire[] };
        response: SuccessWire;
      };
      "templates:list": {
        params: AccountScope;
        response: EmailTemplateWire[];
      };
      "templates:create": {
        params: {
          account_id: string;
          name: string;
          subject: string;
          body: string;
        };
        response: EmailTemplateWire;
      };
      "templates:update": {
        params: {
          id: string;
          name: string;
          subject: string;
          body: string;
        };
        response: SuccessWire;
      };
      "templates:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "contacts:list": {
        params: AccountScope;
        response: ContactWire[];
      };
      "contacts:create": {
        params: { account_id: string; email: string; name?: string };
        response: ContactWire;
      };
      "contacts:update": {
        params: { id: string; email?: string; name?: string };
        response: SuccessWire;
      };
      "contacts:delete": {
        params: EntityId;
        response: SuccessWire;
      };
      "filters:list": {
        params: AccountScope;
        response: FilterWire[];
      };
      "filters:create": {
        params: { account_id: string; criteria: FilterCriteriaWire; action: FilterActionWire };
        response: { id: string };
      };
      "filters:delete": {
        params: AccountScopedId;
        response: SuccessWire;
      };
      "labels:list": {
        params: AccountScope;
        response: LabelsListWire;
      };
      "labels:create": {
        params: { account_id: string; name: string; icon_name?: string | null };
        response: LabelWire;
      };
      "labels:update": {
        params: AccountScopedId & { name: string; icon_name?: string | null };
        response: SuccessWire;
      };
      "labels:delete": {
        params: AccountScopedId;
        response: SuccessWire;
      };
      "labels:changed": {
        params: AccountScope;
        response: SuccessWire;
      };
      "intelligence:get_providers": {
        params: void;
        response: IntelligenceProviderWire[];
      };
      "intelligence:get_connection": {
        params: void;
        response: IntelligenceConnectionWire | null;
      };
      "intelligence:save_connection": {
        params: {
          path: IntelligenceConnectionPathWire;
          provider: string;
          model: string;
          endpoint?: string;
          apiKey?: string;
        };
        response: {
          connection: IntelligenceConnectionWire;
          test: IntelligenceTestResultWire;
        };
      };
      "intelligence:test_connection": {
        params: {
          path: IntelligenceConnectionPathWire;
          provider: string;
          model: string;
          endpoint?: string;
          apiKey?: string;
        };
        response: IntelligenceTestResultWire;
      };
      "intelligence:delete_connection": {
        params: void;
        response: SuccessWire;
      };
      "intelligence:auto_label_prompts_list": {
        params: AccountScope;
        response: AutoLabelPromptWire[];
      };
      "intelligence:auto_label_prompts_create": {
        params: AccountScope & AutoLabelPromptInputWire;
        response: AutoLabelPromptWire;
      };
      "intelligence:auto_label_prompts_update": {
        params: AccountScopedId & AutoLabelPromptInputWire;
        response: AutoLabelPromptWire | null;
      };
      "intelligence:auto_label_prompts_delete": {
        params: AccountScopedId;
        response: SuccessWire;
      };
      "intelligence:label_templates_list": {
        params: AccountScope;
        response: AutoLabelTemplateWire[];
      };
      "intelligence:label_templates_create": {
        params: {
          account_id: string;
          name: string;
          entries: AutoLabelTemplateEntryInputWire[];
          enabled: boolean;
        };
        response: AutoLabelTemplateWire;
      };
      "intelligence:label_templates_update": {
        params: AccountScopedId & {
          name: string;
          entries: AutoLabelTemplateEntryInputWire[];
          enabled: boolean;
        };
        response: AutoLabelTemplateWire | null;
      };
      "intelligence:label_templates_delete": {
        params: AccountScopedId;
        response: SuccessWire;
      };
      "intelligence:auto_label_jobs_enqueue": {
        params: AutoLabelJobEnqueueInputWire;
        response: AutoLabelJobWire;
      };
      "intelligence:auto_label_jobs_list": {
        params: AccountScope;
        response: AutoLabelJobWire[];
      };
      "intelligence:auto_label_jobs_cancel": {
        params: AccountScopedId;
        response: SuccessWire;
      };
      "config:list": {
        params: void;
        response: ConfigEntryWire[];
      };
      "config:set": {
        params: { key: string; value?: string };
        response: SuccessWire;
      };
      "dev:test_notification": {
        params: { title: string; body: string };
        response: SuccessWire;
      };
      "notifications:request_permission": {
        params: void;
        response: SuccessWire;
      };
      "notifications:test": {
        params: void;
        response: SuccessWire;
      };
      "notifications:open_settings": {
        params: void;
        response: SuccessWire;
      };
      "app_setup:get_status": {
        params: void;
        response: AppSetupStatusWire;
      };
      "app_setup:move_to_applications": {
        params: void;
        response: SuccessWithErrorWire;
      };
      "app_setup:add_launcher": {
        params: void;
        response: SuccessWithErrorWire;
      };
      "app_setup:set_default_mail_handler": {
        params: { completed?: boolean };
        response: SuccessWithErrorWire;
      };
      "updates:get_status": {
        params: void;
        response: UpdateGetStatusWire;
      };
      "updates:check": {
        params: void;
        response: UpdateCheckResultWire;
      };
      "updates:download": {
        params: void;
        response: SuccessWithErrorWire;
      };
      "updates:install": {
        params: void;
        response: SuccessWithErrorWire;
      };
      "images:get": {
        params: { url: string };
        response: { data_uri: string | null };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      "context_menu:action": ContextMenuActionWire;
      "sync:backfill_start": BackfillStartWire;
      "sync:backfill_progress": BackfillProgressWire;
      "sync:backfill_done": BackfillDoneWire;
      "sync:backfill_error": BackfillErrorWire;
      "sync:attachments_meta_backfill_done": AttachmentsMetaBackfillDoneWire;
      "sync:newfill_progress": NewfillProgressWire;
      "auth:login_complete": AuthLoginCompleteWire;
      "auth:invalid_grant": InvalidGrantWire;
      "auth:reconnect_complete": AuthReconnectCompleteWire;
      "draft:email_saved": DraftEmailSavedWire;
      "draft:email_sent": DraftEmailSentWire;
      "draft:externally_modified": { id: string };
      "email:command": EmailCommandWire;
      "notification:email": NotificationEmailWire;
      "outbox:changed": OutboxChangedWire;
      "reminders:changed": { account_id: string };
      "labels:changed": AccountScope;
      "contacts:changed": AccountScope;
      "updates:status": UpdateStatusEntryWire;
      "intelligence:auto_label_job_progress": AutoLabelJobWire;
      "intelligence:auto_label_job_done": AutoLabelJobWire;
      "intelligence:auto_label_job_error": AutoLabelJobWire;
    };
  };
}

type WorkBoundBunRequests = WorkBoundRPCSchema["bun"]["requests"];
type WorkBoundWebviewMessages = WorkBoundRPCSchema["webview"]["messages"];

type RequestParams<T extends { params: unknown }> =
  undefined extends T["params"]
  ? [params?: T["params"]]
  : [params: T["params"]];

export type TypedRPC = {
  setTransport: (transport: {
    send: (data: any) => void;
    registerHandler?: (handler: (data: any) => void) => void;
    unregisterHandler?: () => void;
  }) => void;
  request<M extends keyof WorkBoundBunRequests>(
    method: M,
    ...args: RequestParams<WorkBoundBunRequests[M]>
  ): Promise<WorkBoundBunRequests[M]["response"]>;
  addMessageListener<M extends keyof WorkBoundWebviewMessages>(
    message: M,
    listener: (payload: WorkBoundWebviewMessages[M]) => void,
  ): void;
  removeMessageListener<M extends keyof WorkBoundWebviewMessages>(
    message: M,
    listener: (payload: WorkBoundWebviewMessages[M]) => void,
  ): void;
};
