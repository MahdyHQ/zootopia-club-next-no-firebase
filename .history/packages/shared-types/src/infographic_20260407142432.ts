import type { AiProviderId } from "./ai";
import type { DocumentStatus } from "./document";
import type { UserRole } from "./auth";

export interface InfographicRequest {
  documentId?: string;
  topic: string;
  style: "academic" | "balanced" | "bold";
  modelId: string;
}

export type InfographicInputMode = "prompt-only" | "text-context";
export type InfographicGenerationStatus = "ready";

export interface InfographicGenerationSourceDocument {
  id: string;
  fileName: string;
  status: DocumentStatus;
}

export interface InfographicGenerationMeta {
  toolName: "infographic";
  style: InfographicRequest["style"];
  provider: AiProviderId;
  modelLabel: string;
  inputMode: InfographicInputMode;
  sourceDocument: InfographicGenerationSourceDocument | null;
  artifactType: "inline-svg";
}

export interface InfographicGeneration {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  topic: string;
  modelId: string;
  imageSvg: string;
  status: InfographicGenerationStatus;
  meta: InfographicGenerationMeta;
  createdAt: string;
  updatedAt: string;
}
