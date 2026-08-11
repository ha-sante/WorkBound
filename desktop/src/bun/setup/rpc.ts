import { defineElectrobunRPC, Updater } from "electrobun/bun";
import { handlers, set_rpc, rpc_send } from "../rpc";
import { logger } from "../utils/logger";
import { set_engine_rpc } from "../sync/engine";
import { set_outbox_rpc } from "../outbox/rpc_ref";
import { get_account } from "../db/accounts";
import { appEvents } from "../utils/events";
import type { WorkBoundRPCSchema } from "../../shared/rpc_schema";
import { messages } from "../../shared/rpc_messages";
import { get_pref, set_pref, type PrefValue } from "../db/preferences";
import { set_auto_startup } from "../utils/platform";

export function setup_rpc(getWin: () => any, setQuitAction: (v: "quit" | "hide") => void) {
	logger.info("app", "setup:rpc");
  const bunRPC = defineElectrobunRPC<WorkBoundRPCSchema, "bun">("bun", {
    handlers: {
      requests: {
        ...(handlers as any),
        toggleZoom: async () => {
          const w = getWin();
          if (w.isMaximized()) {
            w.unmaximize();
          } else {
            w.maximize();
          }
          return { success: true };
        },
        "window:setTrafficLights": async (params: { visible: boolean }) => {
          const w = getWin();
          if (params.visible) {
            w.setWindowButtonPosition(12, 12);
          } else {
            w.setWindowButtonPosition(-1000, -1000);
          }
          return { success: true };
        },
        "prefs:get": async ({ key }: { key: string }) => {
          const val = get_pref(key);
          logger.info("prefs", `get ${key} → ${JSON.stringify(val).slice(0, 200)}`);
          return { value: val };
        },
        "prefs:set": async ({ key, value }: { key: string; value: unknown }) => {
          logger.info("prefs", `set ${key} = ${JSON.stringify(value).slice(0, 200)}`);
          set_pref(key, value as PrefValue);
          if (key === "tray:quitAction") {
            setQuitAction(value as "quit" | "hide");
          }
          if (key === "general:autoStartup") {
            set_auto_startup(Boolean(value));
          }
          return { success: true };
        },
        "prefs:getAll": async () => {
          const { get_all_prefs } = await import("../db/preferences");
          return { prefs: get_all_prefs() };
        },
      },
    },
  });

  set_rpc(bunRPC as { send: MessageSend });
  set_engine_rpc(bunRPC as { send: MessageSend });
  set_outbox_rpc(bunRPC as { send: MessageSend });

  Updater.onStatusChange((entry) => {
    rpc_send(messages.updates_status, entry);
  });

  appEvents.on("invalid_grant", (account_id: string, reason: string) => {
    const account = get_account(account_id);
    logger.info("auth", `invalid_grant for account ${account_id} reason=${reason}`);
    // Map the string reason to the expected type: "credentials_changed" | "unknown"
    // Default to "unknown" if not recognized
    const mappedReason = reason === "credentials_changed" ? "credentials_changed" : "unknown";
    bunRPC.send("auth:invalid_grant", { account_id, email: account?.email ?? "", reason: mappedReason });
  });

  return bunRPC;
}
