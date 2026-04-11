import "server-only";

import { getModelById } from "@/lib/ai/models";

// ---------------------------------------------------------------------------
// Qwen / DashScope OpenAI-compatible integration
//
// Active env contract:
//   DASHSCOPE_BASE_URL            <- primary current key
// Legacy fallback aliases (compatibility only):
//   DASHSCOPE_COMPATIBLE_BASE_URL
//   ALIBABA_MODEL_STUDIO_BASE_URL
//
// Default production base URL when no env override is provided:
//   https://dashscope-intl.aliyuncs.com/compatible-mode/v1
//
// The OpenAI-compatible chat/completions endpoint is:
//   {baseUrl}/chat/completions   (e.g. {DASHSCOPE_BASE_URL}/chat/completions)
// ---------------------------------------------------------------------------

const PRIMARY_QWEN_BASE_URL_ENV_KEY = "DASHSCOPE_BASE_URL" as const;

const LEGACY_QWEN_BASE_URL_ENV_KEYS = [
  "DASHSCOPE_COMPATIBLE_BASE_URL",
  "ALIBABA_MODEL_STUDIO_BASE_URL",
] as const;

export const QWEN_BASE_URL_ENV_KEYS = [
  PRIMARY_QWEN_BASE_URL_ENV_KEY,
  ...LEGACY_QWEN_BASE_URL_ENV_KEYS,
] as const;

/** Qwen chat-completions request shape for the OpenAI-compatible path. */
export type QwenOpenAiCompatibleChatCompletionRequest = {
  model: string;
  temperature: number;
  response_format: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
};

/** Qwen chat-completions response shape used by the assessment parser. */
export type QwenOpenAiCompatibleChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | Array<{ text?: string; type?: string }> };
  }>;
};

/* Qwen client factory — single entry point for all OpenAI-compatible requests
   to DashScope. Keeps apiKey, baseUrl, and endpoint composition in one place
   so future agents never scatter connection logic across execution files. */
export function createQwenClient(input: { baseUrl: string; apiKey: string }) {
  const endpoint = `${input.baseUrl}/chat/completions`;

  return {
    async createChatCompletion(
      payload: QwenOpenAiCompatibleChatCompletionRequest,
      signal: AbortSignal,
    ): Promise<Response> {
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    },
  };
}

// ---------------------------------------------------------------------------

// Qwen/DashScope runtime URL resolution order is centralized here so all server execution
// paths stay on one canonical env contract while still honoring legacy aliases.

export interface AssessmentModelCapabilities {
  provider: "google" | "qwen";
  supportsPromptOnly: boolean;
  supportsTextContext: boolean;
  supportsPdfFile: boolean;
  supportsOfficeDocsDirectly: boolean;
}

function normalizeBaseUrl(value: string | undefined) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeRuntimeValue(value: string | undefined) {
  return String(value || "").trim();
}

function resolveProviderModelId(model: ReturnType<typeof getModelById>) {
  if (
    model.id === "google-balanced" ||
    model.id === "google-advanced" ||
    model.id === "qwen-balanced"
  ) {
    return normalizeRuntimeValue(process.env[model.runtimeEnvKey]) || model.id;
  }

  return model.id;
}

function resolveDashScopeBaseUrl() {
  const primaryBaseUrl = normalizeBaseUrl(
    process.env[PRIMARY_QWEN_BASE_URL_ENV_KEY],
  );

  if (primaryBaseUrl) {
    return {
      baseUrl: primaryBaseUrl,
      baseUrlEnvKey: PRIMARY_QWEN_BASE_URL_ENV_KEY,
    };
  }

  for (const envKey of LEGACY_QWEN_BASE_URL_ENV_KEYS) {
    const value = normalizeBaseUrl(process.env[envKey]);
    if (value) {
      return {
        baseUrl: value,
        baseUrlEnvKey: envKey,
      };
    }
  }

  return {
    baseUrl: null,
    baseUrlEnvKey: null,
  };
}

export function resolveProviderRuntime(modelId: string) {
  const model = getModelById(modelId);

  if (model.provider === "google") {
    return {
      provider: "google" as const,
      model,
      configured: Boolean(process.env.GOOGLE_AI_API_KEY),
      apiKeyName: "GOOGLE_AI_API_KEY",
      apiKey: process.env.GOOGLE_AI_API_KEY || null,
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      providerModel: resolveProviderModelId(model),
    };
  }

  const { baseUrl, baseUrlEnvKey } = resolveDashScopeBaseUrl();
  const apiKey = process.env.DASHSCOPE_API_KEY || null;

  return {
    provider: "qwen" as const,
    model,
    configured: Boolean(apiKey && baseUrl),
    apiKeyName: "DASHSCOPE_API_KEY",
    apiKey,
    baseUrl,
    baseUrlEnvKey,
    providerModel: resolveProviderModelId(model),
  };
}

export function getAssessmentModelCapabilities(
  modelId: string,
): AssessmentModelCapabilities {
  const model = getModelById(modelId);

  if (model.provider === "google") {
    return {
      provider: "google",
      supportsPromptOnly: true,
      supportsTextContext: true,
      supportsPdfFile: true,
      supportsOfficeDocsDirectly: false,
    };
  }

  return {
    provider: "qwen",
    supportsPromptOnly: true,
    supportsTextContext: true,
    supportsPdfFile: false,
    supportsOfficeDocsDirectly: false,
  };
}
