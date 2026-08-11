import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { prefsAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";

export function PreferencesPanel() {
  const prefs = useAtomValue(prefsAtom);
  const setPrefs = useSetAtom(prefsAtom);
  const [setupStatus, setSetupStatus] = useState<AppSetupStatusWire | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const autoStartup = (prefs["general:autoStartup"] as boolean) ?? false;
  const quitAction = (prefs["tray:quitAction"] as "quit" | "hide") ?? "hide";

  async function update_pref(key: string, value: unknown) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    try {
      await rpc.request(messages.prefs_set, { key, value });
    } catch { console.warn("preferences_panel: failed to fetch config"); }
  }

  const refresh_setup = async () => {
    try {
      const s = await rpc.request(messages.app_setup_get_status);
      setSetupStatus(s);
    } catch {}
  };

  useEffect(() => { 
    refresh_setup();
  }, []);

  const run_setup = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await refresh_setup();
    } catch {
      await refresh_setup();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-text-primary mb-4">Preferences</h2>

      <div className="space-y-1">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Launch at login</p>
            <p className="text-xs text-text-secondary mt-0.5">Automatically start WorkBound when you log in</p>
          </div>
          <button
            onClick={() => update_pref("general:autoStartup", !autoStartup)}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
              autoStartup ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                autoStartup ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Quit to tray</p>
            <p className="text-xs text-text-secondary mt-0.5">Keep WorkBound running in the background when closed</p>
          </div>
          <button
            onClick={() =>
              update_pref(
                "tray:quitAction",
                quitAction === "quit" ? "hide" : "quit"
              )
            }
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
              quitAction === "hide" ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                quitAction === "hide" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {setupStatus && (
        <div className="pt-3 mt-3 border-t border-border-subtle space-y-1">
          <p className="text-sm font-medium text-text-primary pb-1">Setup</p>

          {setupStatus.rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">{row.title}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {row.description}{" "}
                  {row.guide_url && (
                    <a
                      href={row.guide_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      See Guide
                    </a>
                  )}
                </p>
              </div>
              {row.done ? (
                <span className="px-3 py-1.5 text-xs rounded-md bg-black/5 text-text-secondary opacity-50 shrink-0">
                  {row.done_label}
                </span>
              ) : (
                <button
                  onClick={() =>
                    run_setup(row.key, () => {
                      switch (row.key) {
                        case "move":
                          return rpc.request(messages.app_setup_move_to_applications);
                        case "launcher":
                          return rpc.request(messages.app_setup_add_launcher);
                        case "mail_handler":
                          return rpc.request(messages.app_setup_set_default_mail_handler, {});
                      }
                    })
                  }
                  disabled={busy !== null}
                  className="px-3 py-1.5 text-xs rounded-md bg-black/5 hover:bg-black/10 text-text-primary transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {busy === row.key ? "Working..." : row.action_label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
