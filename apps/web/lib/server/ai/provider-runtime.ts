import "server-only";

import { getModelById } from "@/lib/ai/models";

export function resolveProviderRuntime(modelId: string) {
  const model = getModelById(modelId);

  if (model.provider === "google") {
    return {
      model,
      configured: Boolean(process.env.GOOGLE_AI_API_KEY),
      apiKeyName: "GOOGLE_AI_API_KEY",
      providerModel:
        process.env[model.runtimeEnvKey] || process.env.GOOGLE_AI_MODEL || "",
    };
  }

  return {
    model,
    configured: Boolean(process.env.DASHSCOPE_API_KEY),
    apiKeyName: "DASHSCOPE_API_KEY",
    providerModel:
      process.env[model.runtimeEnvKey] || process.env.QWEN_MODEL || "",
  };
}
