import "server-only";

import type { AssessmentGeneration, AssessmentQuestionType, Locale } from "@zootopia/shared-types";

import type {
  AssessmentScienceRenderBlock,
  AssessmentPreviewCompositionBadge,
  AssessmentPreviewQuestionItem,
  AssessmentPreviewQuestionSection,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import {
  ASSESSMENT_FILE_FOOTER_TEXT,
  buildAssessmentFileSurface,
} from "@/lib/assessment-file-branding";
import {
  annotateAssessmentCorrectChoices,
  buildAssessmentQuestionRenderMetadata,
  buildAssessmentScienceRenderBlocks,
  countFillBlanks,
  deriveAssessmentQuestionDisplay,
  extractMatchingPairs,
  formatAssessmentAnswerDisplay,
  normalizeAssessmentChoiceQuestionContent,
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
    case "scientific_term":
      return messages.assessmentTypeScientificTerm;
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

function resolvePreviewQuestionType(input: {
  declaredType: AssessmentQuestionType | null | undefined;
  choices: AssessmentPreviewQuestionItem["choices"];
  rawAnswer: string;
  answerDisplay: string;
}) {
  /* Preserve explicit canonical type identity whenever the provider supplied one.
     Recovery heuristics are only allowed when type is missing, so non-MCQ questions
     cannot be relabeled to MCQ from weak choice-like fragments. */
  if (input.declaredType) {
    return input.declaredType;
  }

  /* For type-missing legacy/provider payloads, infer MCQ only with strong evidence:
     at least two recovered choices and answer reconciliation against those choices. */
  const hasRecoveredChoiceAnswer =
    input.choices.some((choice) => choice.isCorrect) ||
    input.answerDisplay !== input.rawAnswer;

  if (input.choices.length >= 2 && hasRecoveredChoiceAnswer) {
    return "mcq";
  }

  return null;
}

const ASSESSMENT_COMPOSITION_VISIBLE_TYPE_BADGES = 4;

function buildSelectedQuestionTypeOrder(generation: AssessmentGeneration) {
  const orderedTypes: AssessmentQuestionType[] = [];

  for (const type of generation.meta.questionTypes) {
    if (!orderedTypes.includes(type)) {
      orderedTypes.push(type);
    }
  }

  if (orderedTypes.length > 0) {
    return orderedTypes;
  }

  return generation.questions
    .map((question) => question.type)
    .filter((type, index, types): type is AssessmentQuestionType =>
      Boolean(type) && types.indexOf(type) === index,
    );
}

function buildQuestionSections(input: {
  messages: AppMessages;
  selectedQuestionTypes: AssessmentQuestionType[];
  questions: AssessmentPreviewQuestionItem[];
}): AssessmentPreviewQuestionSection[] {
  const selectedTypeSet = new Set(input.selectedQuestionTypes);
  const filteredQuestions = input.questions.filter(
    (question): question is AssessmentPreviewQuestionItem & { questionType: AssessmentQuestionType } => {
      // Only allow non-null, valid AssessmentQuestionType
      if (!question.questionType) return false;
      return selectedTypeSet.has(question.questionType as AssessmentQuestionType);
    },
  );
  let nextQuestionIndex = 0;

  return input.selectedQuestionTypes
    .map((type, order) => {
      const sectionLabel = getQuestionTypeLabel(type, input.messages);
      const sectionHeading = buildSectionHeading(order, sectionLabel);
      const sectionQuestions = filteredQuestions
        .filter((question) => question.questionType === type)
        .map((question, sectionIndex) => {
          const displayOrder = nextQuestionIndex++;

          return {
            ...question,
            index: displayOrder,
            displayOrder,
            sectionKey: `section-${type}`,
            sectionTitle: sectionLabel,
            sectionHeading,
            sectionOrder: order,
            startsSection: sectionIndex === 0,
          };
        });

      if (sectionQuestions.length === 0) {
        return undefined;
      }

      return {
        key: `section-${type}`,
        type,
        label: sectionLabel,
        heading: sectionHeading,
        order,
        questions: sectionQuestions,
      } as AssessmentPreviewQuestionSection;
    })
    .filter((section): section is AssessmentPreviewQuestionSection => section !== undefined);
}

function buildCompositionBadges(input: {
  messages: AppMessages;
  questions: AssessmentPreviewQuestionItem[];
  selectedQuestionTypes: AssessmentQuestionType[];
}): AssessmentPreviewCompositionBadge[] {
  const counts = new Map<string, number>();

  for (const question of input.questions) {
    const key = question.questionType ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const orderedTypeKeys = [
    ...input.selectedQuestionTypes,
    ...Array.from(counts.keys()).filter(
      (key) => !input.selectedQuestionTypes.includes(key as AssessmentQuestionType),
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
    value: String(input.questions.length),
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

function buildSectionPrefix(index: number) {
  let current = index;
  let prefix = "";

  do {
    prefix = String.fromCharCode(65 + (current % 26)) + prefix;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return prefix;
}

function buildSectionHeading(index: number, label: string) {
  return `${buildSectionPrefix(index)}) ${label}`;
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
  const questionRecord = question as AssessmentGeneration["questions"][number] & {
    choices?: unknown;
    options?: unknown;
    answerOptions?: unknown;
    answer_options?: unknown;
    answerChoices?: unknown;
    answer_choices?: unknown;
    alternatives?: unknown;
    answerMetadata?: unknown;
    source?: {
      answerMetadata?: unknown;
    } | null;
  };
  const choiceContent = normalizeAssessmentChoiceQuestionContent({
    questionType: question.type,
    questionText: question.question,
    answerText: question.answer,
    choiceSources: [
      questionRecord.choices,
      questionRecord.options,
      questionRecord.answerOptions,
      questionRecord.answer_options,
      questionRecord.answerChoices,
      questionRecord.answer_choices,
      questionRecord.alternatives,
      questionRecord.answerMetadata,
      questionRecord.source?.answerMetadata,
    ],
  });

  // Preview, result, Markdown, DOCX, and PDF surfaces must all consume the same interpreted
  // question hierarchy so inline provider-formatted MCQ choices never drift back into the stem.
  const display = deriveAssessmentQuestionDisplay(choiceContent.questionText);
  const choices =
    choiceContent.choices.length > 0
      ? choiceContent.choices
      : annotateAssessmentCorrectChoices({
          answerText: choiceContent.answerText,
          choices: display.choices,
        });
  const preliminaryAnswerDisplay = formatAssessmentAnswerDisplay({
    answerText: choiceContent.answerText,
    questionType: question.type,
    choices: display.choices,
  });
  const resolvedQuestionType = resolvePreviewQuestionType({
    declaredType: question.type,
    choices,
    rawAnswer: choiceContent.answerText,
    answerDisplay: preliminaryAnswerDisplay,
  });
  const answerDisplay = formatAssessmentAnswerDisplay({
    answerText: choiceContent.answerText,
    questionType: resolvedQuestionType,
    choices: display.choices,
  });
  const questionDifficulty = question.difficulty ?? defaultDifficulty;
  const scienceBlocks = buildAssessmentScienceRenderBlocks({
    locale: contentLanguage,
    questionType: resolvedQuestionType,
    structuredData: question.structuredData,
    questionText: choiceContent.questionText,
    answerText: choiceContent.answerText,
    rationaleText: question.rationale,
  });
  const derivedRendering = buildAssessmentQuestionRenderMetadata({
    questionType: resolvedQuestionType,
    structuredData: question.structuredData,
    questionText: choiceContent.questionText,
    answerText: choiceContent.answerText,
    rationaleText: question.rationale,
  });
  let rendering = question.rendering ?? null;

  if (derivedRendering && question.rendering) {
    rendering = {
      ...question.rendering,
      ...derivedRendering,
    };
  } else if (derivedRendering) {
    rendering = derivedRendering;
  }

  return {
    id: question.id,
    index,
    displayOrder: index,
    sectionKey: null,
    sectionTitle:
      getQuestionTypeLabel(resolvedQuestionType, messages) || messages.assessmentTypeOther,
    sectionHeading:
      getQuestionTypeLabel(resolvedQuestionType, messages) || messages.assessmentTypeOther,
    sectionOrder: index,
    startsSection: false,
    questionType: resolvedQuestionType,
    typeLabel: getQuestionTypeLabel(resolvedQuestionType, messages),
    difficulty: questionDifficulty,
    difficultyLabel: getQuestionDifficultyLabel(questionDifficulty, messages),
    structuredData: question.structuredData ?? null,
    rendering,
    scienceBlocks,
    question: choiceContent.questionText,
    stem: display.stem,
    /* Preview/result/PDF question cards now share one server-authored correct-choice flag.
       Preserve this normalized field so the premium highlight stays consistent across every
       detached file surface instead of each renderer re-parsing answer text on its own. */
    choices,
    choiceLayout: display.choiceLayout,
    supplementalLines: display.supplementalLines,
    answer: choiceContent.answerText,
    answerDisplay,
    rationale: question.rationale ?? null,
    tags: question.tags ?? [],
  };
}

function buildScienceBlockExportLines(input: {
  block: AssessmentScienceRenderBlock;
  linePrefix: string;
}) {
  const { block, linePrefix } = input;

  switch (block.kind) {
    case "value":
      return block.value
        ? [`${linePrefix}${block.label}: ${block.value}`]
        : [];
    case "pair": {
      const lines: string[] = [`${linePrefix}${block.label}:`];
      if (block.leftValue) {
        lines.push(
          `${linePrefix}${block.leftLabel || "Left"}: ${block.leftValue}`,
        );
      }
      if (block.rightValue) {
        lines.push(
          `${linePrefix}${block.rightLabel || "Right"}: ${block.rightValue}`,
        );
      }
      return lines;
    }
    case "list": {
      if (!block.items || block.items.length === 0) {
        return [];
      }

      return [
        `${linePrefix}${block.label}:`,
        ...block.items.map((item, index) =>
          block.ordered
            ? `${linePrefix}${index + 1}. ${item}`
            : `${linePrefix}- ${item}`,
        ),
      ];
    }
    case "pair-list": {
      if (!block.pairs || block.pairs.length === 0) {
        return [];
      }

      return [
        `${linePrefix}${block.label}:`,
        ...block.pairs.map((pair) => `${linePrefix}${pair.left} -> ${pair.right}`),
      ];
    }
    default:
      return [];
  }
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

  for (const block of question.scienceBlocks) {
    lines.push(
      ...buildScienceBlockExportLines({
        block,
        linePrefix,
      }),
    );
  }

  return lines;
}

function buildPlainTextExport(input: {
  generation: AssessmentGeneration;
  messages: AppMessages;
  questionSections: AssessmentPreviewQuestionSection[];
  questionCount: number;
  compositionBadges: AssessmentPreviewCompositionBadge[];
}) {
  const { generation, messages, questionSections, questionCount, compositionBadges } = input;
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);
  const lines = [
    generation.title,
    generation.meta.summary,
    "",
    `${messages.assessmentQuestionCount}: ${questionCount}`,
    `${messages.assessmentModeLabel}: ${getModeLabel(generation.meta.mode, messages)}`,
    `${messages.assessmentDifficulty}: ${getDifficultyLabel(generation.meta.difficulty, messages)}`,
    `${messages.assessmentLanguage}: ${getLanguageLabel(generation.meta.language, messages)}`,
    `${messages.assessmentInputModeLabel}: ${getInputModeLabel(generation.meta.inputMode, messages)}`,
  ];

  if (questionTypeSummaryLine) {
    lines.push(`${messages.assessmentQuestionTypesLabel}: ${questionTypeSummaryLine}`);
  }

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("");

  for (const [sectionIndex, section] of questionSections.entries()) {
    lines.push(section.heading || buildSectionHeading(sectionIndex, section.label));
    lines.push("");

    for (const question of section.questions) {
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
  }

  return lines.filter((line): line is string => line != null).join("\n").trim();
}

function buildMarkdownExport(input: {
  generation: AssessmentGeneration;
  messages: AppMessages;
  questionSections: AssessmentPreviewQuestionSection[];
  questionCount: number;
  compositionBadges: AssessmentPreviewCompositionBadge[];
  footerText: string;
}) {
  const { generation, messages, questionSections, questionCount, compositionBadges, footerText } = input;
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);
  const lines = [
    `# ${generation.title}`,
    "",
    generation.meta.summary,
    "",
    `- ${messages.assessmentQuestionCount}: ${questionCount}`,
    `- ${messages.assessmentModeLabel}: ${getModeLabel(generation.meta.mode, messages)}`,
    `- ${messages.assessmentDifficulty}: ${getDifficultyLabel(generation.meta.difficulty, messages)}`,
    `- ${messages.assessmentLanguage}: ${getLanguageLabel(generation.meta.language, messages)}`,
    `- ${messages.assessmentInputModeLabel}: ${getInputModeLabel(generation.meta.inputMode, messages)}`,
  ];

  if (questionTypeSummaryLine) {
    lines.push(`- ${messages.assessmentQuestionTypesLabel}: ${questionTypeSummaryLine}`);
  }

  if (generation.meta.sourceDocument?.fileName) {
    lines.push(`- ${messages.assessmentSourceDocument}: ${generation.meta.sourceDocument.fileName}`);
  }

  lines.push("", "## Questions", "");

  for (const [sectionIndex, section] of questionSections.entries()) {
    lines.push(`## ${section.heading || buildSectionHeading(sectionIndex, section.label)}`);
    lines.push("");

    for (const question of section.questions) {
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
  const selectedQuestionTypes = buildSelectedQuestionTypeOrder(generation);
  const candidateQuestions = generation.questions.map((question, index) =>
    buildPreviewQuestionItem({
      question,
      index,
      defaultDifficulty: generation.meta.difficulty,
      contentLanguage,
      messages,
    }),
  );
  /* User-selected types remain authoritative for final preview/export surfaces.
     Keep only selected canonical types here so extra provider-returned types are tolerated
     in raw storage but never leak into grouped display or downloadable artifacts. */
  const questionSections = buildQuestionSections({
    messages,
    selectedQuestionTypes,
    questions: candidateQuestions,
  });
  const questions = questionSections.flatMap((section) => section.questions);
  const questionCount = questions.length;
  const compositionBadges = buildCompositionBadges({
    messages,
    questions,
    selectedQuestionTypes,
  });
  const questionTypeSummaryLine = buildQuestionTypeSummaryLine(compositionBadges);

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
    providerLabel: getProviderLabel(generation.meta.provider, messages),
    difficultyLabel: getDifficultyLabel(generation.meta.difficulty, messages),
    languageLabel: getLanguageLabel(generation.meta.language, messages),
    inputModeLabel: getInputModeLabel(generation.meta.inputMode, messages),
    questionCountLabel: `${questionCount} ${messages.assessmentQuestionsLabel}`,
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
    questionSections,
    questions,
    fileSurface,
    plainTextExport: buildPlainTextExport({
      generation,
      messages,
      questionSections,
      questionCount,
      compositionBadges,
    }),
    markdownExport: buildMarkdownExport({
      generation,
      messages,
      questionSections,
      questionCount,
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
