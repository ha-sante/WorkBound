import { Updater } from "electrobun/bun";
import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { rpc_send } from "../index";

export default {
  [messages.updates_get_status]: async (): Promise<UpdateGetStatusWire> => {
    logger.info("rpc", "updates:get_status");
    const local = await Updater.getLocalInfo();
    const history = Updater.getStatusHistory();
    const status = history.length > 0 ? history[history.length - 1] : null;
    const info = Updater.updateInfo();
    return {
      local,
      status,
      updateReady: info?.updateReady ?? false,
      latestHash: info?.hash ?? "",
      latestVersion: info?.version ?? "",
    };
  },

  [messages.updates_check]: async (): Promise<UpdateCheckResultWire> => {
    logger.info("rpc", "updates:check");
    return Updater.checkForUpdate();
  },

  [messages.updates_download]: async () => {
    logger.info("rpc", "updates:download");
    // Fire-and-forget: progress is streamed to the UI via updates:status push
    // messages. Don't await here — large bundles can exceed the client RPC timeout.
    Updater.downloadUpdate().catch((e) => {
      logger.warn("rpc", `updates:download failed: ${e}`);
      rpc_send(messages.updates_status, {
        status: "error",
        message: `Download failed: ${e}`,
        timestamp: Date.now(),
      });
    });
    return { success: true };
  },

  [messages.updates_install]: async () => {
    logger.info("rpc", "updates:install");
    try {
      await Updater.applyUpdate();
      return { success: true };
    } catch (e) {
      logger.warn("rpc", `updates:install failed: ${e}`);
      return { success: false, error: String(e) };
    }
  },
};
