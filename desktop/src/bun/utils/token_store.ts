import { get_secret, set_secret, delete_secret } from "./secrets";

export type StoredTokens = {
  access_token: string | null;
  refresh_token: string | null;
};

const secret_name = (account_id: string): string => `gmail:${account_id}`;

function parse(value: string | null): StoredTokens | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredTokens;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      access_token: parsed.access_token ?? null,
      refresh_token: parsed.refresh_token ?? null,
    };
  } catch {
    return null;
  }
}

export async function get_tokens(account_id: string): Promise<StoredTokens | null> {
  const value = await get_secret(secret_name(account_id));
  return parse(value);
}

export async function set_tokens(account_id: string, tokens: StoredTokens): Promise<boolean> {
  if (!tokens.access_token && !tokens.refresh_token) return false;
  return await set_secret(secret_name(account_id), JSON.stringify(tokens));
}

export async function delete_tokens(account_id: string): Promise<void> {
  await delete_secret(secret_name(account_id));
}
