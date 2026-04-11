import "server-only";

import { getModelById } from "@/lib/ai/models";

// Qwen/DashScope runtime URL resolution order is centralized here so all server execution
// paths stay on one canonical env contract while still honoring legacy aliases.
export const QWEN_BASE_URL_ENV_KEYS = [
  "DASHSCOPE_BASE_URL",
  "DASHSCOPE_COMPATIBLE_BASE_URL",
  "ALIBABA_MODEL_STUDIO_BASE_URL",
] as const;

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
  for (const envKey of QWEN_BASE_URL_ENV_KEYS) {
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
