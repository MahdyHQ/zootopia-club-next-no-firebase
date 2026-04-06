import "server-only";

import type {
  AssessmentArtifactKind,
  AssessmentArtifactRecord,
  AssessmentDifficulty,
  AssessmentGeneration,
  AssessmentGenerationMeta,
  AssessmentGenerationStatus,
  AssessmentInputMode,
  AssessmentMode,
  AssessmentGenerationSourceDocument,
  AssessmentQuestion,
  AssessmentQuestionType,
  AssessmentQuestionTypeDistribution,
  AssessmentRequest,
  AssessmentRequestOptions,
  Locale,
  ThemeMode,
  UserRole,
} from "@zootopia/shared-types";
import {
  normalizeMultilineWhitespace,
  normalizeOptionalMultilineString,
  normalizeOptionalString,
  normalizeWhitespace,
} from "@zootopia/shared-utils";

import { getModelById } from "@/lib/ai/models";
import { resolveAssessmentQuestionStructuredData } from "@/lib/assessment-question-display";
import {
  buildAssessmentPreviewRoute,
  buildAssessmentResultRoute,
  getAssessmentStatus,
} from "@/lib/server/assessment-retention";

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

  if (typeof question === "string") {
    return {
      id: `q-${index + 1}`,
      type: questionType,
      difficulty,
      question: normalizeMultilineWhitespace(question),
      answer: fallback.answer,
      rationale: fallback.rationale,
      tags: [],
    };
  }

  const normalizedTags = Array.isArray(question.tags)
    ? question.tags
        .map((tag) => normalizeOptionalString(tag))
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, 4)
    : [];

  return {
    id: normalizeOptionalString(question.id) ?? `q-${index + 1}`,
    type: questionType,
    difficulty: normalizeQuestionDifficulty(question.difficulty) ?? difficulty,
    question: normalizeMultilineWhitespace(question.question || fallback.question),
    answer: normalizeMultilineWhitespace(
      question.answer || question.correctAnswer || question.explanation || fallback.answer,
    ),
    rationale:
      normalizeOptionalMultilineString(question.rationale || question.explanation) ??
      fallback.rationale,
    tags: normalizedTags,
  };
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
) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const normalizedEntries: Array<[string, AssessmentArtifactRecord]> = [];

  for (const [key, artifact] of Object.entries(value)) {
    const storagePath = normalizeOptionalString(artifact.storagePath);
    const fileName = normalizeOptionalString(artifact.fileName);
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

    if (!storagePath || !fileName || !contentType || !kind) {
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
        storagePath,
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

    return `${input.questionCount} ${modeLabel} بمستوى ${difficulty} حول ${topic}${sourceNote}.`;
  }

  const sourceNote = input.sourceDocument
    ? ` using ${input.sourceDocument.fileName}`
    : "";
  const modeLabel =
    input.mode === "exam_generation" ? "exam-style questions" : "practice questions";

  return `${input.questionCount} ${difficulty} ${modeLabel} focused on ${topic}${sourceNote}.`;
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
  const inferredLanguage = inferAssessmentLanguage({
    prompt: record.request?.prompt ?? record.prompt,
    title: record.title,
    summary: record.meta?.summary,
    questions: record.questions ?? [],
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
  const rawQuestionTypes = normalizeQuestionTypes(record.request?.options?.questionTypes);
  const questionTypes =
    rawQuestionTypes.length > 0
      ? rawQuestionTypes
      : [DEFAULT_ASSESSMENT_QUESTION_TYPE];
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questionCount = normalizeQuestionCount(
    record.request?.options?.questionCount ??
      record.request?.questionCount ??
      record.meta?.questionCount ??
      record.questionCount,
    rawQuestions.length || 6,
  );
  const questionTypeDistribution = normalizeQuestionTypeDistribution(
    record.request?.options?.questionTypeDistribution,
    questionTypes,
  );
  const hasQuestionTypeMetadata =
    rawQuestionTypes.length > 0 ||
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
  const request: AssessmentRequest = {
    documentId: normalizeOptionalString(
      record.request?.documentId ?? record.documentId ?? sourceDocument?.id,
    ),
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

  return {
    id: normalizedId,
    ownerUid: normalizeWhitespace(String(record.ownerUid || "")),
    ownerRole: normalizeOwnerRole(record.ownerRole) ?? options.resolvedOwnerRole,
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
    questions,
    meta: {
      summary:
        normalizeOptionalString(record.meta?.summary) ??
        buildAssessmentSummary({
          prompt: request.prompt,
          mode: request.options.mode,
          questionCount: questions.length || questionCount,
          difficulty: request.options.difficulty,
          language: request.options.language,
          sourceDocument,
        }),
      questionCount: questions.length || questionCount,
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
    artifacts: normalizeAssessmentArtifacts(record.artifacts),
    createdAt,
    updatedAt,
  };
}
