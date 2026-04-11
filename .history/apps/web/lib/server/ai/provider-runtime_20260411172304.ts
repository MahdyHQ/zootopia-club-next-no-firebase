import "server-only";

import { getModelById } from "@/lib/ai/models";

const PRIMARY_QWEN_BASE_URL_ENV_KEY = "DASHSCOPE_BASE_URL" as const;

const LEGACY_QWEN_BASE_URL_ENV_KEYS = [
  "DASHSCOPE_COMPATIBLE_BASE_URL",
  "ALIBABA_MODEL_STUDIO_BASE_URL",
] as const;

export const QWEN_BASE_URL_ENV_KEYS = [
  PRIMARY_QWEN_BASE_URL_ENV_KEY,
  ...LEGACY_QWEN_BASE_URL_ENV_KEYS,
] as const;

export interface AssessmentModelCapabilities {
  provider: "google" | "qwen";
  supportsPromptOnly: boolean;
  supportsTextContext: boolean;
  supportsPdfFile: boolean;
  supportsOfficeDocsDirectly: boolean;
}

export type QwenOpenAiCompatibleChatCompletionRequest = {
  model: string;
  temperature: number;
  response_format: { type: "json_object" };
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
};

export type QwenOpenAiCompatibleChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
};

function normalizeRuntimeValue(value: string | undefined): string {
  return String(value ?? "").trim();
}

function normalizeBaseUrl(value: string | undefined): string {
  return normalizeRuntimeValue(value).replace(/\/+$/, "");
}

function getRequiredEnv(name: "GOOGLE_AI_API_KEY" | "DASHSCOPE_API_KEY" | "DASHSCOPE_BASE_URL"): string | null {
  const value = normalizeRuntimeValue(process.env[name]);
  return value.length > 0 ? value : null;
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

export function createQwenClient(input: { baseUrl: string; apiKey: string }) {
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/chat/completions`;

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

export function resolveProviderRuntime(modelId: string) {
  const model = getModelById(modelId);

  if (model.provider === "google") {
    const apiKey = getRequiredEnv("GOOGLE_AI_API_KEY");

    return {
      provider: "google" as const,
      model,
      configured: Boolean(apiKey),
      apiKeyName: "GOOGLE_AI_API_KEY" as const,
      apiKey,
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      providerModel: model.id,
    };
  }

  const apiKey = getRequiredEnv("DASHSCOPE_API_KEY");
  const { baseUrl, baseUrlEnvKey } = resolveDashScopeBaseUrl();

  return {
    provider: "qwen" as const,
    model,
    configured: Boolean(apiKey && baseUrl),
    apiKeyName: "DASHSCOPE_API_KEY" as const,
    apiKey,
    baseUrl,
    baseUrlEnvKey,
    providerModel: model.id,
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