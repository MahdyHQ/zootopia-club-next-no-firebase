import "server-only";

import { getModelById } from "@/lib/ai/models";

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
  const baseUrl = getRequiredEnv("DASHSCOPE_BASE_URL");

  return {
    provider: "qwen" as const,
    model,
    configured: Boolean(apiKey && baseUrl),
    apiKeyName: "DASHSCOPE_API_KEY" as const,
    apiKey,
    baseUrl,
    baseUrlEnvKey: "DASHSCOPE_BASE_URL" as const,
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