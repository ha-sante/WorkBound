// Intelligence AI provider registry — mirrors the Vercel AI SDK provider list,
// filtered to models that support Object Generation (structured output).

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type RuntimeConnection = {
  path: "direct" | "gateway" | "custom";
  provider: string;
  model: string;
  endpoint: string;
  apiKey?: string;
};

type ModelCapabilities = {
  imageInput: boolean;
  objectGeneration: boolean;
  toolUsage: boolean;
  toolStreaming: boolean;
};

type RegistryModel = {
  id: string;
  inputTokens?: number;
  capabilities: ModelCapabilities;
};

type RegistryProvider = {
  id: string;
  name: string;
  defaultEndpoint: string;
  models: RegistryModel[];
};

const INPUT_TOKENS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4.1": 1_048_576,
  "gpt-4.1-mini": 1_048_576,
  "gpt-5": 400_000,
  "gpt-5-mini": 400_000,
  "gpt-5.2": 400_000,
  "gpt-5.2-pro": 400_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  "gpt-5.5": 400_000,
  "gpt-5.6": 400_000,
  "claude-sonnet-4-0": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-1": 200_000,
  "claude-opus-4-5": 200_000,
  "claude-opus-4-6": 200_000,
  "claude-opus-4-7": 200_000,
  "claude-opus-4-8": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-5": 1_000_000,
  "gemini-2.5-flash": 1_048_576,
  "gemini-2.5-pro": 1_048_576,
  "gemini-3-pro-preview": 1_048_576,
  "gemini-3.1-pro-preview": 1_048_576,
  "grok-3": 131_072,
  "grok-3-mini": 131_072,
  "grok-4": 131_072,
  "grok-4-fast-reasoning": 131_072,
  "grok-4.5": 1_000_000,
  "meta-llama/llama-4-scout-17b-16e-instruct": 1_000_000,
  "llama-3.3-70b-versatile": 131_072,
  "pixtral-large-latest": 128_000,
  "mistral-large-latest": 128_000,
  "magistral-medium-2506": 128_000,
  "magistral-small-2506": 128_000,
  "mistral-small-latest": 128_000,
  "ministral-8b-latest": 128_000,
  "deepseek-chat": 128_000,
  "deepseek-reasoner": 128_000,
  "kimi-k2-thinking": 128_000,
  "kimi-k2.5": 128_000,
  "kimi-k3": 1_000_000,
};

function model(id: string, imageInput = true, objectGeneration = true, toolUsage = true, toolStreaming = true): RegistryModel {
  return { id, inputTokens: INPUT_TOKENS[id], capabilities: { imageInput, objectGeneration, toolUsage, toolStreaming } };
}

const providers: RegistryProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1",
    models: [
      model("gpt-5.6"), model("gpt-5.6-luna"), model("gpt-5.6-sol"), model("gpt-5.6-terra"),
      model("gpt-5.5"), model("gpt-5.4-mini"), model("gpt-5.4-nano"), model("gpt-5.2-pro"),
      model("gpt-5.2"), model("gpt-5.1"), model("gpt-5.1-codex"), model("gpt-5"), model("gpt-5-mini"),
      model("gpt-4.1"), model("gpt-4.1-mini"), model("gpt-4o"), model("gpt-4o-mini"),
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultEndpoint: "https://api.anthropic.com/v1",
    models: [
      model("claude-sonnet-5"), model("claude-fable-5"), model("claude-opus-4-8"), model("claude-opus-4-7"),
      model("claude-opus-4-6"), model("claude-sonnet-4-6"), model("claude-opus-4-5"), model("claude-sonnet-4-5"),
      model("claude-haiku-4-5"), model("claude-opus-4-1"), model("claude-sonnet-4-0"),
    ],
  },
  {
    id: "google",
    name: "Google",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      model("gemini-3.1-pro-preview"), model("gemini-3-pro-preview"), model("gemini-2.5-pro"), model("gemini-2.5-flash"),
    ],
  },
  {
    id: "xai",
    name: "xAI Grok",
    defaultEndpoint: "https://api.x.ai/v1",
    models: [
      model("grok-4.5"), model("grok-4-fast-reasoning"),
      model("grok-4", false), model("grok-3", false), model("grok-3-mini", false),
    ],
  },
  {
    id: "groq",
    name: "Groq",
    defaultEndpoint: "https://api.groq.com/openai/v1",
    models: [
      model("meta-llama/llama-4-scout-17b-16e-instruct"),
      model("llama-3.3-70b-versatile", false), model("deepseek-r1-distill-llama-70b", false),
      model("qwen-qwq-32b", false), model("openai/gpt-oss-120b", false),
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    defaultEndpoint: "https://api.mistral.ai/v1",
    models: [
      model("pixtral-large-latest"),
      model("mistral-large-latest", false), model("magistral-medium-2506", false),
      model("magistral-small-2506", false), model("mistral-small-latest", false), model("ministral-8b-latest", false),
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultEndpoint: "https://api.deepseek.com",
    models: [
      model("deepseek-chat", false), model("deepseek-reasoner", false),
    ],
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    defaultEndpoint: "https://api.moonshot.ai/v1",
    models: [
      model("kimi-k2.5"), model("kimi-k3"), model("kimi-k2-thinking", false),
    ],
  },
];
export const list_providers = (): RegistryProvider[] => providers;
export const get_provider = (provider_id: string): RegistryProvider | undefined => providers.find((p) => p.id === provider_id);
export const get_models = (provider_id: string): RegistryModel[] => get_provider(provider_id)?.models ?? [];
export const get_model_capabilities = (provider_id: string, model_id: string): ModelCapabilities | null => {
  return get_models(provider_id).find((m) => m.id === model_id)?.capabilities ?? null;
};

export const get_model_input_tokens = (provider_id: string, model_id: string): number => {
  return get_models(provider_id).find((m) => m.id === model_id)?.inputTokens ?? 4000;
};

function build_language_model(conn: RuntimeConnection): LanguageModel {
  if (conn.path !== "direct") {
    const client = createOpenAICompatible({
      name: conn.provider,
      baseURL: conn.endpoint,
      apiKey: conn.apiKey ?? undefined,
    });
    return client(conn.model);
  }

  const settings = { baseURL: conn.endpoint || undefined, apiKey: conn.apiKey ?? undefined };

  switch (conn.provider) {
    case "openai":
      return createOpenAI(settings)(conn.model);
    case "anthropic":
      return createAnthropic(settings)(conn.model);
    case "google":
      return createGoogle(settings)(conn.model);
    case "xai":
      return createXai(settings)(conn.model);
    case "groq":
      return createGroq(settings)(conn.model);
    case "mistral":
      return createMistral(settings)(conn.model);
    case "deepseek":
      return createDeepSeek(settings)(conn.model);
    case "moonshotai":
      return createMoonshotAI(settings)(conn.model);
    default:
      throw new Error(`intelligence: unsupported provider "${conn.provider}"`);
  }
}

export const resolve_model = (conn: RuntimeConnection): LanguageModel => build_language_model(conn);

export type { ModelCapabilities, RegistryModel, RegistryProvider };
