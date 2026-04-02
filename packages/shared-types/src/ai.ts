export type AiProviderId = "google" | "qwen";

export interface AiModelDescriptor {
  id: string;
  provider: AiProviderId;
  label: string;
  description: string;
  runtimeEnvKey: string;
  toolScopes: Array<"assessment" | "infographic">;
}
