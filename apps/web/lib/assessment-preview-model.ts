import type {
  AssessmentGenerationStatus,
  Locale,
} from "@zootopia/shared-types";

export type AssessmentPreviewThemeMode = "light" | "dark";

export interface AssessmentPreviewMetadataItem {
  label: string;
  value: string;
}

export interface AssessmentPreviewQuestionItem {
  id: string;
  index: number;
  typeLabel: string | null;
  question: string;
  answer: string;
  rationale: string | null;
  tags: string[];
}

export interface AssessmentPreviewExportRoutes {
  resultApi: string;
  json: string;
  markdown: string;
  docx: string;
  pdf: string;
}

export interface NormalizedAssessmentPreview {
  id: string;
  title: string;
  summary: string;
  locale: Locale;
  direction: "ltr" | "rtl";
  status: AssessmentGenerationStatus;
  statusLabel: string;
  modeLabel: string;
  modelLabel: string;
  providerLabel: string;
  difficultyLabel: string;
  languageLabel: string;
  inputModeLabel: string;
  questionCountLabel: string;
  sourceDocumentLabel: string | null;
  generatedAtLabel: string;
  expiresAtLabel: string;
  metadata: AssessmentPreviewMetadataItem[];
  questions: AssessmentPreviewQuestionItem[];
  plainTextExport: string;
  markdownExport: string;
  previewRoute: string;
  resultRoute: string;
  exportRoutes: AssessmentPreviewExportRoutes;
}
