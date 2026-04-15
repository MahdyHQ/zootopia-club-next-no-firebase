import "server-only";

import {
  ASSESSMENT_NORMALIZATION_VERSION,
  ASSESSMENT_PROMPT_CONTRACT_VERSION,
  ASSESSMENT_RENDER_MODEL_VERSION,
  type AssessmentNormalizedQuestion,
  type AssessmentNormalizedResult,
  type AssessmentNormalizedSection,
  type AssessmentArtifactKind,
  type AssessmentArtifactRecord,
  type AssessmentDifficulty,
  type AssessmentGeneration,
  type AssessmentGenerationMeta,
  type AssessmentGenerationStatus,
  type AssessmentInputMode,
  type AssessmentMode,
  type AssessmentGenerationSourceDocument,
  type AssessmentQuestion,
  type AssessmentQuestionType,
  type AssessmentQuestionTypeDistribution,
  type AssessmentRawModelResult,
  type AssessmentRequest,
  type AssessmentRequestOptions,
  type Locale,
  type ThemeMode,
  type UserRole,
} from "@zootopia/shared-types";
import {
  normalizeMultilineWhitespace,
  normalizeOptionalMultilineString,
  normalizeOptionalString,
  normalizeWhitespace,
} from "@zootopia/shared-utils";

import { getModelById } from "@/lib/ai/models";
import {
  buildAssessmentQuestionRenderMetadata,
  resolveAssessmentQuestionStructuredData,
} from "@/lib/assessment-question-display";
import {
  buildAssessmentPreviewRoute,
  buildAssessmentResultRoute,
  getAssessmentStatus,
} from "@/lib/server/assessment-retention";
import { inferOwnerScopedStoragePathMetadata } from "@/lib/server/owner-scope";

type AssessmentRequestLike = Partial<AssessmentRequest> & {
  options?: Partial<AssessmentRequestOptions>;
  mode?: AssessmentMode;
  questionCount?: number;
  difficulty?: AssessmentDifficulty;
  language?: Locale;
};

type AssessmentQuestionLike = Partial<AssessmentQuestion> & {
  correctAnswer?: string;
  explanation?: string;
  type?: AssessmentQuestionType;
  difficulty?: unknown;
};

type AssessmentNormalizedQuestionLike = AssessmentQuestionLike &
  Partial<AssessmentNormalizedQuestion> & {
    source?: Partial<AssessmentNormalizedQuestion["source"]> | null;
    grouping?: Partial<AssessmentNormalizedQuestion["grouping"]> | null;
    ordering?: Partial<AssessmentNormalizedQuestion["ordering"]> | null;
    classification?: Partial<AssessmentNormalizedQuestion["classification"]> | null;
  };

type AssessmentRawModelResultLike = Partial<AssessmentRawModelResult> & {
  responseJson?: unknown;
};

type AssessmentNormalizedResultLike = Partial<AssessmentNormalizedResult> & {
  selectedQuestionTypes?: unknown;
  requestedDistribution?: unknown;
  ignoredQuestionTypeKeys?: unknown;
  normalizedQuestions?: AssessmentNormalizedQuestionLike[] | null;
  sections?: Array<Partial<AssessmentNormalizedSection>> | null;
};

type AssessmentGenerationLike = Partial<AssessmentGeneration> & {
  ownerRole?: UserRole;
  status?: AssessmentGenerationStatus;
  expiresAt?: string;
  previewRoute?: string;
  resultRoute?: string;
  artifacts?: Record<string, Partial<AssessmentArtifactRecord>> | null;
  request?: AssessmentRequestLike;
  meta?: Partial<AssessmentGenerationMeta> & {
    inputMode?: AssessmentInputMode;
    sourceDocument?: Partial<AssessmentGenerationSourceDocument> | null;
  };
  questions?: AssessmentQuestionLike[] | string[] | null;
  rawModelResult?: AssessmentRawModelResultLike | null;
  normalizedResult?: AssessmentNormalizedResultLike | null;
  prompt?: string;
  documentId?: string;
  questionCount?: number;
  difficulty?: AssessmentDifficulty;
  language?: Locale;
};

const ARABIC_CHARACTER_PATTERN = /[\u0600-\u06FF]/;
const PROMPT_PREVIEW_LIMIT = 180;
const TITLE_TOPIC_LIMIT = 68;
const SUMMARY_TOPIC_LIMIT = 92;
const SUMMARY_MIN_CHAR_COUNT = 120;
const SUMMARY_MIN_WORD_COUNT = 18;
const SUMMARY_MAX_CHAR_COUNT = 420;
const SUMMARY_TRUNCATION_SEARCH_WINDOW = 96;
const SUMMARY_WORD_TOKEN_SANITIZER = /[^\u0600-\u06FFA-Za-z0-9]+/g;
const DOCUMENT_CONTEXT_LIMIT = 3200;
const DEFAULT_ASSESSMENT_MODE: AssessmentMode = "question_generation";
const DEFAULT_ASSESSMENT_QUESTION_TYPE: AssessmentQuestionType = "mcq";

function clampText(value: string | null | undefined, limit: number) {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) {
    return "";
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1).trimEnd()}...`;
}

function normalizeQuestionCount(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function normalizeDifficulty(value: unknown): AssessmentDifficulty {
  return value === "easy" || value === "medium" || value === "hard"
    ? value
    : "medium";
}

function normalizeQuestionDifficulty(value: unknown): AssessmentDifficulty | undefined {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  const normalized = normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized === "سهل" || normalized === "بسيط" || normalized === "easy") {
    return "easy";
  }

  if (
    normalized === "متوسط" ||
    normalized === "متوسطة" ||
    normalized === "medium" ||
    normalized === "intermediate"
  ) {
    return "medium";
  }

  if (
    normalized === "صعب" ||
    normalized === "عسير" ||
    normalized === "hard" ||
    normalized === "difficult" ||
    normalized === "advanced"
  ) {
    return "hard";
  }

  return undefined;
}

function normalizeAssessmentMode(value: unknown): AssessmentMode {
  return value === "exam_generation" || value === "question_generation"
    ? value
    : DEFAULT_ASSESSMENT_MODE;
}

function normalizeLanguage(value: unknown, fallback: Locale): Locale {
  return value === "ar" || value === "en" ? value : fallback;
}

function normalizeQuestionType(value: unknown): AssessmentQuestionType | undefined {
  return value === "mcq" ||
    value === "true_false" ||
    value === "scientific_term" ||
    value === "essay" ||
    value === "fill_blanks" ||
    value === "short_answer" ||
    value === "matching" ||
    value === "multiple_response" ||
    value === "terminology" ||
    value === "definition" ||
    value === "comparison" ||
    value === "labeling" ||
    value === "classification" ||
    value === "sequencing" ||
    value === "process_mechanism" ||
    value === "cause_effect" ||
    value === "distinguish_between" ||
    value === "identify_structure" ||
    value === "identify_compound"
    ? value
    : undefined;
}

function normalizeQuestionTypes(value: unknown): AssessmentQuestionType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeQuestionType(item))
    .filter((item, index, items): item is AssessmentQuestionType => {
      if (!item) {
        return false;
      }

      return items.indexOf(item) === index;
    });
}

function inferQuestionTypesFromQuestions(
  value: Array<AssessmentQuestionLike | AssessmentNormalizedQuestionLike | string>,
) {
  return value
    .map((item) => {
      if (typeof item === "string") {
        return undefined;
      }

      return normalizeQuestionType(item.type);
    })
    .filter((item, index, items): item is AssessmentQuestionType => {
      if (!item) {
        return false;
      }

      return items.indexOf(item) === index;
    });
}

function buildBalancedQuestionTypeDistribution(
  questionTypes: AssessmentQuestionType[],
): AssessmentQuestionTypeDistribution[] {
  const base = Math.floor(100 / questionTypes.length);
  let remainder = 100 - base * questionTypes.length;

  return questionTypes.map((type) => {
    const percentage = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);

    return {
      type,
      percentage,
    };
  });
}

function normalizeQuestionTypeDistribution(
  value: unknown,
  questionTypes: AssessmentQuestionType[],
): AssessmentQuestionTypeDistribution[] {
  if (!Array.isArray(value) || value.length === 0) {
    return buildBalancedQuestionTypeDistribution(questionTypes);
  }

  const normalized = questionTypes.map((type) => {
    const entry = value.find(
      (item) => typeof item === "object" && item !== null && item.type === type,
    ) as Partial<AssessmentQuestionTypeDistribution> | undefined;
    const percentage =
      typeof entry?.percentage === "number" && Number.isFinite(entry.percentage)
        ? Math.max(0, Math.trunc(entry.percentage))
        : 0;

    return {
      type,
      percentage,
    };
  });

  const total = normalized.reduce((sum, entry) => sum + entry.percentage, 0);
  return total === 100
    ? normalized
    : buildBalancedQuestionTypeDistribution(questionTypes);
}

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeOptionalString(item))
    .filter((item, index, items): item is string => Boolean(item) && items.indexOf(item) === index);
}

function buildQuestionTypeSequence(
  questionCount: number,
  distribution: AssessmentQuestionTypeDistribution[],
) {
  const planned = distribution.map((entry, index) => {
    const rawCount = (questionCount * entry.percentage) / 100;
    return {
      type: entry.type,
      count: Math.floor(rawCount),
      remainder: rawCount - Math.floor(rawCount),
      index,
    };
  });

  let remaining = questionCount - planned.reduce((total, entry) => total + entry.count, 0);
  const ordered = [...planned].sort((left, right) => {
    if (right.remainder === left.remainder) {
      return left.index - right.index;
    }

    return right.remainder - left.remainder;
  });

  for (const entry of ordered) {
    if (remaining <= 0) {
      break;
    }

    entry.count += 1;
    remaining -= 1;
  }

  return planned.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.type),
  );
}

function inferAssessmentLanguage(input: {
  prompt?: string | null;
  title?: string | null;
  summary?: string | null;
  questions?: Array<AssessmentQuestionLike | string> | null;
}) {
  const text = [
    input.prompt,
    input.title,
    input.summary,
    ...(input.questions ?? []).flatMap((question) => {
      if (typeof question === "string") {
        return [question];
      }

      return [question.question, question.answer, question.correctAnswer, question.explanation];
    }),
  ]
    .map((value) => String(value || ""))
    .join(" ");

  return ARABIC_CHARACTER_PATTERN.test(text) ? "ar" : "en";
}

function localizeDifficulty(difficulty: AssessmentDifficulty, language: Locale) {
  if (language === "ar") {
    switch (difficulty) {
      case "easy":
        return "سهلة";
      case "hard":
        return "صعبة";
      default:
        return "متوسطة";
    }
  }

  return difficulty;
}

function buildAssessmentTopic(
  prompt: string,
  fallback: string,
  limit: number,
  sourceDocument?: AssessmentGenerationSourceDocument | null,
) {
  const documentFallback = normalizeOptionalString(sourceDocument?.fileName);
  return clampText(prompt, limit) || clampText(documentFallback ?? fallback, limit) || fallback;
}

function normalizeAssessmentSummaryCandidate(value: unknown) {
  const normalized = normalizeMultilineWhitespace(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const withoutPrefix = normalized.replace(
    /^(summary|assessment summary|summary brief|ملخ(?:ص|ّص))\s*[:\-–]\s*/iu,
    "",
  );

  return withoutPrefix.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function looksLikeAssessmentSummaryJsonLeak(value: string) {
  const lowered = value.toLowerCase();

  if (
    value.startsWith("{") ||
    value.startsWith("[") ||
    value.startsWith("```")
  ) {
    return true;
  }

  return (
    lowered.includes('"questions"') ||
    lowered.includes('"selectedquestiontypes"') ||
    lowered.includes('"requesteddistribution"') ||
    lowered.includes('"contractversion"')
  );
}

function isWeakAssessmentSummary(value: string) {
  const lowered = value.toLowerCase();

  if (
    lowered === "summary" ||
    lowered === "assessment summary" ||
    lowered === "no summary" ||
    lowered === "not provided" ||
    lowered === "n/a" ||
    lowered === "na" ||
    lowered === "none" ||
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "tbd" ||
    lowered === "ملخص" ||
    lowered === "ملخّص" ||
    lowered === "لا يوجد ملخص"
  ) {
    return true;
  }

  if (looksLikeAssessmentSummaryJsonLeak(value)) {
    return true;
  }

  const words = value
    .split(/\s+/)
    .map((word) => word.replace(SUMMARY_WORD_TOKEN_SANITIZER, ""))
    .filter((word) => Boolean(word));

  if (value.length < SUMMARY_MIN_CHAR_COUNT || words.length < SUMMARY_MIN_WORD_COUNT) {
    return true;
  }

  const uniqueWordCount = new Set(words.map((word) => word.toLowerCase())).size;
  return uniqueWordCount <= Math.max(5, Math.floor(words.length * 0.35));
}

function clampAssessmentSummaryForSmallSurfaces(value: string) {
  if (value.length <= SUMMARY_MAX_CHAR_COUNT) {
    return value;
  }

  const truncated = value.slice(0, SUMMARY_MAX_CHAR_COUNT + 1);
  const boundaryStart = Math.max(
    SUMMARY_MIN_CHAR_COUNT,
    SUMMARY_MAX_CHAR_COUNT - SUMMARY_TRUNCATION_SEARCH_WINDOW,
  );
  const tail = truncated.slice(boundaryStart);
  const punctuationOffset = Math.max(
    tail.lastIndexOf("."),
    tail.lastIndexOf("!"),
    tail.lastIndexOf("?"),
    tail.lastIndexOf("؟"),
    tail.lastIndexOf("؛"),
  );

  if (punctuationOffset >= 0) {
    return truncated.slice(0, boundaryStart + punctuationOffset + 1).trim();
  }

  const lastSpace = truncated.lastIndexOf(" ");
  const cutoff = lastSpace > SUMMARY_MIN_CHAR_COUNT ? lastSpace : SUMMARY_MAX_CHAR_COUNT;
  return `${truncated.slice(0, cutoff).trimEnd()}...`;
}

function buildQuestionFallback(input: {
  index: number;
  language: Locale;
  difficulty: AssessmentDifficulty;
  prompt: string;
}) {
  const topic = buildAssessmentTopic(
    input.prompt,
    input.language === "ar" ? "الموضوع العلمي" : "the scientific topic",
    56,
  );

  if (input.language === "ar") {
    return {
      question: `السؤال ${input.index + 1}: اشرح أهمية ${topic} في السياق العلمي الحالي.`,
      answer: `إجابة نموذجية (${localizeDifficulty(input.difficulty, "ar")}): عرّف ${topic} بدقة، ثم اربطه بهدف التعلم أو التطبيق العلمي المناسب.`,
      rationale: "يركز هذا السؤال على الفهم العلمي المنظم وإظهار العلاقة بين المفهوم والتطبيق.",
    };
  }

  return {
    question: `Question ${input.index + 1}: Explain the scientific importance of ${topic}.`,
    answer: `Model answer (${localizeDifficulty(input.difficulty, "en")}): define ${topic} clearly, connect it to the learning objective, and mention one practical implication.`,
    rationale:
      "This item checks for a clear scientific explanation, not just a brief definition.",
  };
}

function normalizeAssessmentQuestion(
  question: AssessmentQuestionLike | string,
  index: number,
  language: Locale,
  difficulty: AssessmentDifficulty,
  prompt: string,
  fallbackType?: AssessmentQuestionType,
): AssessmentQuestion {
  const fallback = buildQuestionFallback({
    index,
    language,
    difficulty,
    prompt,
  });
  const questionType =
    typeof question === "string"
      ? fallbackType
      : normalizeQuestionType(question.type) ?? fallbackType;
  const normalizedQuestionText =
    typeof question === "string"
      ? normalizeMultilineWhitespace(question)
      : normalizeMultilineWhitespace(question.question || fallback.question);
  const normalizedAnswerText =
    typeof question === "string"
      ? fallback.answer
      : normalizeMultilineWhitespace(
          question.answer || question.correctAnswer || question.explanation || fallback.answer,
        );
  const normalizedRationaleText =
    typeof question === "string"
      ? fallback.rationale
      : normalizeOptionalMultilineString(question.rationale || question.explanation) ??
        fallback.rationale;
  /* Legacy records may not include structuredData. Resolve from explicit payload first, then
     derive conservative science-type structure from question/answer text when possible so
     render/export surfaces stay stable without inventing unverifiable metadata. */
  const structuredData = resolveAssessmentQuestionStructuredData({
    questionType: questionType ?? null,
    structuredData: typeof question === "string" ? undefined : question.structuredData,
    questionText: normalizedQuestionText,
    answerText: normalizedAnswerText,
    rationaleText: normalizedRationaleText,
  });
  const rendering = buildAssessmentQuestionRenderMetadata({
    questionType: questionType ?? null,
    structuredData,
    questionText: normalizedQuestionText,
    answerText: normalizedAnswerText,
    rationaleText: normalizedRationaleText,
  });

  if (typeof question === "string") {
    const normalizedQuestion: AssessmentQuestion = {
      id: `q-${index + 1}`,
      difficulty,
      question: normalizedQuestionText,
      answer: normalizedAnswerText,
      rationale: normalizedRationaleText,
      tags: [],
    };

    if (questionType) {
      normalizedQuestion.type = questionType;
    }

    if (structuredData) {
      normalizedQuestion.structuredData = structuredData;
    }

    if (rendering) {
      normalizedQuestion.rendering = rendering;
    }

    return normalizedQuestion;
  }

  const normalizedTags = Array.isArray(question.tags)
    ? question.tags
        .map((tag) => normalizeOptionalString(tag))
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, 4)
    : [];

  const normalizedQuestion: AssessmentQuestion = {
    id: normalizeOptionalString(question.id) ?? `q-${index + 1}`,
    difficulty: normalizeQuestionDifficulty(question.difficulty) ?? difficulty,
    question: normalizedQuestionText,
    answer: normalizedAnswerText,
    rationale: normalizedRationaleText,
    tags: normalizedTags,
  };

  if (questionType) {
    normalizedQuestion.type = questionType;
  }

  if (structuredData) {
    normalizedQuestion.structuredData = structuredData;
  }

  if (rendering) {
    normalizedQuestion.rendering = rendering;
  }

  return normalizedQuestion;
}

function getStoredQuestionTypeLabel(
  value: AssessmentQuestionType,
  language: Locale,
) {
  if (language === "ar") {
    switch (value) {
      case "true_false":
        return "صح / خطأ";
      case "scientific_term":
        return "مصطلح علمي";
      case "essay":
        return "مقالي";
      case "fill_blanks":
        return "أكمل الفراغ";
      case "short_answer":
        return "إجابة قصيرة";
      case "matching":
        return "توصيل";
      case "multiple_response":
        return "متعدد الإجابات";
      case "terminology":
        return "مصطلحات";
      case "definition":
        return "تعريف";
      case "comparison":
        return "مقارنة";
      case "labeling":
        return "تسمية";
      case "classification":
        return "تصنيف";
      case "sequencing":
        return "تسلسل";
      case "process_mechanism":
        return "عملية / آلية";
      case "cause_effect":
        return "سبب ونتيجة";
      case "distinguish_between":
        return "ميّز بين";
      case "identify_structure":
        return "تحديد بنية";
      case "identify_compound":
        return "تحديد مركب";
      default:
        return "اختيار متعدد";
    }
  }

  switch (value) {
    case "true_false":
      return "True / False";
    case "scientific_term":
      return "Scientific Term";
    case "essay":
      return "Essay";
    case "fill_blanks":
      return "Fill in the Blanks";
    case "short_answer":
      return "Short Answer";
    case "matching":
      return "Matching";
    case "multiple_response":
      return "Multiple Response";
    case "terminology":
      return "Terminology";
    case "definition":
      return "Definition";
    case "comparison":
      return "Comparison";
    case "labeling":
      return "Labeling";
    case "classification":
      return "Classification";
    case "sequencing":
      return "Sequencing";
    case "process_mechanism":
      return "Process / Mechanism";
    case "cause_effect":
      return "Cause and Effect";
    case "distinguish_between":
      return "Distinguish Between";
    case "identify_structure":
      return "Identify Structure";
    case "identify_compound":
      return "Identify Compound";
    default:
      return "MCQ";
  }
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeAnswerMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

/* Assessment generations now persist the model-returned JSON separately from the derived
   normalized renderer/export contract. This read-path normalizer keeps old rows compatible
   while preventing undefined nested fields from leaking back into repository merge writes. */
function normalizeAssessmentRawModelResult(
  value: AssessmentRawModelResultLike | null | undefined,
  fallback: {
    provider: AssessmentGenerationMeta["provider"];
    requestedModelId: string;
    canonicalModelId: string;
    providerModelId: string;
    capturedAt: string;
  },
) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const responseJson = "responseJson" in value ? value.responseJson : null;
  const responseText =
    normalizeOptionalMultilineString(value.responseText) ??
    (responseJson === null ? null : safeJsonStringify(responseJson));

  if (!responseText && responseJson === null) {
    return undefined;
  }

  return {
    provider: value.provider === "qwen" ? "qwen" : fallback.provider,
    requestedModelId:
      normalizeOptionalString(value.requestedModelId) ?? fallback.requestedModelId,
    canonicalModelId:
      normalizeOptionalString(value.canonicalModelId) ?? fallback.canonicalModelId,
    providerModelId:
      normalizeOptionalString(value.providerModelId) ?? fallback.providerModelId,
    promptContractVersion:
      normalizeOptionalString(value.promptContractVersion)
      ?? ASSESSMENT_PROMPT_CONTRACT_VERSION,
    responseMimeType: "application/json",
    capturedAt:
      normalizeOptionalString(value.capturedAt) ?? fallback.capturedAt,
    responseText: responseText ?? "",
    responseJson,
  } satisfies AssessmentRawModelResult;
}

function extractRawModelQuestionCount(rawModelResult: AssessmentRawModelResult | undefined) {
  const payload =
    rawModelResult?.responseJson && typeof rawModelResult.responseJson === "object"
      ? (rawModelResult.responseJson as { questions?: unknown }).questions
      : null;

  return Array.isArray(payload) ? payload.length : null;
}

/* This is the shared Phase 2 normalization seam for stored assessment results. It rebuilds
   stable section/order/classification metadata from backend-owned selected types so preview,
   export, analytics, and future filtering all read the same contract without trusting UI-only
   derivation or brittle provider-authored renderer hints. */
export function buildAssessmentNormalizedResult(input: {
  language: Locale;
  questionTypes: AssessmentQuestionType[];
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
  questions: AssessmentQuestion[];
  promptContractVersion?: string | null;
  normalizationVersion?: string | null;
  renderModelVersion?: string | null;
  sourceQuestionCount?: number | null;
  ignoredQuestionCount?: number | null;
  ignoredQuestionTypeKeys?: string[] | null;
  seedNormalizedQuestions?: AssessmentNormalizedQuestionLike[] | null;
}): AssessmentNormalizedResult {
  const selectedQuestionTypes =
    input.questionTypes.length > 0
      ? input.questionTypes
      : [DEFAULT_ASSESSMENT_QUESTION_TYPE];
  const requestedDistribution = normalizeQuestionTypeDistribution(
    input.questionTypeDistribution,
    selectedQuestionTypes,
  );
  const requestedPercentageByType = new Map(
    requestedDistribution.map((entry) => [entry.type, entry.percentage]),
  );
  const selectedTypeSet = new Set(selectedQuestionTypes);
  const plannedQuestionTypeSequence = buildQuestionTypeSequence(
    Math.max(input.questions.length, selectedQuestionTypes.length),
    requestedDistribution,
  );
  const seedQuestions = Array.isArray(input.seedNormalizedQuestions)
    ? input.seedNormalizedQuestions
    : [];
  const seedQuestionsById = new Map<string, AssessmentNormalizedQuestionLike>();

  for (const seedQuestion of seedQuestions) {
    const normalizedSeedId = normalizeOptionalString(seedQuestion.id);
    if (normalizedSeedId && !seedQuestionsById.has(normalizedSeedId)) {
      seedQuestionsById.set(normalizedSeedId, seedQuestion);
    }
  }

  const effectiveQuestions = input.questions.map((question, index) => {
    const selectedType =
      question.type && selectedTypeSet.has(question.type)
        ? question.type
        : plannedQuestionTypeSequence[index]
          ?? selectedQuestionTypes[0]
          ?? DEFAULT_ASSESSMENT_QUESTION_TYPE;

    return {
      question,
      selectedType,
      seed:
        seedQuestionsById.get(question.id)
        ?? seedQuestions[index]
        ?? null,
    };
  });

  const sections = selectedQuestionTypes.map((type, order) => ({
    key: `section-${type}`,
    type,
    title: getStoredQuestionTypeLabel(type, input.language),
    order,
    requestedPercentage: requestedPercentageByType.get(type) ?? 0,
    questionCount: effectiveQuestions.filter((entry) => entry.selectedType === type).length,
  })) satisfies AssessmentNormalizedSection[];

  let nextDisplayOrder = 0;
  const normalizedQuestions = sections.flatMap((section) =>
    effectiveQuestions
      .filter((entry) => entry.selectedType === section.type)
      .map(({ question, seed }, orderInSection) => ({
        ...question,
        source: {
          sourceType: normalizeOptionalString(seed?.source?.sourceType) ?? null,
          sourceDifficulty:
            typeof seed?.source?.sourceDifficulty === "number"
              || typeof seed?.source?.sourceDifficulty === "string"
              ? seed.source.sourceDifficulty
              : null,
          sourceDisplayOrder:
            normalizeInteger(seed?.source?.sourceDisplayOrder)
            ?? normalizeInteger(seed?.ordering?.displayOrder),
          sourceSectionKey:
            normalizeOptionalString(seed?.source?.sourceSectionKey) ?? null,
          sourceSectionTitle:
            normalizeOptionalString(seed?.source?.sourceSectionTitle) ?? null,
          answerMetadata: normalizeAnswerMetadataRecord(seed?.source?.answerMetadata),
        },
        grouping: {
          sectionKey: section.key,
          sectionTitle: section.title,
          sectionType: section.type,
          sectionOrder: section.order,
          requestedPercentage: section.requestedPercentage,
        },
        ordering: {
          displayOrder: nextDisplayOrder,
          sectionOrder: section.order,
          orderInSection,
        },
        classification: {
          canonicalType: section.type,
          selectedType: section.type,
          isSelectedType: true,
          normalizedDifficulty: question.difficulty ?? "medium",
        },
      }) satisfies AssessmentNormalizedQuestion)
      .map((question) => {
        nextDisplayOrder += 1;
        return question;
      }),
  );
  const ignoredQuestionTypeKeys = normalizeStringArray(input.ignoredQuestionTypeKeys);
  const ignoredQuestionCount =
    normalizeInteger(input.ignoredQuestionCount)
    ?? ignoredQuestionTypeKeys.length;
  const sourceQuestionCount =
    normalizeInteger(input.sourceQuestionCount)
    ?? normalizedQuestions.length + ignoredQuestionCount;

  return {
    promptContractVersion:
      normalizeOptionalString(input.promptContractVersion)
      ?? ASSESSMENT_PROMPT_CONTRACT_VERSION,
    normalizationVersion:
      normalizeOptionalString(input.normalizationVersion)
      ?? ASSESSMENT_NORMALIZATION_VERSION,
    renderModelVersion:
      normalizeOptionalString(input.renderModelVersion)
      ?? ASSESSMENT_RENDER_MODEL_VERSION,
    selectionFilterMode: "selected_types_only",
    selectedQuestionTypes,
    requestedDistribution,
    sourceQuestionCount,
    normalizedQuestionCount: normalizedQuestions.length,
    groupedDisplayQuestionCount: normalizedQuestions.length,
    ignoredQuestionCount,
    ignoredQuestionTypeKeys,
    sections,
    normalizedQuestions,
  } satisfies AssessmentNormalizedResult;
}

function normalizeSourceDocument(
  sourceDocument: Partial<AssessmentGenerationSourceDocument> | null | undefined,
) {
  const id = normalizeOptionalString(sourceDocument?.id);
  const fileName = normalizeOptionalString(sourceDocument?.fileName);
  const status =
    sourceDocument?.status === "received" ||
    sourceDocument?.status === "processing" ||
    sourceDocument?.status === "ready" ||
    sourceDocument?.status === "failed"
      ? sourceDocument.status
      : null;

  if (!id || !fileName || !status) {
    return null;
  }

  return {
    id,
    fileName,
    status,
  } satisfies AssessmentGenerationSourceDocument;
}

function normalizeInputMode(value: unknown): AssessmentInputMode {
  return value === "text-context" || value === "pdf-file" ? value : "prompt-only";
}

function normalizeOwnerRole(value: unknown): UserRole | undefined {
  /* Assessment normalization must stay lossless for legacy records because ownerRole is later
     resolved from authoritative server context. Future agents should not reintroduce a fixed
     fallback here or older admin-owned records can be silently rewritten into user scope. */
  return value === "admin" || value === "user" ? value : undefined;
}

function normalizeArtifactKind(value: unknown): AssessmentArtifactKind | undefined {
  return value === "canonical-result" ||
    value === "export-json" ||
    value === "export-markdown" ||
    value === "export-docx" ||
    value === "export-pdf" ||
    value === "export-print-html"
    ? value
    : undefined;
}

function normalizeThemeMode(value: unknown): ThemeMode | null | undefined {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  if (value === null) {
    return null;
  }

  return undefined;
}

function normalizeAssessmentArtifacts(
  value: Record<string, Partial<AssessmentArtifactRecord>> | null | undefined,
  ownerUid: string,
) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const normalizedEntries: Array<[string, AssessmentArtifactRecord]> = [];

  for (const [key, artifact] of Object.entries(value)) {
    const storagePath = normalizeOptionalString(artifact.storagePath);
    const fileName = normalizeOptionalString(artifact.fileName);
    const versionTag = normalizeOptionalString(artifact.versionTag);
    const contentType = normalizeOptionalString(artifact.contentType);
    const kind = normalizeArtifactKind(artifact.kind);
    const locale = normalizeLanguage(artifact.locale, "en");
    const createdAt =
      normalizeOptionalString(artifact.createdAt) ?? new Date().toISOString();
    const lifecycle = getAssessmentStatus({
      createdAt,
      expiresAt: normalizeOptionalString(artifact.expiresAt) ?? null,
      status: artifact.status,
    });
    const storageMetadata = inferOwnerScopedStoragePathMetadata({
      storagePath: storagePath ?? "",
      ownerUid,
      allowedNamespaces: ["assessment-results", "assessment-exports"],
    });

    if (!storagePath || !fileName || !contentType || !kind || !storageMetadata) {
      continue;
    }

    normalizedEntries.push([
      key,
      {
        key,
        kind,
        locale,
        themeMode: normalizeThemeMode(artifact.themeMode) ?? null,
        contentType,
        fileName,
        ...(versionTag
          ? {
              versionTag,
            }
          : {}),
        storagePath,
        storageDataClass: storageMetadata.storageDataClass,
        storageOwnerUid: storageMetadata.ownerUid,
        storageLayoutVersion: storageMetadata.storageLayoutVersion,
        status: lifecycle.status,
        createdAt,
        expiresAt: lifecycle.expiresAt,
      },
    ]);
  }

  return normalizedEntries.length > 0
    ? (Object.fromEntries(normalizedEntries) as Record<string, AssessmentArtifactRecord>)
    : undefined;
}

export function buildAssessmentPromptPreview(prompt: string) {
  return clampText(prompt, PROMPT_PREVIEW_LIMIT);
}

export function buildAssessmentTitle(input: {
  prompt: string;
  language: Locale;
  sourceDocument?: AssessmentGenerationSourceDocument | null;
}) {
  const topic = buildAssessmentTopic(
    input.prompt,
    input.language === "ar" ? "موضوع علمي" : "Science topic",
    TITLE_TOPIC_LIMIT,
    input.sourceDocument,
  );

  return input.language === "ar" ? `تقييم · ${topic}` : `Assessment · ${topic}`;
}

export function buildAssessmentSummary(input: {
  prompt: string;
  mode: AssessmentMode;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  sourceDocument?: AssessmentGenerationSourceDocument | null;
}) {
  const difficulty = localizeDifficulty(input.difficulty, input.language);
  const topic = buildAssessmentTopic(
    input.prompt,
    input.language === "ar" ? "موضوع علمي" : "science topic",
    SUMMARY_TOPIC_LIMIT,
    input.sourceDocument,
  );

  if (input.language === "ar") {
    const sourceNote = input.sourceDocument
      ? ` بالاعتماد على ${input.sourceDocument.fileName}`
      : "";
    const modeLabel =
      input.mode === "exam_generation" ? "أسئلة امتحانية" : "أسئلة تدريبية";
    const modeGuidance =
      input.mode === "exam_generation"
        ? "تلتزم الصياغة بنمط امتحاني واضح مع إجابات دقيقة ومنظمة."
        : "تدعم الصياغة التدريب والمراجعة السريعة مع تعزيز الفهم قبل الاختبار.";

    return clampAssessmentSummaryForSmallSurfaces(
      `${input.questionCount} ${modeLabel} بمستوى ${difficulty} حول ${topic}${sourceNote}. يركز هذا الملخص على أفكار المحاضرة الأساسية والمفاهيم العلمية المحورية وخطوات الاستدلال المتوقعة من الطالب. ${modeGuidance}`,
    );
  }

  const sourceNote = input.sourceDocument
    ? ` using ${input.sourceDocument.fileName}`
    : "";
  const modeLabel =
    input.mode === "exam_generation" ? "exam-style questions" : "practice questions";
  const modeGuidance =
    input.mode === "exam_generation"
      ? "Wording is aligned with exam-style expectations and evidence-driven answers."
      : "Wording is optimized for practice and revision while reinforcing core understanding.";

  return clampAssessmentSummaryForSmallSurfaces(
    `${input.questionCount} ${difficulty} ${modeLabel} focused on ${topic}${sourceNote}. This summary highlights the main lecture concepts, essential scientific terminology, and the reasoning steps learners are expected to demonstrate. ${modeGuidance}`,
  );
}

export function buildCanonicalAssessmentSummary(input: {
  summary: unknown;
  prompt: string;
  mode: AssessmentMode;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  sourceDocument?: AssessmentGenerationSourceDocument | null;
}) {
  const fallbackSummary = buildAssessmentSummary({
    prompt: input.prompt,
    mode: input.mode,
    questionCount: input.questionCount,
    difficulty: input.difficulty,
    language: input.language,
    sourceDocument: input.sourceDocument,
  });
  const providerSummary = normalizeAssessmentSummaryCandidate(input.summary);

  /* This is the single server-owned summary quality gate for every assessment lane.
     Keep validation/compaction centralized here so preview, result API, and all exports
     share one durable summary contract instead of drifting with per-surface fallbacks. */
  if (!providerSummary || isWeakAssessmentSummary(providerSummary)) {
    return fallbackSummary;
  }

  const compactProviderSummary = clampAssessmentSummaryForSmallSurfaces(providerSummary);
  return isWeakAssessmentSummary(compactProviderSummary)
    ? fallbackSummary
    : compactProviderSummary;
}

export function prepareAssessmentDocumentContext(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/\r\n/g, "\n");
  if (!normalized) {
    return null;
  }

  if (normalized.length <= DOCUMENT_CONTEXT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, DOCUMENT_CONTEXT_LIMIT).trimEnd()}\n...`;
}

export function normalizeAssessmentGenerationRecord(
  record: AssessmentGenerationLike,
  options: {
    resolvedOwnerRole?: UserRole;
  } = {},
): AssessmentGeneration {
  const normalizedResultSeed = record.normalizedResult;
  const rawNormalizedQuestions = Array.isArray(
    normalizedResultSeed?.normalizedQuestions,
  )
    ? normalizedResultSeed.normalizedQuestions
    : [];
  const rawQuestions = rawNormalizedQuestions.length > 0
    ? rawNormalizedQuestions
    : (Array.isArray(record.questions) ? record.questions : []);
  const inferredLanguage = inferAssessmentLanguage({
    prompt: record.request?.prompt ?? record.prompt,
    title: record.title,
    summary: record.meta?.summary,
    questions: rawQuestions,
  });

  const requestPrompt = normalizeWhitespace(
    String(record.request?.prompt || record.prompt || record.meta?.promptPreview || record.title || ""),
  );
  const model = getModelById(String(record.modelId || record.request?.modelId || ""));
  const language = normalizeLanguage(
    record.request?.options?.language ??
      record.request?.language ??
      record.meta?.language ??
      record.language,
    inferredLanguage,
  );
  const difficulty = normalizeDifficulty(
    record.request?.options?.difficulty ??
      record.request?.difficulty ??
      record.meta?.difficulty ??
      record.difficulty,
  );
  const mode = normalizeAssessmentMode(
    record.request?.options?.mode ?? record.request?.mode,
  );
  const rawQuestionTypes = normalizeQuestionTypes(
    normalizedResultSeed?.selectedQuestionTypes
    ?? record.request?.options?.questionTypes,
  );
  const inferredQuestionTypes = inferQuestionTypesFromQuestions(rawQuestions);
  const questionTypes =
    rawQuestionTypes.length > 0
      ? rawQuestionTypes
      : (inferredQuestionTypes.length > 0
          ? inferredQuestionTypes
          : [DEFAULT_ASSESSMENT_QUESTION_TYPE]);
  const questionCount = normalizeQuestionCount(
    normalizedResultSeed?.normalizedQuestionCount ??
    record.request?.options?.questionCount ??
      record.request?.questionCount ??
      record.meta?.questionCount ??
      record.questionCount,
    rawQuestions.length || 6,
  );
  const questionTypeDistribution = normalizeQuestionTypeDistribution(
    normalizedResultSeed?.requestedDistribution
    ?? record.request?.options?.questionTypeDistribution,
    questionTypes,
  );
  const hasQuestionTypeMetadata =
    rawQuestionTypes.length > 0 ||
    Array.isArray(normalizedResultSeed?.requestedDistribution) ||
    Array.isArray(record.request?.options?.questionTypeDistribution) ||
    rawQuestions.some(
      (question) =>
        typeof question === "object" &&
        question !== null &&
        Boolean(normalizeQuestionType(question.type)),
    );
  const questionTypeSequence = hasQuestionTypeMetadata
    ? buildQuestionTypeSequence(questionCount, questionTypeDistribution)
    : [];
  const questions = rawQuestions.map((question, index) =>
    normalizeAssessmentQuestion(
      question,
      index,
      language,
      difficulty,
      requestPrompt,
      questionTypeSequence[index],
    ),
  );
  const sourceDocument = normalizeSourceDocument(record.meta?.sourceDocument);
  const inputMode = normalizeInputMode(record.meta?.inputMode);
  const normalizedDocumentId = normalizeOptionalString(
    record.request?.documentId ?? record.documentId ?? sourceDocument?.id,
  );
  const request: AssessmentRequest = {
    prompt: requestPrompt,
    modelId: model.id,
    options: {
      mode,
      questionCount,
      difficulty,
      language,
      questionTypes,
      questionTypeDistribution,
    },
  };
  if (normalizedDocumentId) {
    request.documentId = normalizedDocumentId;
  }
  const createdAt = normalizeOptionalString(record.createdAt) ?? new Date().toISOString();
  const updatedAt = normalizeOptionalString(record.updatedAt) ?? createdAt;
  const normalizedId = normalizeOptionalString(record.id) ?? `assessment-${createdAt}`;
  const lifecycle = getAssessmentStatus({
    createdAt,
    expiresAt: normalizeOptionalString(record.expiresAt) ?? null,
    status: record.status,
  });
  const previewRoute =
    normalizeOptionalString(record.previewRoute) ?? buildAssessmentPreviewRoute(normalizedId);
  const resultRoute =
    normalizeOptionalString(record.resultRoute) ?? buildAssessmentResultRoute(normalizedId);
  const normalizedOwnerUid = normalizeWhitespace(String(record.ownerUid || ""));
  const resolvedOwnerRole = normalizeOwnerRole(record.ownerRole) ?? options.resolvedOwnerRole;
  const normalizedArtifacts = normalizeAssessmentArtifacts(record.artifacts, normalizedOwnerUid);
  const normalizedRawModelResult = normalizeAssessmentRawModelResult(
    record.rawModelResult,
    {
      provider: record.meta?.provider === "qwen" ? "qwen" : model.provider,
      requestedModelId:
        normalizeOptionalString(record.request?.modelId)
        ?? normalizeOptionalString(record.modelId)
        ?? model.id,
      canonicalModelId: model.id,
      providerModelId:
        normalizeOptionalString(record.rawModelResult?.providerModelId)
        ?? model.id,
      capturedAt: updatedAt,
    },
  );
  const normalizedResult = buildAssessmentNormalizedResult({
    language,
    questionTypes,
    questionTypeDistribution,
    questions,
    promptContractVersion:
      normalizeOptionalString(normalizedResultSeed?.promptContractVersion)
      ?? normalizedRawModelResult?.promptContractVersion,
    normalizationVersion: normalizeOptionalString(
      normalizedResultSeed?.normalizationVersion,
    ),
    renderModelVersion: normalizeOptionalString(
      normalizedResultSeed?.renderModelVersion,
    ),
    sourceQuestionCount:
      normalizeInteger(normalizedResultSeed?.sourceQuestionCount)
      ?? extractRawModelQuestionCount(normalizedRawModelResult),
    ignoredQuestionCount: normalizeInteger(normalizedResultSeed?.ignoredQuestionCount),
    ignoredQuestionTypeKeys: normalizeStringArray(
      normalizedResultSeed?.ignoredQuestionTypeKeys,
    ),
    seedNormalizedQuestions: rawNormalizedQuestions,
  });

  const normalizedGeneration: AssessmentGeneration = {
    id: normalizedId,
    ownerUid: normalizedOwnerUid,
    title:
      normalizeOptionalString(record.title) ??
      buildAssessmentTitle({
        prompt: request.prompt,
        language: request.options.language,
        sourceDocument,
      }),
    modelId: model.id,
    status: lifecycle.status,
    expiresAt: lifecycle.expiresAt,
    previewRoute,
    resultRoute,
    request,
    questions: normalizedResult.normalizedQuestions,
    meta: {
      summary: buildCanonicalAssessmentSummary({
        summary: record.meta?.summary,
        prompt: request.prompt,
        mode: request.options.mode,
        questionCount:
          normalizedResult.normalizedQuestions.length || questionCount,
        difficulty: request.options.difficulty,
        language: request.options.language,
        sourceDocument,
      }),
      questionCount: normalizedResult.normalizedQuestions.length || questionCount,
      difficulty: request.options.difficulty,
      language: request.options.language,
      mode: request.options.mode,
      questionTypes: request.options.questionTypes,
      questionTypeDistribution: request.options.questionTypeDistribution,
      modelLabel: normalizeOptionalString(record.meta?.modelLabel) ?? model.label,
      provider: record.meta?.provider === "qwen" ? "qwen" : model.provider,
      inputMode,
      promptPreview:
        normalizeOptionalString(record.meta?.promptPreview) ??
        buildAssessmentPromptPreview(request.prompt),
      sourceDocument,
    },
    rawModelResult: normalizedRawModelResult,
    normalizedResult,
    createdAt,
    updatedAt,
  };

    /* Keep optional fields truly optional so repository merge writes never receive nested
     undefined values such as request.documentId on prompt-only generations. */
  if (resolvedOwnerRole) {
    normalizedGeneration.ownerRole = resolvedOwnerRole;
  }

  if (normalizedArtifacts) {
    normalizedGeneration.artifacts = normalizedArtifacts;
  }

  if (!normalizedRawModelResult) {
    delete normalizedGeneration.rawModelResult;
  }

  return normalizedGeneration;
}
