import { insert_account, update_account, update_backfill_total_messages, get_account, get_account_by_email } from "../../db/accounts";
import { replace_all_send_as_aliases } from "../../db/send_as";
import { logger } from "../../utils/logger";
import { error_message } from "../../../shared/errors";
import { set_tokens, get_tokens } from "../../utils/token_store";
import { GmailAuthError, InvalidGrantError } from "./utils";
import { fetch_send_as_list, type SendAsAlias } from "./api";
import { get_config, consume_credentials_changed_flag } from "../../utils/config";
import { appEvents } from "../../utils/events";
import { Utils } from "electrobun/bun";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/contacts.readonly",
];

type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
};

type OAuthCallback = {
  code?: string;
  session?: string;
};

type AuthAccountResult = {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  provider: string;
};

type PendingOAuth = {
  mode: "self" | "shared";
  port: number;
  waitForCallback: Promise<OAuthCallback>;
  url: string;
  code_verifier?: string;
  state?: string;
};

let currentOAuth: PendingOAuth | null = null;
let currentOAuthAbort: AbortController | null = null;

const base64url_encode = (buf: Uint8Array): string => btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random_token = (): string => base64url_encode(crypto.getRandomValues(new Uint8Array(32)));

const to_code_challenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url_encode(new Uint8Array(digest));
};

const get_client_id = (): string => get_config("GOOGLE_OAUTH_CLIENT_ID");
const get_client_secret = (): string => get_config("GOOGLE_OAUTH_CLIENT_SECRET");
const is_shared_auth = (): boolean => !get_config("GOOGLE_OAUTH_CLIENT_SECRET") && !!get_config("WORKBOUND_PROXY_BASE_URL");

async function build_auth_url(port: number, code_verifier: string, state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: get_client_id(),
    redirect_uri: `http://127.0.0.1:${port}/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: await to_code_challenge(code_verifier),
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchange_code(code: string, port: number, code_verifier: string) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: get_client_id(),
      client_secret: get_client_secret(),
      redirect_uri: `http://127.0.0.1:${port}/callback`,
      grant_type: "authorization_code",
      code_verifier,
    }),
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${await resp.text()}`);
  return resp.json() as Promise<OAuthTokens>;
}

async function get_user_info(access_token: string) {
  const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!resp.ok) throw new Error(`Failed to get user info: ${await resp.text()}`);
  return resp.json() as Promise<GmailUserInfo>;
}

function create_oauth_server(signal: AbortSignal, expected_state: string | null): {
  port: number;
  waitForCallback: Promise<OAuthCallback>;
} {
  let resolveCallback: (v: OAuthCallback) => void;
  let rejectCallback: (err: Error) => void;
  const callbackPromise = new Promise<OAuthCallback>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const desiredPort = parseInt(get_config("GOOGLE_OAUTH_CALLBACK_PORT") || "0", 10);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: desiredPort || 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }
      const error = url.searchParams.get("error");
      if (error) {
        server.stop();
        rejectCallback(new Error(`OAuth error: ${error}`));
        return new Response("Authorization failed.", { status: 400 });
      }
      const code = url.searchParams.get("code");
      const session = url.searchParams.get("session");
      if (!code && !session) {
        server.stop();
        rejectCallback(new Error("No code or session received"));
        return new Response("No code or session received.", { status: 400 });
      }
      if (expected_state && url.searchParams.get("state") !== expected_state) {
        server.stop();
        rejectCallback(new Error("State mismatch"));
        return new Response("State mismatch.", { status: 400 });
      }
      server.stop();
      resolveCallback({ code: code ?? undefined, session: session ?? undefined });
      return new Response("Authorized! You can close this tab.", {
        headers: { "Content-Type": "text/html" },
      });
    },
    error(err) {
      server.stop();
      rejectCallback(err);
    },
  });

  signal.addEventListener("abort", () => {
    server.stop();
    rejectCallback(new Error("OAuth cancelled"));
  });

  logger.file("gmail").info("OAuth callback server listening on 127.0.0.1:" + server.port);
  return { port: server.port as number, waitForCallback: callbackPromise };
}

async function sync_send_as_aliases(account_id: string, access_token: string): Promise<void> {
  try {
    const sendAs = await fetch_send_as_list(access_token);
    const dbAliases = sendAs.map((a: SendAsAlias) => ({
      id: crypto.randomUUID(),
      account_id,
      send_as_email: a.send_as_email,
      display_name: a.display_name ?? null,
      reply_to_address: a.reply_to_address ?? null,
      signature: a.signature ?? null,
      is_primary: a.is_primary ? 1 : 0,
      is_default: a.is_default ? 1 : 0,
      treat_as_alias: a.treat_as_alias ? 1 : 0,
      smtp_msa_host: null,
      smtp_msa_port: null,
      smtp_msa_security_mode: null,
      verification_status: a.verification_status ?? null,
      created_at: new Date().toISOString(),
    }));
    replace_all_send_as_aliases(account_id, dbAliases);
    logger.info("auth", `synced ${dbAliases.length} send-as aliases`);
  } catch (e) {
    logger.warn("auth", `send-as alias sync failed: ${error_message(e)}`);
  }
}

async function finish_auth(
  id: string,
  tokens: OAuthTokens,
  user: GmailUserInfo,
) : Promise<string> {
  // Resolve the persisted account ID by email first.
  // If we store tokens under a temporary OAuth UUID and then switch to the
  // existing account, sync can later report "No stored credentials".
  const existing = get_account_by_email(user.email);
  const account_id = existing?.id ?? id;

  const stored = await set_tokens(account_id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
  });
  if (!stored) {
    throw new Error("Failed to store credentials securely. Check your system keychain and try again.");
  }

  if (existing) {
    update_account(account_id, {
      name: user.name ?? null,
      avatar_url: user.picture ?? null,
      has_credentials: 1,
      is_active: 1,
    });
  } else {
    insert_account({
      id: account_id,
      provider: "gmail",
      email: user.email,
      name: user.name ?? null,
      avatar_url: user.picture ?? null,
      has_credentials: 1,
      is_active: 1,
      created_at: new Date().toISOString(),
    });
  }

  try {
    const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (resp.ok) {
      const profile = (await resp.json()) as { messagesTotal: number };
      update_backfill_total_messages(account_id, profile.messagesTotal);
      logger.info("auth", `profile: totalMessages=${profile.messagesTotal}`);
    } else {
      logger.warn("auth", `profile fetch failed: ${resp.status}`);
    }
  } catch {
    logger.warn("auth", "profile fetch threw");
  }

  await sync_send_as_aliases(account_id, tokens.access_token);

  return account_id;
}

async function complete_auth(tokens: OAuthTokens, user: GmailUserInfo): Promise<AuthAccountResult> {
  const id = crypto.randomUUID();
  const account_id = await finish_auth(id, tokens, user);
  return { id: account_id, email: user.email, name: user.name ?? null, avatar_url: user.picture ?? null, provider: "gmail" };
}

export function cancel_gmail_oauth(): void {
  currentOAuthAbort?.abort();
  currentOAuthAbort = null;
  currentOAuth = null;
}

export function has_pending_oauth(): boolean {
  return currentOAuth !== null;
}

export async function prepare_gmail_oauth(): Promise<OAuthPrepareWire> {
  cancel_gmail_oauth();
  const abort = new AbortController();
  currentOAuthAbort = abort;
  const shared = is_shared_auth();
  const code_verifier = shared ? null : random_token();
  const state = shared ? null : random_token();
  const { port, waitForCallback } = create_oauth_server(abort.signal, state);
  const url = shared
    ? `${get_config("WORKBOUND_PROXY_BASE_URL")}/auth/google?port=${port}`
    : await build_auth_url(port, code_verifier!, state!);
  currentOAuth = { mode: shared ? "shared" : "self", port, waitForCallback, url, code_verifier: code_verifier ?? undefined, state: state ?? undefined };
  logger.info("auth", "prepare_gmail_oauth ready");
  return { url };
}

export async function launch_gmail_oauth(skip_open = false): Promise<AuthAccountResult> {
  const pending = currentOAuth;
  if (!pending) throw new Error("No pending OAuth flow. Restart login and try again.");

  if (!skip_open) {
    Utils.openExternal(pending.url);
    logger.info("auth", "launch_gmail_oauth browser=default");
  }

  const { code, session } = await pending.waitForCallback;
  if (pending.mode === "shared") {
    if (!session) throw new Error("No session received from auth callback");
    const proxyBase = get_config("WORKBOUND_PROXY_BASE_URL");
    const sessionResp = await fetch(`${proxyBase}/auth/session/${session}`);
    if (!sessionResp.ok) throw new Error(`Session exchange failed: ${await sessionResp.text()}`);
    const tokens = await sessionResp.json() as OAuthTokens;
    const user = await get_user_info(tokens.access_token);
    return complete_auth(tokens, user);
  }
  if (!code) throw new Error("No code received from auth callback");
  const tokens = await exchange_code(code, pending.port, pending.code_verifier ?? "");
  const user = await get_user_info(tokens.access_token);
  return complete_auth(tokens, user);
}

export async function start_gmail_oauth(_signal?: AbortSignal): Promise<AuthAccountResult> {
  await prepare_gmail_oauth();
  return launch_gmail_oauth();
}

export async function start_gmail_oauth_shared(_signal?: AbortSignal): Promise<AuthAccountResult> {
  if (!is_shared_auth()) throw new Error("WORKBOUND_PROXY_BASE_URL is not configured");
  await prepare_gmail_oauth();
  return launch_gmail_oauth();
}

export async function reconnect_gmail_oauth(account_id: string, signal?: AbortSignal): Promise<AuthAccountResult> {
  const abortSignal = signal ?? new AbortController().signal;
  const code_verifier = random_token();
  const state = random_token();
  const { port, waitForCallback } = create_oauth_server(abortSignal, state);
  const url = await build_auth_url(port, code_verifier, state);
  Utils.openExternal(url);

  const { code } = await waitForCallback;
  if (!code) throw new Error("No code received from auth callback");
  const tokens = await exchange_code(code, port, code_verifier);
  const user = await get_user_info(tokens.access_token);

  const stored = await set_tokens(account_id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
  });
  if (!stored) throw new Error("Failed to store credentials securely. Check your system keychain and try again.");

  update_account(account_id, {
    has_credentials: 1,
    name: user.name ?? null,
    avatar_url: user.picture ?? null,
  });

  await sync_send_as_aliases(account_id, tokens.access_token);
  return { id: account_id, email: user.email, name: user.name ?? null, avatar_url: user.picture ?? null, provider: "gmail" };
}

export async function reconnect_gmail_oauth_shared(account_id: string, signal?: AbortSignal): Promise<AuthAccountResult> {
  const proxyBase = get_config("WORKBOUND_PROXY_BASE_URL");
  if (!proxyBase) throw new Error("WORKBOUND_PROXY_BASE_URL is not configured");

  const abortSignal = signal ?? new AbortController().signal;
  const { port, waitForCallback } = create_oauth_server(abortSignal, null);
  const url = `${proxyBase}/auth/google?port=${port}`;
  Utils.openExternal(url);

  const { session } = await waitForCallback;
  if (!session) throw new Error("No session received from auth callback");

  const sessionResp = await fetch(`${proxyBase}/auth/session/${session}`);
  if (!sessionResp.ok) throw new Error(`Session exchange failed: ${await sessionResp.text()}`);

  const tokens = await sessionResp.json() as OAuthTokens;
  const user = await get_user_info(tokens.access_token);

  const stored = await set_tokens(account_id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
  });
  if (!stored) throw new Error("Failed to store credentials securely. Check your system keychain and try again.");

  update_account(account_id, {
    has_credentials: 1,
    name: user.name ?? null,
    avatar_url: user.picture ?? null,
  });

  await sync_send_as_aliases(account_id, tokens.access_token);
  return { id: account_id, email: user.email, name: user.name ?? null, avatar_url: user.picture ?? null, provider: "gmail" };
}

export async function withGmailAuth<T>(
  account_id: string,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const account = get_account(account_id);
  if (!account?.has_credentials) throw new Error("No stored credentials. Reconnect in Settings.");

  const tokens = await get_tokens(account_id);
  if (!tokens?.access_token) throw new Error("No access token available");

  try {
    return await fn(tokens.access_token);
  } catch (err) {
    if (err instanceof GmailAuthError && tokens.refresh_token) {
      logger.info("gmail", `refreshing token for account ${account_id}`);
      try {
        const newToken = await refresh_access_token(tokens.refresh_token);
        await set_tokens(account_id, { access_token: newToken, refresh_token: tokens.refresh_token });
        return await fn(newToken);
      } catch (refreshErr) {
        if (refreshErr instanceof InvalidGrantError) {
          const reason = consume_credentials_changed_flag() ? "credentials_changed" : "unknown";
          appEvents.emit("invalid_grant", account_id, reason);
        }
        throw refreshErr;
      }
    }
    throw err;
  }
}

export async function refresh_access_token(refresh_token: string): Promise<string> {
  if (is_shared_auth()) {
    const proxyBase = get_config("WORKBOUND_PROXY_BASE_URL");
    const resp = await fetch(`${proxyBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh_token }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      if (body.includes("invalid_grant")) throw new InvalidGrantError();
      throw new Error(`Token refresh via proxy failed: ${body}`);
    }
    const data = (await resp.json()) as { access_token: string };
    return data.access_token;
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh_token,
      client_id: get_client_id(),
      client_secret: get_client_secret(),
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (body.includes("invalid_grant")) throw new InvalidGrantError();
    throw new Error(`Token refresh failed: ${body}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}
