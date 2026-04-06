import type {
  AssessmentDifficulty,
  AssessmentGenerationStatus,
  AssessmentQuestionStructuredData,
  AssessmentQuestionType,
  Locale,
} from "@zootopia/shared-types";

export type AssessmentScienceRenderBlockKind =
  | "value"
  | "pair"
  | "list"
  | "pair-list";

export interface AssessmentScienceRenderBlock {
  key: string;
  kind: AssessmentScienceRenderBlockKind;
  label: string;
  value?: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  items?: string[];
  pairs?: Array<{
    left: string;
    right: string;
  }>;
  ordered?: boolean;
}

export type AssessmentPreviewThemeMode = "light" | "dark";

export interface AssessmentPreviewMetadataItem {
  label: string;
  value: string;
}

export interface AssessmentPreviewCompositionBadge {
  key: string;
  label: string;
  value?: string;
  tone: "type" | "summary";
}

export interface AssessmentPreviewChoiceItem {
  marker: string | null;
  text: string;
  displayText: string;
  isCorrect: boolean;
}

export interface AssessmentPreviewQuestionItem {
  id: string;
  index: number;
  questionType: AssessmentQuestionType | null;
  typeLabel: string | null;
  difficulty: AssessmentDifficulty | null;
  difficultyLabel: string | null;
  structuredData: AssessmentQuestionStructuredData | null;
  scienceBlocks: AssessmentScienceRenderBlock[];
  question: string;
  stem: string;
  choices: AssessmentPreviewChoiceItem[];
  choiceLayout: "stack" | "grid-2x2";
  supplementalLines: string[];
  answer: string;
  answerDisplay: string;
  rationale: string | null;
  tags: string[];
}

export interface AssessmentPreviewFileSurface {
  platformName: string;
  platformTagline: string;
  logoAssetUrl: string;
  qrTargetUrl: string;
  footerText: string;
  footerLine: {
    leadingEmoji: string;
    text: string;
    trailingEmoji: string;
  };
  backgroundLightUrl: string;
  backgroundDarkUrl: string;
  sealLightAssetUrl: string;
  sealDarkAssetUrl: string;
  facultyBadgeLightAssetUrl: string;
  facultyBadgeDarkAssetUrl: string;
  supportPage: {
    eyebrow: string;
    title: string;
    subtitle: string;
    heroChips: readonly string[];
    emotionalNote: string;
    continuityTitle: string;
    continuityBody: string;
    costTitle: string;
    costItems: readonly string[];
    impactTitle: string;
    impactItems: readonly string[];
    contactTitle: string;
    contactBody: string;
    qrLabel: string;
    contactPathLabel: string;
    contactPathUrl: string;
    directLinkLabel: string;
    directLinkUrl: string;
    personalContactNote: string;
    closingLine: string;
    signatureAssetUrl: string;
  };
}

export interface AssessmentPreviewExportRoutes {
  resultApi: string;
  json: string;
  markdown: string;
  docx: string;
  // Keep these lane-specific URLs explicit so preview/history UI can expose the premium
  // downloadable PDF path separately from the lightweight browser-print path.
  proPdf: string;
  fastPdf: string;
}

export interface NormalizedAssessmentPreview {
  id: string;
  title: string;
  summary: string;
  locale: Locale;
  contentLanguage: Locale;
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
  compositionBadges: AssessmentPreviewCompositionBadge[];
  questions: AssessmentPreviewQuestionItem[];
  fileSurface: AssessmentPreviewFileSurface;
  plainTextExport: string;
  markdownExport: string;
  previewRoute: string;
  resultRoute: string;
  exportRoutes: AssessmentPreviewExportRoutes;
}
