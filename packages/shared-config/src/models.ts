import type { AiModelDescriptor } from "@zootopia/shared-types";

type ToolScope = "assessment" | "infographic";

const LEGACY_ASSESSMENT_MODEL_ALIASES: Record<string, string> = {
  "google-balanced": "gemini-3.1-flash-lite-preview",
  "google-advanced": "gemini-2.5-pro",
  "qwen-balanced": "qwen3.5-flash",
};

function normalizeModelId(modelId: string) {
  return String(modelId || "").trim();
}

function resolveToolScopedAlias(toolScope: ToolScope, modelId: string) {
  if (toolScope !== "assessment") {
    return modelId;
  }

  return LEGACY_ASSESSMENT_MODEL_ALIASES[modelId] ?? modelId;
}

export const ASSESSMENT_MODEL_IDS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "qwen3.5-flash",
] as const;

export const MODEL_CATALOG: AiModelDescriptor[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    provider: "google",
    label: "Gemini 3.1 Flash-Lite",
    description:
      "Default low-latency Gemini lane for everyday assessment generation.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["assessment"],
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    label: "Gemini 2.5 Pro",
    description:
      "Higher-depth Gemini lane for advanced reasoning and richer explanations.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["assessment"],
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash",
    description:
      "Balanced Gemini lane for reliable assessment quality with solid speed.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["assessment"],
  },
  {
    id: "gemini-2.5-flash-lite",
    provider: "google",
    label: "Gemini 2.5 Flash-Lite",
    description:
      "Fast Gemini lane for lightweight assessment generation and quick retries.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["assessment"],
  },
  {
    id: "qwen3.5-flash",
    provider: "qwen",
    label: "Qwen3.5-Flash",
    description:
      "Fast Alibaba Model Studio lane for Assessment through DashScope compatible mode.",
    runtimeEnvKey: "QWEN_MODEL",
    toolScopes: ["assessment"],
  },
  {
    id: "google-balanced",
    provider: "google",
    label: "Google Balanced",
    description:
      "Legacy Google runtime kept for the current infographic workflow.",
    runtimeEnvKey: "GOOGLE_AI_MODEL",
    toolScopes: ["infographic"],
  },
  {
    id: "google-advanced",
    provider: "google",
    label: "Google Advanced",
    description:
      "Legacy higher-depth Google runtime kept for the current infographic workflow.",
    runtimeEnvKey: "GOOGLE_AI_ADVANCED_MODEL",
    toolScopes: ["infographic"],
  },
  {
    id: "qwen-balanced",
    provider: "qwen",
    label: "Qwen Balanced",
    description:
      "Legacy Qwen runtime kept for the current infographic workflow.",
    runtimeEnvKey: "QWEN_MODEL",
    toolScopes: ["infographic"],
  },
];

function findModelById(modelId: string) {
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return undefined;
  }

  return MODEL_CATALOG.find((model) => model.id === normalized);
}

export function getModelById(modelId: string) {
  return findModelById(modelId) ?? getDefaultModelForTool("assessment");
}

export function getModelsForTool(toolScope: ToolScope) {
  return MODEL_CATALOG.filter((model) => model.toolScopes.includes(toolScope));
}

export function getDefaultModelForTool(toolScope: ToolScope) {
  return getModelsForTool(toolScope)[0] ?? MODEL_CATALOG[0]!;
}

export function findModelForTool(toolScope: ToolScope, modelId: string) {
  const normalized = normalizeModelId(modelId);
  const canonical = resolveToolScopedAlias(toolScope, normalized);

  if (!canonical) {
    return undefined;
  }

  return getModelsForTool(toolScope).find((model) => model.id === canonical);
}

export function isModelSupportedForTool(toolScope: ToolScope, modelId: string) {
  return Boolean(findModelForTool(toolScope, modelId));
}

export function toCanonicalToolModelId(toolScope: ToolScope, modelId: string) {
  const normalized = normalizeModelId(modelId);
  const canonical = resolveToolScopedAlias(toolScope, normalized);

  return findModelForTool(toolScope, canonical)?.id ?? canonical;
}
