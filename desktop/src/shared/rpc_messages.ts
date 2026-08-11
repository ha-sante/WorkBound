// message names

export const messages = {
  // bun → webview
  sync_backfill_start:        "sync:backfill_start",
  sync_backfill_progress:     "sync:backfill_progress",
  sync_backfill_done:         "sync:backfill_done",
  sync_backfill_error:        "sync:backfill_error",
  sync_attachments_meta_backfill_done: "sync:attachments_meta_backfill_done",
  sync_newfill_progress:      "sync:newfill_progress",
  auth_login_complete:        "auth:login_complete",
  auth_invalid_grant:         "auth:invalid_grant",
  auth_reconnect_gmail:       "auth:reconnect_gmail",
  auth_reconnect_complete:    "auth:reconnect_complete",

  // webview → bun (rpc request)
  account_list:               "account:list",
  account_get:                "account:get",
  account_get_by_email:       "account:getByEmail",
  account_add:                "account:add",
  account_logout:             "account:logout",
  account_delete_all:         "account:deleteAll",
  auth_start_gmail_oauth:     "auth:start_gmail_oauth",
  auth_prepare_gmail_oauth:   "auth:prepare_gmail_oauth",
  auth_launch_gmail_oauth:    "auth:launch_gmail_oauth",
  auth_cancel_gmail_oauth:    "auth:cancelGmailOAuth",
  db_stats:                   "db:stats",
  diag_snapshot:              "diag:snapshot",
  mail_fetch_first_page:      "mail:fetchFirstPage",
  mail_list:                  "mail:list",
  mail_list_all:              "mail:listAll",
  mail_list_page:             "mail:listPage",
  mail_count:                 "mail:count",
  mail_list_up:               "mail:listUp",
  mail_list_down:             "mail:listDown",
  mail_get:                   "mail:get",
  mail_download_eml:          "mail:downloadEml",
  mail_update:                "mail:update",
  mail_delete:                "mail:delete",
  mail_search:                "mail:search",
  mail_search_local:          "mail:search_local",
  sync_latest:                "sync:latest",
  sync_past:                  "sync:past",
  sync_past_all:              "sync:pastAll",
  sync_past_cancel:           "sync:past:cancel",
  sync_backfill_state:        "sync:backfill_state",
  sync_polling_start:         "sync:polling:start",
  sync_polling_stop:          "sync:polling:stop",
  mail_get_attachments:       "mail:get_attachments",
  thread_get:                 "thread:get",
  thread_emails:              "thread:emails",
  thread_previews:            "thread:previews",
  toggle_zoom:                "toggleZoom",
  set_traffic_lights:         "window:setTrafficLights",
  outbox_enqueue:             "outbox:enqueue",
  outbox_cancel:              "outbox:cancel",
  outbox_delete:              "outbox:delete",
  outbox_list:                "outbox:list",
  outbox_get:                 "outbox:get",
  outbox_send_now:            "outbox:send_now",
  outbox_changed:             "outbox:changed",
  contacts_search:            "contacts:search",
  attachment_download:        "attachment:download",
  attachment_save:            "attachment:save",
  reveal_in_finder:           "reveal:inFinder",
  file_save:                  "file:save",
  file_pick:                  "file:pick",
  clipboard_write:            "clipboard:write",
  url_open:                   "url:open",

  // send-as aliases
  send_as_list:               "sendAs:list",
  send_as_sync:               "sendAs:sync",
  send_as_update:             "sendAs:update",

  // drafts
  draft_save:                 "draft:save",
  draft_get:                  "draft:get",
  draft_delete:               "draft:delete",
  draft_find_by_original:     "draft:find_by_original",
  draft_list:                 "draft:list",
  draft_email_saved:          "draft:email_saved",
  draft_email_sent:           "draft:email_sent",
  draft_sync:                 "draft:sync",
  draft_externally_modified:  "draft:externally_modified",

  // background services
  services_start:             "services:start",
  services_stop:              "services:stop",

  // context menu
  context_menu_show:          "context_menu:show",
  context_menu_action:        "context_menu:action",

  // notifications
  notification_email:              "notification:email",
  notifications_request_permission:"notifications:request_permission",
  notifications_test:              "notifications:test",
  notifications_open_settings:     "notifications:open_settings",

  // email commands — unified push events from backend after any email state mutation
  email_command:              "email:command",

  // preferences
  prefs_get:                  "prefs:get",
  prefs_set:                  "prefs:set",
  prefs_get_all:              "prefs:getAll",

  // signature templates
  signature_list:             "signature:list",
  signature_create:           "signature:create",
  signature_update:           "signature:update",
  signature_delete:           "signature:delete",

  // notes
  notes_list:                 "notes:list",
  notes_get_by_email:         "notes:getByEmail",
  notes_create:               "notes:create",
  notes_update:               "notes:update",
  notes_delete:               "notes:delete",

  // filtered views
  filtered_views_list:        "filtered_views:list",
  filtered_views_save:        "filtered_views:save",
  filtered_views_delete:      "filtered_views:delete",
  filtered_views_replace:     "filtered_views:replace",

  // email templates
  templates_list:             "templates:list",
  templates_create:           "templates:create",
  templates_update:           "templates:update",
  templates_delete:           "templates:delete",

  // contacts management
  contacts_list:              "contacts:list",
  contacts_create:            "contacts:create",
  contacts_update:            "contacts:update",
  contacts_delete:            "contacts:delete",

  // gmail filters (automations)
  filters_list:               "filters:list",
  filters_create:             "filters:create",
  filters_delete:             "filters:delete",

  // labels
  labels_list:                "labels:list",
  labels_create:              "labels:create",
  labels_update:              "labels:update",
  labels_delete:              "labels:delete",
  labels_changed:             "labels:changed",
  contacts_changed:           "contacts:changed",

  // intelligence (ai connection)
  intelligence_get_providers:      "intelligence:get_providers",
  intelligence_get_connection:     "intelligence:get_connection",
  intelligence_save_connection:    "intelligence:save_connection",
  intelligence_test_connection:    "intelligence:test_connection",
  intelligence_delete_connection:  "intelligence:delete_connection",

  // intelligence auto-labeling prompts
  intelligence_auto_label_prompts_list:    "intelligence:auto_label_prompts_list",
  intelligence_auto_label_prompts_create:  "intelligence:auto_label_prompts_create",
  intelligence_auto_label_prompts_update:  "intelligence:auto_label_prompts_update",
  intelligence_auto_label_prompts_delete:  "intelligence:auto_label_prompts_delete",

  // intelligence auto-labeling templates
  intelligence_label_templates_list:    "intelligence:label_templates_list",
  intelligence_label_templates_create:  "intelligence:label_templates_create",
  intelligence_label_templates_update:  "intelligence:label_templates_update",
  intelligence_label_templates_delete:  "intelligence:label_templates_delete",

  // intelligence auto-labeling jobs
  intelligence_auto_label_jobs_enqueue:  "intelligence:auto_label_jobs_enqueue",
  intelligence_auto_label_jobs_list:     "intelligence:auto_label_jobs_list",
  intelligence_auto_label_jobs_cancel:   "intelligence:auto_label_jobs_cancel",
  intelligence_auto_label_job_progress:  "intelligence:auto_label_job_progress",
  intelligence_auto_label_job_done:      "intelligence:auto_label_job_done",
  intelligence_auto_label_job_error:     "intelligence:auto_label_job_error",

  // app config overrides
  config_list:                "config:list",
  config_set:                 "config:set",

  // dev/testing tools
  dev_test_notification:      "dev:test_notification",

  // app setup (first-run OS behaviors)
  app_setup_get_status:               "app_setup:get_status",
  app_setup_move_to_applications:     "app_setup:move_to_applications",
  app_setup_add_launcher:             "app_setup:add_launcher",
  app_setup_set_default_mail_handler: "app_setup:set_default_mail_handler",

  // app updates
  updates_get_status:                 "updates:get_status",
  updates_check:                      "updates:check",
  updates_download:                   "updates:download",
  updates_install:                    "updates:install",
  updates_status:                     "updates:status",

  // image cache
  images_get:                         "images:get",
} as const;

export type WireMessage = (typeof messages)[keyof typeof messages];

export type BunMessageMap = {
  "sync:backfill_start":      BackfillStartWire;
  "sync:backfill_progress":   BackfillProgressWire;
  "sync:backfill_done":       BackfillDoneWire;
  "sync:backfill_error":      BackfillErrorWire;
  "sync:newfill_progress":  NewfillProgressWire;
  "auth:login_complete":     AuthLoginCompleteWire;
  "auth:invalid_grant":      InvalidGrantWire;
  "auth:reconnect_complete": AuthReconnectCompleteWire;
  "context_menu:action":    ContextMenuActionWire;
  "notification:email":     NotificationEmailWire;
  "outbox:changed":         OutboxChangedWire;
  "updates:status":         UpdateStatusEntryWire;
  "intelligence:auto_label_job_progress": AutoLabelJobWire;
  "intelligence:auto_label_job_done":     AutoLabelJobWire;
  "intelligence:auto_label_job_error":    AutoLabelJobWire;
};
