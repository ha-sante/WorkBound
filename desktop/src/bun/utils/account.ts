import { logger } from "./logger";

export type AccountCheckField = "provider_gmail" | "is_active" | "has_credentials";

type AccountCheckTarget = {
  id: string;
  provider: string;
  is_active: unknown;
  has_credentials: unknown;
};

export function check_account(log_tag: string, account: AccountCheckTarget, fields: AccountCheckField[]): boolean {
  for (const field of fields) {
    if (field === "provider_gmail") {
      if (account.provider !== "gmail") {
        logger.info(log_tag, `skipping ${account.id}: provider is not gmail`);
        return false;
      }
      continue;
    }

    if (field === "is_active") {
      if (!account.is_active) {
        logger.info(log_tag, `skipping ${account.id}: account inactive`);
        return false;
      }
      continue;
    }

    if (field === "has_credentials") {
      if (!account.has_credentials) {
        logger.info(log_tag, `skipping ${account.id}: no stored credentials`);
        return false;
      }
      continue;
    }
  }

  return true;
}
