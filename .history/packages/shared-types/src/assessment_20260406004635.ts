import type { AiProviderId } from "./ai";
import type { Locale, ThemeMode, UserRole } from "./auth";
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
  "terminology",
  "definition",
  "comparison",
  "labeling",
  "classification",
  "sequencing",
  "process_mechanism",
  "cause_effect",
  "distinguish_between",
  "identify_structure",
  "identify_compound",
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

export interface AssessmentQuestionStructuredPair {
  left: string;
  right: string;
}

/* This optional structured payload deepens question-type fidelity for science-oriented prompts
   without breaking legacy generic question records. Renderers and exports must keep graceful
   fallback behavior when some or all fields are missing. */
export interface AssessmentQuestionStructuredData {
  expectedTerm?: string;
  acceptableVariants?: string[];
  concept?: string;
  expectedDefinition?: string;
  leftEntity?: string;
  rightEntity?: string;
  comparisonPoints?: string[];
  target?: string;
  expectedLabel?: string;
  categories?: string[];
  items?: string[];
  itemCategoryPairs?: AssessmentQuestionStructuredPair[];
  orderedSteps?: string[];
  processName?: string;
  stages?: string[];
  cause?: string;
  effect?: string;
  subjectA?: string;
  subjectB?: string;
  distinctionPoints?: string[];
  expectedStructure?: string;
  expectedCompound?: string;
  explanatoryNote?: string;
}

export interface AssessmentQuestion {
  id: string;
  type?: AssessmentQuestionType;
  // Question-level difficulty is optional for backward compatibility with older saved records.
  // New orchestration/normalization paths should populate this explicitly for renderer/export parity.
  difficulty?: AssessmentDifficulty;
  question: string;
  answer: string;
  rationale?: string;
  tags?: string[];
  structuredData?: AssessmentQuestionStructuredData;
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

export type AssessmentArtifactKind =
  | "canonical-result"
  | "export-json"
  | "export-markdown"
  | "export-docx"
  | "export-pdf"
  | "export-print-html";

export interface AssessmentArtifactRecord {
  key: string;
  kind: AssessmentArtifactKind;
  locale: Locale;
  themeMode?: ThemeMode | null;
  contentType: string;
  fileName: string;
  storagePath: string;
  status: AssessmentGenerationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface AssessmentGeneration {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  title: string;
  modelId: string;
  status: AssessmentGenerationStatus;
  expiresAt: string;
  previewRoute: string;
  resultRoute: string;
  request: AssessmentRequest;
  questions: AssessmentQuestion[];
  meta: AssessmentGenerationMeta;
  artifacts?: Record<string, AssessmentArtifactRecord>;
  createdAt: string;
  updatedAt: string;
}
