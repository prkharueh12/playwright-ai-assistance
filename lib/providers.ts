import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: string): value is ProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/** Default model per provider. Keep this the single source of truth so
 * bumping a model later is a one-line change. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-3.1-flash-lite",
};

/** Human-readable labels for the provider selector UI. */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
};

/**
 * Builds a Language Model instance for the given provider using the caller's
 * own API key (BYOK — never a server-side key, never persisted or logged).
 */
export function getModel(provider: ProviderId, apiKey: string): LanguageModel {
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(DEFAULT_MODELS.openai);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(DEFAULT_MODELS.anthropic);
    }
    case "google": {
      const google = createGoogle({ apiKey });
      return google(DEFAULT_MODELS.google);
    }
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}
