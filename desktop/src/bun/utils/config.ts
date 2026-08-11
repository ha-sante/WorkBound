import { get_raw_db } from "../db/client";
import { workbound_config } from "../../shared/config";
import { get_secret, set_secret, delete_secret } from "./secrets";
import { logger } from "./logger";
import { error_message } from "../../shared/errors";

const workbound_proxy_base_url = workbound_config.WORKBOUND_PROXY_BASE_URL;
const workbound_proxy_api_key = workbound_config.WORKBOUND_PROXY_API_KEY;

const SECRET_CONFIG_KEYS = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"] as const;
const secret_config_cache = new Map<string, string>();

const secret_config_name = (key: string): string => `config:${key}`;
const is_secret_config_key = (key: string): boolean => (SECRET_CONFIG_KEYS as readonly string[]).includes(key);

export type ConfigMeta = {
  key: string;
  description: string;
  defaultValue: string;
  sensitive: boolean;
};

export type ConfigEntry = {
  key: string;
  value: string;
  displayValue: string;
  source: "override" | "env" | "default";
  meta: ConfigMeta;
};

const CONFIG_META: ConfigMeta[] = [
  { key: "GOOGLE_OAUTH_CLIENT_ID", description: "Google OAuth Client ID", defaultValue: "", sensitive: false },
  { key: "GOOGLE_OAUTH_CLIENT_SECRET", description: "Google OAuth Client Secret", defaultValue: "", sensitive: true },
  { key: "GOOGLE_OAUTH_CALLBACK_PORT", description: "OAuth callback server port", defaultValue: "0", sensitive: false },
  { key: "WORKBOUND_PROXY_BASE_URL", description: "Proxy base URL", defaultValue: workbound_proxy_base_url, sensitive: false },
  { key: "WORKBOUND_PROXY_API_KEY", description: "Proxy API key", defaultValue: workbound_proxy_api_key, sensitive: true },
  { key: "CACHE_MAIL_BODY", description: "Cache email bodies in DB", defaultValue: workbound_config.CACHE_MAIL_BODY, sensitive: false },
  { key: "CACHE_RETENTION_MS", description: "Email cache TTL / retention (ms)", defaultValue: workbound_config.CACHE_RETENTION_MS, sensitive: false },
  { key: "CACHE_EVICTION_INTERVAL_MS", description: "Cache eviction interval (ms)", defaultValue: workbound_config.CACHE_EVICTION_INTERVAL_MS, sensitive: false },
  { key: "CACHE_MAIL_ATTACHMENTS_METADATA", description: "Cache attachment metadata/details", defaultValue: workbound_config.CACHE_MAIL_ATTACHMENTS_METADATA, sensitive: false },
  { key: "GMAIL_MAIL_POLL_INTERVAL", description: "Mail poll interval (ms)", defaultValue: workbound_config.GMAIL_MAIL_POLL_INTERVAL, sensitive: false },
  { key: "GMAIL_ALIAS_POLL_INTERVAL", description: "Alias sync interval (ms)", defaultValue: workbound_config.GMAIL_ALIAS_POLL_INTERVAL, sensitive: false },
  { key: "GMAIL_CONTACTS_POLL_INTERVAL", description: "Contact photo backfill interval (ms)", defaultValue: workbound_config.GMAIL_CONTACTS_POLL_INTERVAL, sensitive: false },
  { key: "DB_VACUUM_THRESHOLD", description: "Auto-vacuum threshold (MB)", defaultValue: workbound_config.DB_VACUUM_THRESHOLD, sensitive: false },
];

const metaMap = new Map(CONFIG_META.map((m) => [m.key, m]));
const CREDENTIALS_CHANGE_WINDOW_MS = 2 * 60 * 60 * 1000;
let config_changed_at = 0;

export function flag_credentials_changed() { config_changed_at = Date.now(); }
export function consume_credentials_changed_flag(): boolean {
  const elapsed = Date.now() - config_changed_at;
  config_changed_at = 0;
  return elapsed >= 0 && elapsed <= CREDENTIALS_CHANGE_WINDOW_MS;
}
const mask = (v: string): string => v.length <= 8 ? "****" : v.slice(0, 4) + "****" + v.slice(-4);

export function get_config(key: string): string {
  if (is_secret_config_key(key)) return secret_config_cache.get(key) ?? metaMap.get(key)?.defaultValue ?? "";
  const row = get_raw_db().prepare("SELECT value FROM app_config_overrides WHERE key = ?").get(key) as { value: string } | undefined;
  if (row) return row.value;
  const meta = metaMap.get(key);
  return meta?.defaultValue ?? "";
}

export async function set_config(key: string, value: string): Promise<void> {
  if (is_secret_config_key(key)) {
    secret_config_cache.set(key, value);
    await set_secret(secret_config_name(key), value);
    flag_credentials_changed();
    return;
  }
  get_raw_db().prepare("INSERT OR REPLACE INTO app_config_overrides (key, value) VALUES (?, ?)").run(key, value);
}

export async function delete_config(key: string): Promise<void> {
  if (is_secret_config_key(key)) {
    secret_config_cache.delete(key);
    await delete_secret(secret_config_name(key));
    return;
  }
  get_raw_db().prepare("DELETE FROM app_config_overrides WHERE key = ?").run(key);
}

export async function hydrate_config_secrets(): Promise<void> {
  for (const key of SECRET_CONFIG_KEYS) {
    try {
      const value = await get_secret(secret_config_name(key));
      if (value !== null && value !== "" && !secret_config_cache.has(key)) secret_config_cache.set(key, value);
    } catch (e) {
      logger.warn("config", `secret hydrate failed for ${key}: ${error_message(e)}`);
    }
  }
}

export function get_all_configs(): ConfigEntry[] {
  const overrides = new Map(
    (get_raw_db().prepare("SELECT key, value FROM app_config_overrides").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  );
  for (const key of SECRET_CONFIG_KEYS) {
    const v = secret_config_cache.get(key);
    if (v !== undefined) overrides.set(key, v);
  }
  return CONFIG_META.map((meta) => {
    const has = overrides.has(meta.key);
    const value = has ? overrides.get(meta.key)! : meta.defaultValue;
    const source = has ? "override" : "default";
    const displayValue = meta.sensitive && value ? mask(value) : value;
    return { key: meta.key, value, displayValue, source, meta };
  });
}
