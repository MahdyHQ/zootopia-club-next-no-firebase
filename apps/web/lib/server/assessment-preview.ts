import "server-only";

import type { AssessmentGeneration, AssessmentQuestionType, Locale } from "@zootopia/shared-types";

import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";
import {
  buildAssessmentDocxExportRoute,
  buildAssessmentJsonExportRoute,
  buildAssessmentMarkdownExportRoute,
  buildAssessmentPdfExportRoute,
  buildAssessmentResultApiRoute,
} from "@/lib/assessment-routes";
import type { AppMessages } from "@/lib/messages";
import { directionForLocale } from "@/lib/preferences";

function formatDateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDifficultyLabel(value: AssessmentGeneration["meta"]["difficulty"], messages: AppMessages) {
  switch (value) {
    case "easy":
      return messages.difficultyEasy;
    case "hard":
      return messages.difficultyHard;
    default:
      return messages.difficultyMedium;
  }
}

function getLanguageLabel(value: Locale, messages: AppMessages) {
  return value === "ar" ? messages.localeArabic : messages.localeEnglish;
}

function getModeLabel(value: AssessmentGeneration["meta"]["mode"], messages: AppMessages) {
  return value === "exam_generation"
    ? messages.assessmentModeExamGeneration
    : messages.assessmentModeQuestionGeneration;
}

function getProviderLabel(value: AssessmentGeneration["meta"]["provider"], messages: AppMessages) {
  return value === "qwen" ? messages.modelProviderQwen : messages.modelProviderGoogle;
}

function getQuestionTypeLabel(value: AssessmentQuestionType, messages: AppMessages) {
  switch (value) {
    case "true_false":
      return messages.assessmentTypeTrueFalse;
    case "essay":
      return messages.assessmentTypeEssay;
    case "fill_blanks":
      return messages.assessmentTypeFillBlanks;
    case "short_answer":
      return messages.assessmentTypeShortAnswer;
    case "matching":
      return messages.assessmentTypeMatching;
    case "multiple_response":
      return messages.assessmentTypeMultipleResponse;
    default:
      return messages.assessmentTypeMcq;
  }
}

function getInputModeLabel(value: AssessmentGeneration["meta"]["inputMode"], messages: AppMessages) {
  switch (value) {
    case "pdf-file":
      return messages.assessmentInputModePdf;
    case "text-context":
      return messages.assessmentInputModeTextContext;
    default:
      return messages.assessmentInputModePromptOnly;
  }
}

function getStatusLabel(value: AssessmentGeneration["status"], messages: AppMessages) {
  return value === "expired"
    ? messages.assessmentStatusExpired
    : messages.documentStatusReady;
}

function buildPlainTextExport(
  generation: AssessmentGeneration,
  messages: AppMessages,
) {
  const lines = [
    generation.title,
    generation.meta.summary,
    "",
    `${messages.assessmentQuestionCount}: ${generation.meta.questionCount}`,
    `${messages.assessmentModeLabel}: ${getModeLabel(generation.meta.mode, messages)}`,
    `${messages.assessmentDifficulty}: ${getDifficultyLabel(generation.meta.difficulty, messages)}`,
    `${messages.assessmentLanguage}: ${getLanguageLabel(generation.meta.language, messages)}`,
    `${messages.assessmentModelLabel}: ${generation.meta.modelLabel}`,
    `${messages.assessmentInputModeLabel}: ${getInputModeLabel(generation.meta.inputMode, messages)}`,
  ];

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("");

  for (const [index, question] of generation.questions.entries()) {
    lines.push(`${index + 1}. ${question.question}`);
    if (question.type) {
      lines.push(`   ${messages.assessmentQuestionTypesLabel}: ${getQuestionTypeLabel(question.type, messages)}`);
    }
    lines.push(`   ${messages.assessmentAnswerLabel}: ${question.answer}`);
    if (question.rationale) {
      lines.push(`   ${messages.assessmentRationaleLabel}: ${question.rationale}`);
    }
    if (question.tags?.length) {
      lines.push(`   ${messages.assessmentTagsLabel}: ${question.tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildMarkdownExport(
  generation: AssessmentGeneration,
  messages: AppMessages,
) {
  const lines = [
    `# ${generation.title}`,
    "",
    generation.meta.summary,
    "",
    `- ${messages.assessmentQuestionCount}: ${generation.meta.questionCount}`,
    `- ${messages.assessmentModeLabel}: ${getModeLabel(generation.meta.mode, messages)}`,
    `- ${messages.assessmentDifficulty}: ${getDifficultyLabel(generation.meta.difficulty, messages)}`,
    `- ${messages.assessmentLanguage}: ${getLanguageLabel(generation.meta.language, messages)}`,
    `- ${messages.assessmentModelLabel}: ${generation.meta.modelLabel}`,
    `- ${messages.assessmentInputModeLabel}: ${getInputModeLabel(generation.meta.inputMode, messages)}`,
  ];

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`- ${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("", "## Questions", "");

  for (const [index, question] of generation.questions.entries()) {
    lines.push(`### ${index + 1}. ${question.question}`);
    lines.push("");
    if (question.type) {
      lines.push(`- ${messages.assessmentQuestionTypesLabel}: ${getQuestionTypeLabel(question.type, messages)}`);
    }
    lines.push(`- ${messages.assessmentAnswerLabel}: ${question.answer}`);
    if (question.rationale) {
      lines.push(`- ${messages.assessmentRationaleLabel}: ${question.rationale}`);
    }
    if (question.tags?.length) {
      lines.push(`- ${messages.assessmentTagsLabel}: ${question.tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildAssessmentPreview(input: {
  generation: AssessmentGeneration;
  locale: Locale;
  messages: AppMessages;
}): NormalizedAssessmentPreview {
  const { generation, locale, messages } = input;
  const generatedAtLabel = formatDateLabel(generation.createdAt, locale);
  const expiresAtLabel = formatDateLabel(generation.expiresAt, locale);

  return {
    id: generation.id,
    title: generation.title,
    summary: generation.meta.summary,
    locale,
    direction: directionForLocale(locale),
    status: generation.status,
    statusLabel: getStatusLabel(generation.status, messages),
    modeLabel: getModeLabel(generation.meta.mode, messages),
    modelLabel: generation.meta.modelLabel,
    providerLabel: getProviderLabel(generation.meta.provider, messages),
    difficultyLabel: getDifficultyLabel(generation.meta.difficulty, messages),
    languageLabel: getLanguageLabel(generation.meta.language, messages),
    inputModeLabel: getInputModeLabel(generation.meta.inputMode, messages),
    questionCountLabel: `${generation.meta.questionCount} ${messages.assessmentQuestionsLabel}`,
    sourceDocumentLabel: generation.meta.sourceDocument?.fileName ?? null,
    generatedAtLabel,
    expiresAtLabel,
    metadata: [
      {
        label: messages.assessmentModeLabel,
        value: getModeLabel(generation.meta.mode, messages),
      },
      {
        label: messages.assessmentDifficulty,
        value: getDifficultyLabel(generation.meta.difficulty, messages),
      },
      {
        label: messages.assessmentLanguage,
        value: getLanguageLabel(generation.meta.language, messages),
      },
      {
        label: messages.assessmentModelLabel,
        value: generation.meta.modelLabel,
      },
      {
        label: messages.assessmentInputModeLabel,
        value: getInputModeLabel(generation.meta.inputMode, messages),
      },
      {
        label: messages.assessmentExpiresLabel,
        value: expiresAtLabel,
      },
    ],
    questions: generation.questions.map((question, index) => ({
      id: question.id,
      index,
      typeLabel: question.type ? getQuestionTypeLabel(question.type, messages) : null,
      question: question.question,
      answer: question.answer,
      rationale: question.rationale ?? null,
      tags: question.tags ?? [],
    })),
    plainTextExport: buildPlainTextExport(generation, messages),
    markdownExport: buildMarkdownExport(generation, messages),
    previewRoute: generation.previewRoute,
    resultRoute: generation.resultRoute,
    exportRoutes: {
      resultApi: buildAssessmentResultApiRoute(generation.id),
      json: buildAssessmentJsonExportRoute(generation.id),
      markdown: buildAssessmentMarkdownExportRoute(generation.id),
      docx: buildAssessmentDocxExportRoute(generation.id),
      pdf: buildAssessmentPdfExportRoute(generation.id),
    },
  };
}
