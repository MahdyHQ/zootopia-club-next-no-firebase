import type { AiModelDescriptor } from "@zootopia/shared-types";

export const MODEL_CATALOG: AiModelDescriptor[] = [
  {
    id: "google-balanced",
    provider: "google",
    label: "Google Balanced",
    description:
      "Primary Google runtime for balanced assessment and infographic generation.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["assessment", "infographic"],
  },
  {
    id: "google-advanced",
    provider: "google",
    label: "Google Advanced",
    description:
      "Higher-depth Google runtime reserved for more structured educational outputs.",
    runtimeEnvKey: "GOOGLE_AI_ADVANCED_MODEL",
    toolScopes: ["assessment", "infographic"],
  },
  {
    id: "qwen-balanced",
    provider: "qwen",
    label: "Qwen Balanced",
    description:
      "Qwen-compatible runtime for same-origin server-side orchestration and model switching.",
    runtimeEnvKey: "QWEN_MODEL",
    toolScopes: ["assessment", "infographic"],
  },
];

export function getModelById(modelId: string) {
  return MODEL_CATALOG.find((model) => model.id === modelId) ?? MODEL_CATALOG[0]!;
}

export function getModelsForTool(toolScope: "assessment" | "infographic") {
  return MODEL_CATALOG.filter((model) => model.toolScopes.includes(toolScope));
}
