import { useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { prefsAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { pref_keys } from "@/shared/pref_keys";
import { NotificationFiltersSection } from "./notification_filters_section";

type Props = {
  account_id: string;
};

export function NotificationsPanel({ account_id }: Props) {
  const prefs = useAtomValue(prefsAtom);
  const set_prefs = useSetAtom(prefsAtom);
  const [is_toggling, set_is_toggling] = useState(false);
  const [is_opening_settings, set_is_opening_settings] = useState(false);
  const is_opening_settings_ref = useRef(false);

  const enabled = (prefs[pref_keys.notifications_enabled] as boolean) ?? false;
  const important_only = (prefs[pref_keys.notifications_important_only] as boolean) ?? true;

  async function update_pref(key: string, value: unknown) {
    set_prefs((prev) => ({ ...prev, [key]: value }));
    try {
      await rpc.request(messages.prefs_set, { key, value });
    } catch {
      console.warn("notifications: failed to update preference");
    }
  }

  async function toggle_notifications() {
    const next_enabled = !enabled;
    set_is_toggling(true);
    try {
      await update_pref(pref_keys.notifications_enabled, next_enabled);
      if (next_enabled) await rpc.request(messages.notifications_request_permission);
    } finally {
      set_is_toggling(false);
    }
  }

  async function send_test_notification() {
    await rpc.request(messages.notifications_test);
  }

  async function open_notification_settings() {
    if (is_opening_settings_ref.current) return;
    is_opening_settings_ref.current = true;
    set_is_opening_settings(true);
    try {
      await rpc.request(messages.notifications_open_settings);
    } finally {
      setTimeout(() => {
        is_opening_settings_ref.current = false;
        set_is_opening_settings(false);
      }, 1500);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-text-primary mb-4">Notifications</h2>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">System notification access</p>
            <p className="text-xs text-text-secondary mt-0.5">Allow WorkBound in your system settings before email alerts can appear.</p>
          </div>
          <button onClick={open_notification_settings} disabled={is_opening_settings} className="px-3 py-1.5 text-sm font-medium text-text-primary border border-gray-300 rounded-md transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            {is_opening_settings ? "Opening" : "Open settings"}
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Email notifications</p>
            <p className="text-xs text-text-secondary mt-0.5">When enabled, WorkBound sends alerts for matching new emails.</p>
          </div>
          <button onClick={toggle_notifications} disabled={is_toggling} className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${enabled ? "bg-blue-600" : "bg-gray-300"} ${is_toggling ? "opacity-60" : ""}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Test notification</p>
            <p className="text-xs text-text-secondary mt-0.5">Send a sample alert to check your system notification setup.</p>
          </div>
          <button onClick={send_test_notification} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md transition-colors hover:bg-blue-100">Send test</button>
        </div>

        <div className={`flex items-center justify-between py-3 ${!enabled ? "opacity-40" : ""}`}>
          <div>
            <p className="text-sm font-medium text-text-primary">Only important emails</p>
            <p className="text-xs text-text-secondary mt-0.5">Always notify for important emails, in addition to custom filters.</p>
          </div>
          <button onClick={() => { if (enabled) update_pref(pref_keys.notifications_important_only, !important_only); }} className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${important_only && enabled ? "bg-blue-600" : "bg-gray-300"} ${!enabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${important_only ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        <div className={`py-3 ${!enabled ? "opacity-40" : ""}`}>
          <NotificationFiltersSection account_id={account_id} disabled={!enabled} />
        </div>
      </div>
    </div>
  );
}
