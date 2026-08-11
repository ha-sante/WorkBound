import { generateText, Output } from "ai";
import { z } from "zod";
import { get_pref, set_pref, delete_pref } from "../db/preferences";
import { get_provider, get_model_capabilities, resolve_model } from "./providers";
import { get_secret, set_secret, delete_secret } from "../utils/secrets";
import { error_message } from "../../shared/errors";

const PREF_KEY = "intelligence:ai_connection";
const API_KEY_NAME = "intelligence:ai_connection";

export type IntelligenceConnectionInput = {
  path: "direct" | "gateway" | "custom";
  provider: string;
  model: string;
  endpoint?: string;
  apiKey?: string;
};

export type IntelligenceConnectionStored = {
  path: "direct" | "gateway" | "custom";
  provider: string;
  model: string;
  endpoint: string;
  apiKey?: string;
  capabilities: {
    imageInput: boolean;
    objectGeneration: boolean;
    toolUsage: boolean;
    toolStreaming: boolean;
  };
  lastTestedAt: string | null;
  lastError: string | null;
};

const EMPTY_CAPS = { imageInput: false, objectGeneration: true, toolUsage: true, toolStreaming: true };

export function normalize_connection(input: IntelligenceConnectionInput): IntelligenceConnectionStored {
  const provider = get_provider(input.provider);
  const caps = input.path === "direct"
    ? (get_model_capabilities(input.provider, input.model) ?? EMPTY_CAPS)
    : EMPTY_CAPS;

  return {
    path: input.path,
    provider: input.provider,
    model: input.model,
    endpoint: (input.endpoint ?? provider?.defaultEndpoint ?? "").trim(),
    apiKey: input.apiKey ?? undefined,
    capabilities: caps,
    lastTestedAt: null,
    lastError: null,
  };
}

export async function get_connection(): Promise<IntelligenceConnectionStored | null> {
  const raw = get_pref(PREF_KEY);
  if (!raw || typeof raw !== "object") return null;
  const conn = raw as unknown as IntelligenceConnectionStored;
  return { ...conn, apiKey: (await get_secret(API_KEY_NAME)) ?? undefined };
}

export async function save_connection(input: IntelligenceConnectionInput): Promise<IntelligenceConnectionStored> {
  const conn = normalize_connection(input);
  if (input.apiKey) await set_secret(API_KEY_NAME, input.apiKey);
  const { apiKey, ...stored } = conn;
  set_pref(PREF_KEY, stored as unknown as Record<string, unknown>);
  return { ...stored, apiKey: (await get_secret(API_KEY_NAME)) ?? undefined };
}

export const delete_connection = async () => {
  delete_pref(PREF_KEY);
  await delete_secret(API_KEY_NAME);
};

export type ConnectionProbe = { ok: boolean; error?: string };
export type ConnectionTestResult = {
  auth: ConnectionProbe;
  model: ConnectionProbe;
  structuredOutput: ConnectionProbe;
  lastTestedAt: string;
};

export async function test_connection(input: IntelligenceConnectionInput): Promise<ConnectionTestResult> {
  const conn = normalize_connection({ ...input, apiKey: input.apiKey || (await get_secret(API_KEY_NAME)) || undefined });
  const probe = (ok: boolean, error?: string): ConnectionProbe => ({ ok, error: error || undefined });

  let auth: ConnectionProbe = probe(false);
  let model: ConnectionProbe = probe(false);
  let structuredOutput: ConnectionProbe = probe(false);

  try {
    const language_model = resolve_model({
      path: conn.path,
      provider: conn.provider,
      model: conn.model,
      endpoint: conn.endpoint,
      apiKey: conn.apiKey,
    });

    auth = probe(true);

    try {
      const result = await generateText({
        model: language_model,
        output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
        prompt: "Reply with ok=true.",
        maxOutputTokens: 512,
      });
      const parsed = await result.output;
      model = probe(true);
      if (parsed && typeof parsed.ok === "boolean") {
        structuredOutput = probe(true);
      } else {
        structuredOutput = probe(false, "Model returned an unexpected shape");
      }
    } catch (e) {
      model = probe(false, error_message(e));
    }
  } catch (e) {
    auth = probe(false, error_message(e));
  }

  return { auth, model, structuredOutput, lastTestedAt: new Date().toISOString() };
}
