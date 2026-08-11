import { useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { prefsAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { pref_keys } from "@/shared/pref_keys";
import { X, Plus } from "lucide-react";

export function NotificationsPanel() {
  const prefs = useAtomValue(prefsAtom);
  const setPrefs = useSetAtom(prefsAtom);
  const [sender_input, set_sender_input] = useState("");
  const [is_toggling, set_is_toggling] = useState(false);
  const [is_opening_settings, set_is_opening_settings] = useState(false);
  const is_opening_settings_ref = useRef(false);

  const enabled = (prefs[pref_keys.notifications_enabled] as boolean) ?? false;
  const important_only = (prefs[pref_keys.notifications_important_only] as boolean) ?? false;
  const allowed_senders = (prefs[pref_keys.notifications_allowed_senders] as string[]) ?? [];

  async function update_pref(key: string, value: unknown) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    try {
      await rpc.request(messages.prefs_set, { key, value });
    } catch { console.warn("notifications: failed to update preference"); }
  }

  async function toggle_notifications() {
    const next_enabled = !enabled;
    set_is_toggling(true);
    try {
      await update_pref(pref_keys.notifications_enabled, next_enabled);
      if (next_enabled) {
        await rpc.request(messages.notifications_request_permission);
      }
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

  async function add_sender() {
    const input = sender_input.trim();
    if (!input) return;
    if (allowed_senders.includes(input)) {
      set_sender_input("");
      return;
    }
    const next = [...allowed_senders, input];
    set_sender_input("");
    await update_pref(pref_keys.notifications_allowed_senders, next);
  }

  async function remove_sender(s: string) {
    const next = allowed_senders.filter((x) => x !== s);
    await update_pref(pref_keys.notifications_allowed_senders, next);
  }

  const sub_disabled = !enabled;

  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-text-primary mb-4">Notifications</h2>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">System notification access</p>
            <p className="text-xs text-text-secondary mt-0.5">Allow WorkBound in your system settings before email alerts can appear.</p>
          </div>
          <button
            onClick={open_notification_settings}
            disabled={is_opening_settings}
            className="px-3 py-1.5 text-sm font-medium text-text-primary border border-gray-300 rounded-md transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            {is_opening_settings ? "Opening" : "Open settings"}
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Email notifications</p>
            <p className="text-xs text-text-secondary mt-0.5">When enabled, WorkBound sends alerts for new emails.</p>
          </div>
          <button
            onClick={toggle_notifications}
            disabled={is_toggling}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
              enabled ? "bg-blue-600" : "bg-gray-300"
            } ${is_toggling ? "opacity-60" : ""}`}>
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Test notification</p>
            <p className="text-xs text-text-secondary mt-0.5">Send a sample alert to check your system notification setup.</p>
          </div>
          <button
            onClick={send_test_notification}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md transition-colors hover:bg-blue-100">
            Send test
          </button>
        </div>

        <div className={`flex items-center justify-between py-3 ${sub_disabled ? "opacity-40" : ""}`}>
          <div>
            <p className="text-sm font-medium text-text-primary">Only important emails</p>
            <p className="text-xs text-text-secondary mt-0.5">Only alert for emails marked important.</p>
          </div>
          <button
            onClick={() => { if (!sub_disabled) update_pref(pref_keys.notifications_important_only, !important_only); }}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
              important_only && enabled ? "bg-blue-600" : "bg-gray-300"
            } ${sub_disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                important_only ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className={`py-3 ${sub_disabled ? "opacity-40" : ""}`}>
          <p className="text-sm font-medium text-text-primary mb-1">Allowed senders</p>
          <p className="text-xs text-text-secondary mb-3">
            Add addresses or domains you always want to be notified about. Important or not - emails from these senders will always hit your notification box.
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={sender_input}
              onChange={(e) => set_sender_input(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add_sender(); }}
              placeholder="email@example.com or @domain.com"
              disabled={sub_disabled}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={add_sender}
              disabled={!sender_input.trim() || sub_disabled}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={18} />
            </button>
          </div>

          {allowed_senders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allowed_senders.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                  {s}
                  <button
                    onClick={() => { if (!sub_disabled) remove_sender(s); }}
                    className={`transition-colors ${sub_disabled ? "cursor-not-allowed" : "hover:text-blue-900"}`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
