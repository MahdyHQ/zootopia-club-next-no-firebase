export interface AssessmentRequest {
  documentId?: string;
  prompt: string;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
  modelId: string;
}

export interface AssessmentQuestion {
  question: string;
  answer: string;
}

export interface AssessmentGeneration {
  id: string;
  ownerUid: string;
  title: string;
  modelId: string;
  questions: AssessmentQuestion[];
  createdAt: string;
}
