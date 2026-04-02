export interface InfographicRequest {
  documentId?: string;
  topic: string;
  style: "academic" | "balanced" | "bold";
  modelId: string;
}

export interface InfographicGeneration {
  id: string;
  ownerUid: string;
  topic: string;
  modelId: string;
  imageSvg: string;
  createdAt: string;
}
