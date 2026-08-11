import { logger } from "./logger";
import { is_dev_build } from "./platform";
import { APP_IDENTIFIER } from "../../shared/app_ident";
import { error_message } from "../../shared/errors";

export const SECRET_SERVICE = is_dev_build() ? `${APP_IDENTIFIER}.dev` : APP_IDENTIFIER;

export async function get_secret(name: string): Promise<string | null> {
  try {
    return await Bun.secrets.get({ service: SECRET_SERVICE, name });
  } catch (e) {
    logger.warn("secrets", `get failed for ${name}: ${error_message(e)}`);
    return null;
  }
}

export async function set_secret(name: string, value: string): Promise<boolean> {
  try {
    await Bun.secrets.set({ service: SECRET_SERVICE, name, value });
    return true;
  } catch (e) {
    logger.warn("secrets", `set failed for ${name}: ${error_message(e)}`);
    return false;
  }
}

export async function delete_secret(name: string): Promise<void> {
  try {
    await Bun.secrets.delete({ service: SECRET_SERVICE, name });
  } catch (e) {
    logger.warn("secrets", `delete failed for ${name}: ${error_message(e)}`);
  }
}
