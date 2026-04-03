import type { AiProviderId } from "./ai";
import type { Locale } from "./auth";
import type { DocumentStatus } from "./document";

export type AssessmentDifficulty = "easy" | "medium" | "hard";
export type AssessmentGenerationStatus = "ready" | "expired";
export type AssessmentInputMode = "prompt-only" | "text-context" | "pdf-file";
export const ASSESSMENT_MODES = [
  "question_generation",
  "exam_generation",
] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];
export const ASSESSMENT_QUESTION_TYPES = [
  "mcq",
  "true_false",
  "essay",
  "fill_blanks",
  "short_answer",
  "matching",
  "multiple_response",
] as const;
export type AssessmentQuestionType = (typeof ASSESSMENT_QUESTION_TYPES)[number];

export interface AssessmentQuestionTypeDistribution {
  type: AssessmentQuestionType;
  percentage: number;
}

export interface AssessmentRequestOptions {
  mode: AssessmentMode;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  questionTypes: AssessmentQuestionType[];
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
}

export interface AssessmentRequestInput {
  documentId?: string;
  prompt?: string;
  modelId?: string;
  options?: Partial<AssessmentRequestOptions>;
  mode?: AssessmentMode;
  questionCount?: number;
  difficulty?: AssessmentDifficulty;
  language?: Locale;
  questionTypes?: AssessmentQuestionType[];
  questionTypeDistribution?: AssessmentQuestionTypeDistribution[];
}

export interface AssessmentRequest {
  documentId?: string;
  prompt: string;
  modelId: string;
  options: AssessmentRequestOptions;
}

export interface AssessmentRequestFieldErrors {
  prompt?: string;
  documentId?: string;
  modelId?: string;
  mode?: string;
  questionCount?: string;
  difficulty?: string;
  language?: string;
  questionTypes?: string;
  questionTypeDistribution?: string;
}

export interface AssessmentQuestion {
  id: string;
  type?: AssessmentQuestionType;
  question: string;
  answer: string;
  rationale?: string;
  tags?: string[];
}

export interface AssessmentGenerationSourceDocument {
  id: string;
  fileName: string;
  status: DocumentStatus;
}

export interface AssessmentGenerationMeta {
  summary: string;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  mode: AssessmentMode;
  questionTypes: AssessmentQuestionType[];
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
  modelLabel: string;
  provider: AiProviderId;
  inputMode: AssessmentInputMode;
  promptPreview: string;
  sourceDocument: AssessmentGenerationSourceDocument | null;
}

export interface AssessmentGeneration {
  id: string;
  ownerUid: string;
  title: string;
  modelId: string;
  status: AssessmentGenerationStatus;
  expiresAt: string;
  previewRoute: string;
  resultRoute: string;
  request: AssessmentRequest;
  questions: AssessmentQuestion[];
  meta: AssessmentGenerationMeta;
  createdAt: string;
  updatedAt: string;
}
