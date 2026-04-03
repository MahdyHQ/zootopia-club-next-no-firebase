import "server-only";

import { getModelById } from "@/lib/ai/models";

export const DASHSCOPE_US_COMPATIBLE_BASE_URL =
  "https://dashscope-us.aliyuncs.com/compatible-mode/v1";

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
  return (
    normalizeBaseUrl(process.env.DASHSCOPE_BASE_URL) ||
    normalizeBaseUrl(process.env.DASHSCOPE_COMPATIBLE_BASE_URL) ||
    normalizeBaseUrl(process.env.ALIBABA_MODEL_STUDIO_BASE_URL) ||
    DASHSCOPE_US_COMPATIBLE_BASE_URL
  );
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

  const baseUrl = resolveDashScopeBaseUrl();

  return {
    provider: "qwen" as const,
    model,
    configured: Boolean(process.env.DASHSCOPE_API_KEY),
    apiKeyName: "DASHSCOPE_API_KEY",
    apiKey: process.env.DASHSCOPE_API_KEY || null,
    baseUrl,
    baseUrlValid: baseUrl === DASHSCOPE_US_COMPATIBLE_BASE_URL,
    region: "us-virginia" as const,
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
