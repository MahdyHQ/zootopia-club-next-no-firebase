import "server-only";

import { findModelForTool, getDefaultModelForTool } from "@zootopia/shared-config";
import type { AiModelDescriptor } from "@zootopia/shared-types";

export type ToolDefaultModelScope = "assessment" | "infographic";

const TOOL_DEFAULT_MODEL_ENV_KEYS = {
  assessment: "ZOOTOPIA_DEFAULT_MODEL_ASSESSMENT",
  infographic: "ZOOTOPIA_DEFAULT_MODEL_INFOGRAPHIC",
} as const satisfies Record<ToolDefaultModelScope, string>;

function readConfiguredToolDefaultModelId(envKey: string) {
  return String(process.env[envKey] ?? "").trim();
}

export function getToolDefaultModelEnvKey(toolScope: ToolDefaultModelScope) {
  return TOOL_DEFAULT_MODEL_ENV_KEYS[toolScope];
}

export function resolveDefaultModelForTool(
  toolScope: ToolDefaultModelScope,
): AiModelDescriptor {
  const fallbackModel = getDefaultModelForTool(toolScope);
  const configuredModelId = readConfiguredToolDefaultModelId(
    TOOL_DEFAULT_MODEL_ENV_KEYS[toolScope],
  );

  /* This resolver is the server-authoritative default-model entry point for the current
     assessment and infographic tools. Keep validation tool-scoped here so env mistakes never
     cross-leak one tool's default into another tool's backend or page initial state. */
  return findModelForTool(toolScope, configuredModelId) ?? fallbackModel;
}

export function resolveDefaultModelIdForTool(toolScope: ToolDefaultModelScope) {
  return resolveDefaultModelForTool(toolScope).id;
}
