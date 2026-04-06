import "server-only";

import type { AssessmentGeneration, AssessmentQuestionType, Locale } from "@zootopia/shared-types";

import type {
  AssessmentScienceRenderBlock,
  AssessmentPreviewCompositionBadge,
  AssessmentPreviewQuestionItem,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import {
  ASSESSMENT_FILE_FOOTER_TEXT,
  buildAssessmentFileSurface,
} from "@/lib/assessment-file-branding";
import {
  annotateAssessmentCorrectChoices,
  buildAssessmentScienceRenderBlocks,
  countFillBlanks,
  deriveAssessmentQuestionDisplay,
  extractMatchingPairs,
  formatAssessmentAnswerDisplay,
  resolveTrueFalseAnswerValue,
  splitMultipleResponseAnswers,
} from "@/lib/assessment-question-display";
import {
  buildAssessmentDocxExportRoute,
  buildAssessmentFastPdfExportRoute,
  buildAssessmentJsonExportRoute,
  buildAssessmentMarkdownExportRoute,
  buildAssessmentProPdfExportRoute,
  buildAssessmentResultApiRoute,
} from "@/lib/assessment-routes";
import type { AppMessages } from "@/lib/messages";

function formatDateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function localizeCopy(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function detectPrimaryAssessmentLanguage(generation: AssessmentGeneration): Locale {
  const corpus = [
    generation.title,
    generation.meta.summary,
    ...generation.questions.flatMap((question) => [
      question.question,
      question.answer,
      question.rationale,
      ...(question.tags ?? []),
    ]),
  ]
    .map((value) => String(value || ""))
    .join(" ");

  const arabicCharacterCount = (corpus.match(/[\u0600-\u06FF]/gu) ?? []).length;
  const latinCharacterCount = (corpus.match(/[A-Za-z]/g) ?? []).length;

  if (arabicCharacterCount === 0 && latinCharacterCount === 0) {
    return generation.meta.language;
  }

  if (arabicCharacterCount > latinCharacterCount * 1.05) {
    return "ar";
  }

  if (latinCharacterCount > arabicCharacterCount * 1.05) {
    return "en";
  }

  return generation.meta.language;
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

function getQuestionDifficultyLabel(
  value: AssessmentGeneration["questions"][number]["difficulty"] | null | undefined,
  messages: AppMessages,
) {
  if (!value) {
    return null;
  }

  return getDifficultyLabel(value, messages);
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

function getQuestionTypeLabel(
  value: AssessmentQuestionType | "unknown" | null | undefined,
  messages: AppMessages,
) {
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
    case "terminology":
      return messages.assessmentTypeTerminology;
    case "definition":
      return messages.assessmentTypeDefinition;
    case "comparison":
      return messages.assessmentTypeComparison;
    case "labeling":
      return messages.assessmentTypeLabeling;
    case "classification":
      return messages.assessmentTypeClassification;
    case "sequencing":
      return messages.assessmentTypeSequencing;
    case "process_mechanism":
      return messages.assessmentTypeProcessMechanism;
    case "cause_effect":
      return messages.assessmentTypeCauseEffect;
    case "distinguish_between":
      return messages.assessmentTypeDistinguishBetween;
    case "identify_structure":
      return messages.assessmentTypeIdentifyStructure;
    case "identify_compound":
      return messages.assessmentTypeIdentifyCompound;
    case "mcq":
      return messages.assessmentTypeMcq;
    default:
      return messages.assessmentTypeOther;
  }
}

const ASSESSMENT_COMPOSITION_VISIBLE_TYPE_BADGES = 4;

function buildCompositionBadges(input: {
  generation: AssessmentGeneration;
  messages: AppMessages;
}): AssessmentPreviewCompositionBadge[] {
  const counts = new Map<string, number>();

  for (const question of input.generation.questions) {
    const key = question.type ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const orderedTypeKeys = [
    ...input.generation.meta.questionTypes,
    ...Array.from(counts.keys()).filter(
      (key) => !input.generation.meta.questionTypes.includes(key as AssessmentQuestionType),
    ),
  ];

  const typeBadges = orderedTypeKeys
    .map((typeKey) => ({
      typeKey,
      count: counts.get(typeKey) ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => ({
      key: `type-${entry.typeKey}`,
      label: getQuestionTypeLabel(entry.typeKey as AssessmentQuestionType | "unknown", input.messages),
      value: String(entry.count),
      tone: "type" as const,
    }));

  /* Badge compaction keeps preview/result/file headers readable when many question types coexist.
     Preserve the overflow summary pattern (top few + aggregate) instead of rendering an unlimited
     badge strip that crowds metadata and breaks bilingual responsive balance. */
  const visibleTypeBadges = typeBadges.slice(
    0,
    ASSESSMENT_COMPOSITION_VISIBLE_TYPE_BADGES,
  );
  const hiddenTypeCount = Math.max(0, typeBadges.length - visibleTypeBadges.length);

  const summaryBadges: AssessmentPreviewCompositionBadge[] = [];
  if (typeBadges.length > 1) {
    summaryBadges.push({
      key: "mixed",
      label: input.messages.assessmentMixedTypesBadge,
      value: String(typeBadges.length),
      tone: "summary",
    });
  }

  if (hiddenTypeCount > 0) {
    summaryBadges.push({
      key: "more-types",
      label: input.messages.assessmentAdditionalTypesBadge,
      value: `+${hiddenTypeCount}`,
      tone: "summary",
    });
  }

  summaryBadges.push({
    key: "total",
    label: input.messages.assessmentTotalBadge,
    value: String(input.generation.questions.length),
    tone: "summary",
  });

  return [...visibleTypeBadges, ...summaryBadges];
}

function buildQuestionTypeSummaryLine(badges: AssessmentPreviewCompositionBadge[]) {
  const typeEntries = badges.filter((badge) => badge.tone === "type");
  if (typeEntries.length === 0) {
    return null;
  }

  const overflowBadge = badges.find((badge) => badge.key === "more-types");

  const compactSummary = typeEntries
    .map((badge) => `${badge.label}${badge.value ? ` · ${badge.value}` : ""}`)
    .join(" | ");

  if (!overflowBadge) {
    return compactSummary;
  }

  return `${compactSummary} | ${overflowBadge.label}${overflowBadge.value ? ` ${overflowBadge.value}` : ""}`;
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

function buildPreviewQuestionItem(input: {
  question: AssessmentGeneration["questions"][number];
  index: number;
  defaultDifficulty: AssessmentGeneration["meta"]["difficulty"];
  contentLanguage: Locale;
  messages: AppMessages;
}): AssessmentPreviewQuestionItem {
  const { question, index, defaultDifficulty, contentLanguage, messages } = input;

  // Preview, result, Markdown, DOCX, and PDF surfaces must all consume the same interpreted
  // question hierarchy so inline provider-formatted MCQ choices never drift back into the stem.
  const display = deriveAssessmentQuestionDisplay(question.question);
  const choices = annotateAssessmentCorrectChoices({
    answerText: question.answer,
    choices: display.choices,
  });
  const resolvedQuestionType =
    question.type ?? (choices.length > 0 ? "mcq" : null);
  const questionDifficulty = question.difficulty ?? defaultDifficulty;
  const scienceBlocks = buildAssessmentScienceRenderBlocks({
    locale: contentLanguage,
    questionType: resolvedQuestionType,
    structuredData: question.structuredData,
    questionText: question.question,
    answerText: question.answer,
    rationaleText: question.rationale,
  });

  return {
    id: question.id,
    index,
    questionType: resolvedQuestionType,
    typeLabel: getQuestionTypeLabel(resolvedQuestionType, messages),
    difficulty: questionDifficulty,
    difficultyLabel: getQuestionDifficultyLabel(questionDifficulty, messages),
    structuredData: question.structuredData ?? null,
    scienceBlocks,
    question: question.question,
    stem: display.stem,
    /* Preview/result/PDF question cards now share one server-authored correct-choice flag.
       Preserve this normalized field so the premium highlight stays consistent across every
       detached file surface instead of each renderer re-parsing answer text on its own. */
    choices,
    choiceLayout: display.choiceLayout,
    supplementalLines: display.supplementalLines,
    answer: question.answer,
    answerDisplay: formatAssessmentAnswerDisplay({
      answerText: question.answer,
      questionType: question.type,
      choices: display.choices,
    }),
    rationale: question.rationale ?? null,
    tags: question.tags ?? [],
  };
}

function buildTypeAwareExportDetails(input: {
  locale: Locale;
  question: AssessmentPreviewQuestionItem;
  linePrefix: string;
}) {
  const { locale, question, linePrefix } = input;
  const lines: string[] = [];

  /* These branches protect the mixed-question rendering/export contract.
     Keep per-type metadata extraction centralized so preview/result/Markdown share the same
     assumptions instead of silently collapsing back into MCQ-only text blocks. */
  switch (question.questionType) {
    case "true_false": {
      const value = resolveTrueFalseAnswerValue(question.answerDisplay || question.answer);
      if (value) {
        lines.push(
          `${linePrefix}${localizeCopy(locale, "Resolved True/False", "قيمة صح / خطأ")}: ${
            value === "true"
              ? localizeCopy(locale, "True", "صح")
              : localizeCopy(locale, "False", "خطأ")
          }`,
        );
      }
      break;
    }
    case "fill_blanks": {
      const blankCount = countFillBlanks(question.stem);
      if (blankCount > 0) {
        lines.push(
          `${linePrefix}${localizeCopy(locale, "Blank count", "عدد الفراغات")}: ${blankCount}`,
        );
      }
      break;
    }
    case "matching": {
      const pairs = extractMatchingPairs(question.answerDisplay || question.answer);
      if (pairs.length > 0) {
        lines.push(`${linePrefix}${localizeCopy(locale, "Matching pairs", "أزواج التوصيل")}:`);
        lines.push(
          ...pairs.map((pair) => `${linePrefix}${pair.left} -> ${pair.right}`),
        );
      }
      break;
    }
    case "multiple_response": {
      const resolvedAnswers =
        question.choices.filter((choice) => choice.isCorrect).map((choice) => choice.displayText) ||
        [];
      const fallbackAnswers = splitMultipleResponseAnswers(
        question.answerDisplay || question.answer,
      );
      const answers = resolvedAnswers.length > 0 ? resolvedAnswers : fallbackAnswers;

      if (answers.length > 0) {
        lines.push(
          `${linePrefix}${localizeCopy(locale, "Resolved correct options", "الخيارات الصحيحة")}: ${answers.join(", ")}`,
        );
      }
      break;
    }
    default:
      break;
  }

  return lines;
}

function buildPlainTextExport(input: {
  generation: AssessmentGeneration;
  messages: AppMessages;
  questions: AssessmentPreviewQuestionItem[];
  compositionBadges: AssessmentPreviewCompositionBadge[];
}) {
  const { generation, messages, questions, compositionBadges } = input;
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);
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

  if (questionTypeSummaryLine) {
    lines.push(`${messages.assessmentQuestionTypesLabel}: ${questionTypeSummaryLine}`);
  }

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("");

  for (const question of questions) {
    lines.push(`${question.index + 1}. ${question.stem}`);
    if (question.choices.length > 0) {
      lines.push(...question.choices.map((choice) => `   ${choice.displayText}`));
    }
    if (question.supplementalLines.length > 0) {
      lines.push(...question.supplementalLines.map((line) => `   ${line}`));
    }
    if (question.typeLabel) {
      lines.push(`   ${messages.assessmentQuestionTypesLabel}: ${question.typeLabel}`);
    }
    if (question.difficultyLabel) {
      lines.push(
        `   ${localizeCopy(generation.meta.language, "Question difficulty", "صعوبة السؤال")}: ${question.difficultyLabel}`,
      );
    }
    lines.push(`   ${messages.assessmentAnswerLabel}: ${question.answerDisplay}`);
    lines.push(
      ...buildTypeAwareExportDetails({
        locale: generation.meta.language,
        question,
        linePrefix: "   ",
      }),
    );
    if (question.rationale) {
      lines.push(`   ${messages.assessmentRationaleLabel}: ${question.rationale}`);
    }
    if (question.tags?.length) {
      lines.push(`   ${messages.assessmentTagsLabel}: ${question.tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines.filter((line): line is string => line != null).join("\n").trim();
}

function buildMarkdownExport(input: {
  generation: AssessmentGeneration;
  messages: AppMessages;
  questions: AssessmentPreviewQuestionItem[];
  compositionBadges: AssessmentPreviewCompositionBadge[];
  footerText: string;
}) {
  const { generation, messages, questions, compositionBadges, footerText } = input;
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);
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

  if (questionTypeSummaryLine) {
    lines.push(`- ${messages.assessmentQuestionTypesLabel}: ${questionTypeSummaryLine}`);
  }

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`- ${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("", "## Questions", "");

  for (const question of questions) {
    lines.push(`### ${question.index + 1}. ${question.stem.replace(/\n+/g, " ")}`);
    lines.push("");
    if (question.choices.length > 0) {
      lines.push(...question.choices.map((choice) => `- ${choice.displayText}`));
      lines.push("");
    }
    if (question.supplementalLines.length > 0) {
      lines.push(...question.supplementalLines);
      lines.push("");
    }
    if (question.typeLabel) {
      lines.push(`- ${messages.assessmentQuestionTypesLabel}: ${question.typeLabel}`);
    }
    if (question.difficultyLabel) {
      lines.push(
        `- ${localizeCopy(generation.meta.language, "Question difficulty", "صعوبة السؤال")}: ${question.difficultyLabel}`,
      );
    }
    lines.push(`- ${messages.assessmentAnswerLabel}: ${question.answerDisplay}`);
    lines.push(
      ...buildTypeAwareExportDetails({
        locale: generation.meta.language,
        question,
        linePrefix: "- ",
      }),
    );
    if (question.rationale) {
      lines.push(`- ${messages.assessmentRationaleLabel}: ${question.rationale}`);
    }
    if (question.tags?.length) {
      lines.push(`- ${messages.assessmentTagsLabel}: ${question.tags.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("---", "", `> ${footerText}`);

  return lines.join("\n").trim();
}

export function buildAssessmentPreview(input: {
  generation: AssessmentGeneration;
  locale: Locale;
  messages: AppMessages;
}): NormalizedAssessmentPreview {
  const { generation, locale, messages } = input;
  const contentLanguage = detectPrimaryAssessmentLanguage(generation);
  const direction = contentLanguage === "ar" ? "rtl" : "ltr";
  const generatedAtLabel = formatDateLabel(generation.createdAt, locale);
  const expiresAtLabel = formatDateLabel(generation.expiresAt, locale);
  const fileSurface = buildAssessmentFileSurface({
    platformName: messages.appName,
    platformTagline: messages.tagline,
  });
  const compositionBadges = buildCompositionBadges({
    generation,
    messages,
  });
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);
  const questions = generation.questions.map((question, index) =>
    buildPreviewQuestionItem({
      question,
      index,
      defaultDifficulty: generation.meta.difficulty,
      messages,
    }),
  );

  return {
    id: generation.id,
    title: generation.title,
    summary: generation.meta.summary,
    locale,
    contentLanguage,
    direction,
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
      ...(questionTypeSummaryLine
        ? [
            {
              label: messages.assessmentQuestionTypesLabel,
              value: questionTypeSummaryLine,
            },
          ]
        : []),
      {
        label: messages.assessmentExpiresLabel,
        value: expiresAtLabel,
      },
    ],
    compositionBadges,
    questions,
    fileSurface,
    plainTextExport: buildPlainTextExport({
      generation,
      messages,
      questions,
      compositionBadges,
    }),
    markdownExport: buildMarkdownExport({
      generation,
      messages,
      questions,
      compositionBadges,
      /* Markdown exports should reuse the same branded footer line as DOCX/PDF/file previews
         so extracted artifacts stay consistent even though Markdown has no visual card layout. */
      footerText: fileSurface.footerText || ASSESSMENT_FILE_FOOTER_TEXT,
    }),
    previewRoute: generation.previewRoute,
    resultRoute: generation.resultRoute,
    exportRoutes: {
      resultApi: buildAssessmentResultApiRoute(generation.id),
      json: buildAssessmentJsonExportRoute(generation.id),
      markdown: buildAssessmentMarkdownExportRoute(generation.id),
      docx: buildAssessmentDocxExportRoute(generation.id),
      /* Preview/result surfaces now receive explicit Pro vs Fast export routes so the premium
         Puppeteer lane can evolve independently without the lightweight browser-print lane
         hiding behind one overloaded route contract. */
      proPdf: buildAssessmentProPdfExportRoute(generation.id),
      fastPdf: buildAssessmentFastPdfExportRoute(generation.id),
    },
  };
}
