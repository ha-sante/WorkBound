import { useAtomValue, useSetAtom } from "jotai";
import { Monitor } from "lucide-react";
import { prefsAtom } from "../../state";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";
import { pref_keys } from "@/shared/pref_keys";
import { Select } from "../ui/select";

type LabelRenderFormat = "iconOnly" | "textOnly" | "textAndIcon";

export function InterfacePanel() {
  const prefs = useAtomValue(prefsAtom);
  const setPrefs = useSetAtom(prefsAtom);

  const show_labels =
    (prefs[pref_keys.interface_show_labels] as boolean | undefined) ?? true;

  const label_render_format =
    (prefs[pref_keys.interface_label_render_format] as
      LabelRenderFormat | undefined) ?? "textOnly";

  async function set_label_render_format(next: LabelRenderFormat) {
    setPrefs((prev) => ({
      ...prev,
      [pref_keys.interface_label_render_format]: next,
    }));
    try {
      await rpc.request(messages.prefs_set, {
        key: pref_keys.interface_label_render_format,
        value: next,
      });
    } catch {
      console.warn("interface_panel: failed to update label render format");
    }
  }

  async function set_show_labels(next: boolean) {
    setPrefs((prev) => ({ ...prev, [pref_keys.interface_show_labels]: next }));
    try {
      await rpc.request(messages.prefs_set, {
        key: pref_keys.interface_show_labels,
        value: next,
      });
    } catch {
      console.warn("interface_panel: failed to update pref");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Monitor size={20} className="text-text-primary" />
        <h2 className="text-lg font-medium text-text-primary">Interface</h2>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Show Labels</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Render labels inside the email list row.
          </p>
        </div>
        <button
          onClick={() => set_show_labels(!show_labels)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
            show_labels ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              show_labels ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            Label Rendering
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Choose how label chips should appear in the email list.
          </p>
        </div>
        <Select
          value={label_render_format}
          onChange={(e) =>
            set_label_render_format(e.target.value as LabelRenderFormat)
          }
          disabled={!show_labels}
          full_width={false}
          className="disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="textOnly">Text only</option>
          <option value="iconOnly">Icon only</option>
          <option value="textAndIcon">Text + Icon</option>
        </Select>
      </div>
    </div>
  );
}
