import "server-only";

import type {
  AssessmentDifficulty,
  AssessmentGeneration,
  AssessmentGenerationSourceDocument,
  AssessmentInputMode,
  AssessmentQuestion,
  AssessmentQuestionType,
  AssessmentQuestionTypeDistribution,
  AssessmentRequest,
  AiModelDescriptor,
  InfographicGeneration,
  InfographicGenerationSourceDocument,
  InfographicRequest,
  Locale,
  UserRole,
} from "@zootopia/shared-types";
import { normalizeMultilineWhitespace, normalizeWhitespace } from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { getModelById } from "@/lib/ai/models";
import {
  buildAssessmentPrompt,
  buildToolPrompt,
} from "@/lib/server/ai/prompt-orchestrator";
import { resolveAssessmentQuestionStructuredData } from "@/lib/assessment-question-display";
import {
  buildAssessmentPromptPreview,
  buildAssessmentSummary,
  buildAssessmentTitle,
} from "@/lib/server/assessment-records";
import {
  buildAssessmentPreviewRoute,
  buildAssessmentResultRoute,
  getAssessmentExpiryTimestamp,
} from "@/lib/server/assessment-retention";
import {
  createQwenClient,
  QWEN_BASE_URL_ENV_KEYS,
  resolveProviderRuntime,
  type QwenOpenAiCompatibleChatCompletionResponse,
} from "@/lib/server/ai/provider-runtime";
import type { AssessmentDirectFileInput } from "@/lib/server/assessment-linked-document";

export type AssessmentExecutionErrorCode =
  | "ASSESSMENT_MODEL_UNSUPPORTED"
  | "ASSESSMENT_PROVIDER_NOT_CONFIGURED"
  | "ASSESSMENT_PROVIDER_MISCONFIGURED"
  | "ASSESSMENT_PROVIDER_API_KEY_MISSING"
  | "ASSESSMENT_PROVIDER_BASE_URL_MISSING"
  | "ASSESSMENT_PROVIDER_MODEL_UNAVAILABLE"
  | "ASSESSMENT_PROVIDER_ROUTE_MISMATCH"
  | "ASSESSMENT_PROVIDER_AUTH_FAILED"
  | "ASSESSMENT_PROVIDER_RATE_LIMITED"
  | "ASSESSMENT_PROVIDER_TIMEOUT"
  | "ASSESSMENT_PROVIDER_EXECUTION_FAILED"
  | "ASSESSMENT_PROVIDER_RESPONSE_INVALID";

export type AssessmentExecutionErrorLayer =
  | "request"
  | "provider-runtime"
  | "provider-execution"
  | "provider-response";

const ASSESSMENT_CREATE_ROUTE = "/api/assessment" as const;
const ASSESSMENT_CREATE_FLOW = "assessment-create" as const;

export type AssessmentExecutionErrorContext = {
  layer: AssessmentExecutionErrorLayer;
  subsystem: "assessment-runtime" | "google-runtime" | "qwen-runtime" | "provider-http" | "provider-parser";
  operation: string;
  route: typeof ASSESSMENT_CREATE_ROUTE;
  flow: typeof ASSESSMENT_CREATE_FLOW;
  modelId?: string;
  canonicalModelId?: string;
  provider?: "google" | "qwen";
  providerModelId?: string;
  ownerUid?: string;
  sessionLane?: "admin" | "user";
  requestLane?: "admin" | "user";
  upstreamStatus?: number;
  upstreamCode?: string;
  upstreamType?: string;
};

type AssessmentExecutionErrorContextInput = Omit<
  AssessmentExecutionErrorContext,
  "route" | "flow"
>;

type AssessmentExecutionContextBase = {
  modelId: string;
  canonicalModelId: string;
  provider: "google" | "qwen";
  providerModelId: string;
  ownerUid?: string;
  sessionLane?: "admin" | "user";
  requestLane?: "admin" | "user";
};

type ProviderAssessmentQuestion = {
  type?: string;
  difficulty?: string | number;
  level?: string | number;
  difficulty_level?: string | number;
  question?: string;
  answer?: string;
  rationale?: string;
  tags?: string[] | string;
  structuredData?: unknown;
  expectedTerm?: unknown;
  acceptableVariants?: unknown;
  concept?: unknown;
  expectedDefinition?: unknown;
  leftEntity?: unknown;
  rightEntity?: unknown;
  comparisonPoints?: unknown;
  target?: unknown;
  expectedLabel?: unknown;
  categories?: unknown;
  items?: unknown;
  itemCategoryPairs?: unknown;
  orderedSteps?: unknown;
  processName?: unknown;
  stages?: unknown;
  cause?: unknown;
  effect?: unknown;
  subjectA?: unknown;
  subjectB?: unknown;
  distinctionPoints?: unknown;
  expectedStructure?: unknown;
  expectedCompound?: unknown;
  explanatoryNote?: unknown;
};

type ProviderAssessmentPayload = {
  summary?: string;
  questions?: ProviderAssessmentQuestion[] | string[];
};

type GoogleProviderResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};


/* Qwen receives a provider-level system rule mirroring the shared assessment prompt contract.
   Keep emoji guidance here so provider-specific execution stays aligned with preview/export
   surfaces and does not silently "sanitize away" deliberate expressive characters. */
const QWEN_ASSESSMENT_SYSTEM_PROMPT =
  "You generate scientifically reliable assessment questions, may use tasteful educationally appropriate emojis when they genuinely help clarity or recall, and must respond with valid JSON only while preserving any emoji characters directly in the JSON strings.";

const QWEN_BASE_URL_ENV_HINT = QWEN_BASE_URL_ENV_KEYS.join(", ");

export class AssessmentExecutionError extends Error {
  constructor(
    public readonly code: AssessmentExecutionErrorCode,
    message: string,
    public readonly status = 502,
    public readonly context: AssessmentExecutionErrorContext,
  ) {
    super(message);
    this.name = "AssessmentExecutionError";
  }
}

function createAssessmentExecutionError(input: {
  code: AssessmentExecutionErrorCode;
  message: string;
  status?: number;
  context: AssessmentExecutionErrorContextInput;
}) {
  return new AssessmentExecutionError(
    input.code,
    input.message,
    input.status ?? 502,
    {
      route: ASSESSMENT_CREATE_ROUTE,
      flow: ASSESSMENT_CREATE_FLOW,
      ...input.context,
    },
  );
}

function splitPromptIntoFragments(value: string) {
  return value
    .split(/[\n,.!?;:()\-]+/)
    .map((item) => item.replace(/[#*_`>\[\]]/g, "").trim())
    .filter((item) => {
      if (!item) {
        return false;
      }

      return !(
        item.startsWith("Tool") ||
        item.startsWith("Model lane") ||
        item.startsWith("Output contract") ||
        item.startsWith("JSON contract") ||
        item.startsWith("Type enum contract") ||
        item.startsWith("Difficulty enum contract") ||
        item.startsWith("Strict metadata contract") ||
        item.startsWith("Generation mode") ||
        item.startsWith("Language target") ||
        item.startsWith("Difficulty target") ||
        item.startsWith("Document input mode") ||
        item.startsWith("Question type distribution") ||
        item.startsWith("Provider runtime configured") ||
        item.startsWith("Authoring instructions") ||
        item.startsWith("Structure instructions") ||
        item.startsWith("Structured metadata contract") ||
        item.startsWith("Structured data rules") ||
        item.startsWith("Presentation instructions") ||
        item.startsWith("User request") ||
        item.startsWith("Document context")
      );
    });
}

function normalizeAssessmentQuestionType(value: unknown): AssessmentQuestionType | undefined {
  const normalized = normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");

  switch (normalized) {
    case "multiple_choice":
    case "multiple_choice_question":
    case "mcq":
      return "mcq";
    case "true_false":
    case "truefalse":
      return "true_false";
    case "essay":
      return "essay";
    case "fill_blanks":
    case "fill_in_the_blanks":
    case "fill_in_blanks":
      return "fill_blanks";
    case "short_answer":
    case "shortanswer":
      return "short_answer";
    case "matching":
      return "matching";
    case "multiple_response":
    case "multiple_responses":
    case "select_all_that_apply":
      return "multiple_response";
    case "terminology":
    case "term":
    case "term_identification":
      return "terminology";
    case "definition":
    case "define":
      return "definition";
    case "comparison":
    case "compare":
      return "comparison";
    case "labeling":
    case "labelling":
    case "label":
    case "naming":
      return "labeling";
    case "classification":
    case "classify":
    case "categorization":
    case "categorisation":
      return "classification";
    case "sequencing":
    case "sequence":
    case "ordering":
    case "ordered_steps":
      return "sequencing";
    case "process_mechanism":
    case "mechanism":
    case "process":
    case "mechanism_explanation":
      return "process_mechanism";
    case "cause_effect":
    case "cause_and_effect":
    case "causal":
      return "cause_effect";
    case "distinguish_between":
    case "distinguish":
    case "differentiate":
      return "distinguish_between";
    case "identify_structure":
    case "structure_identification":
    case "identify_part":
      return "identify_structure";
    case "identify_compound":
    case "compound_identification":
    case "identify_molecule":
      return "identify_compound";
    default:
      return undefined;
  }
}

function normalizeProviderQuestionDifficulty(
  value: unknown,
): AssessmentDifficulty | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 1) {
      return "easy";
    }

    if (value >= 3) {
      return "hard";
    }

    return "medium";
  }

  const normalized = normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "easy" ||
    normalized === "beginner" ||
    normalized === "basic" ||
    normalized === "simple" ||
    normalized === "سهل" ||
    normalized === "سهل" ||
    normalized === "بسيط"
  ) {
    return "easy";
  }

  if (
    normalized === "hard" ||
    normalized === "difficult" ||
    normalized === "advanced" ||
    normalized === "challenging" ||
    normalized === "صعب" ||
    normalized === "عسير" ||
    normalized === "متقدم"
  ) {
    return "hard";
  }

  if (
    normalized === "medium" ||
    normalized === "intermediate" ||
    normalized === "moderate" ||
    normalized === "متوسط" ||
    normalized === "متوسطة" ||
    normalized === "متوسطه"
  ) {
    return "medium";
  }

  return undefined;
}

function buildQuestionTypePlan(
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

  return planned;
}

function expandQuestionTypeSequence(
  questionCount: number,
  distribution: AssessmentQuestionTypeDistribution[],
) {
  return buildQuestionTypePlan(questionCount, distribution).flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.type),
  );
}

function buildAssessmentTagList(topic: string, language: Locale) {
  const normalized = topic
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  if (normalized.length === 0) {
    return language === "ar" ? ["مراجعة"] : ["review"];
  }

  return [...new Set(normalized)].slice(0, 3);
}

function describeAssessmentExpectation(
  difficulty: AssessmentDifficulty,
  language: Locale,
) {
  if (language === "ar") {
    switch (difficulty) {
      case "easy":
        return "ابدأ بالتعريف الواضح ثم أضف مثالاً علمياً مباشراً";
      case "hard":
        return "حلّل الفكرة واربِطها بآلية أو أثر علمي أوسع";
      default:
        return "اشرح الفكرة ثم اربطها بتطبيق أو نتيجة علمية";
    }
  }

  switch (difficulty) {
    case "easy":
      return "Start with a clear definition, then give one direct scientific example";
    case "hard":
      return "Analyze the idea and connect it to a broader mechanism or implication";
    default:
      return "Explain the idea and connect it to a scientific application or outcome";
  }
}

function buildAssessmentQuestionCopy(input: {
  index: number;
  topic: string;
  difficulty: AssessmentDifficulty;
  language: Locale;
  type: AssessmentQuestionType;
}) {
  const expectation = describeAssessmentExpectation(
    input.difficulty,
    input.language,
  );

  if (input.language === "ar") {
    switch (input.type) {
      case "true_false":
        return {
          question: `السؤال ${input.index + 1} (صح / خطأ): ${input.topic} يعتمد على تفسير علمي واحد فقط دون أي سياق تطبيقي.`,
          answer: "الإجابة الصحيحة: خطأ. التفسير العلمي السليم يجب أن يربط الفكرة بالتطبيق أو الأثر العلمي.",
          rationale:
            "هذا النوع يقيس دقة التمييز بين العبارة المطلقة والتفسير العلمي المتوازن.",
        };
      case "essay":
        return {
          question: `السؤال ${input.index + 1} (مقالي): حلّل ${input.topic} في فقرة علمية منظمة توضّح الفكرة والآلية والأثر.`,
          answer: `محاور الإجابة: ${expectation}.`,
          rationale:
            "هذا النوع يقيس التحليل المنظم والقدرة على بناء إجابة علمية مترابطة.",
        };
      case "fill_blanks":
        return {
          question: `السؤال ${input.index + 1} (أكمل الفراغ): يوضّح مفهوم ${input.topic} أن ________ يؤثر مباشرة في ________ داخل السياق العلمي.`,
          answer: "الإجابة النموذجية: العامل أو الآلية العلمية المناسبة ثم النتيجة أو المتغير المتأثر.",
          rationale:
            "هذا النوع يختبر استرجاع المصطلح والعلاقة العلمية الأساسية بدقة.",
        };
      case "short_answer":
        return {
          question: `السؤال ${input.index + 1} (إجابة قصيرة): ما الفكرة الأساسية في ${input.topic}؟`,
          answer: `إجابة نموذجية قصيرة: ${expectation}.`,
          rationale:
            "هذا النوع يقيس القدرة على تلخيص الفكرة العلمية مباشرة دون إطالة.",
        };
      case "matching":
        return {
          question: `السؤال ${input.index + 1} (توصيل):\nأ. المفهوم\nب. الآلية\nج. الأثر\n\n1. نتيجة قابلة للملاحظة\n2. تفسير علمي منظم\n3. عملية تربط السبب بالنتيجة\n\nوصّل ما يرتبط بـ ${input.topic}.`,
          answer: "الإجابة النموذجية: أ-2، ب-3، ج-1.",
          rationale:
            "هذا النوع يقيس الربط بين المفهوم العلمي ووظيفته أو أثره.",
        };
      case "multiple_response":
        return {
          question: `السؤال ${input.index + 1} (متعدد الإجابات): اختر كل العبارات الصحيحة حول ${input.topic}.\nأ. يرتبط بمفهوم علمي أساسي.\nب. لا يحتاج إلى أي تفسير أو تطبيق.\nج. يمكن ربطه بأثر أو نتيجة علمية.\nد. يدعم فهماً منظماً للمحتوى العلمي.`,
          answer: "الإجابة الصحيحة: أ، ج، د.",
          rationale:
            "هذا النوع يقيس التمييز بين أكثر من عبارة صحيحة في السياق العلمي.",
        };
      case "terminology":
        return {
          question: `السؤال ${input.index + 1} (مصطلحات): ما المصطلح العلمي الأدق الذي يعبّر عن ${input.topic}؟`,
          answer:
            "الإجابة النموذجية: اذكر المصطلح العلمي الدقيق ثم قدّم تعريفاً موجزاً يوضح معناه.",
          rationale:
            "هذا النوع يقيس دقة استرجاع المصطلح العلمي وربطه بالمعنى الصحيح.",
        };
      case "definition":
        return {
          question: `السؤال ${input.index + 1} (تعريف): عرّف ${input.topic} تعريفاً علمياً دقيقاً ومباشراً.`,
          answer:
            "الإجابة النموذجية: تعريف واضح للمفهوم مع خاصية علمية مميزة واحدة على الأقل.",
          rationale:
            "هذا النوع يقيس جودة بناء التعريف العلمي دون حشو.",
        };
      case "comparison":
        return {
          question: `السؤال ${input.index + 1} (مقارنة): قارن بين جانبين مرتبطين بـ ${input.topic} من حيث الفكرة والوظيفة العلمية.`,
          answer:
            "الإجابة النموذجية: أوجه تشابه واضحة + فروق أساسية مدعومة بتفسير علمي موجز.",
          rationale:
            "هذا النوع يقيس مهارة التمييز بين العناصر المتقاربة علمياً.",
        };
      case "labeling":
        return {
          question: `السؤال ${input.index + 1} (تسمية / وسم): حدّد الأسماء الصحيحة للأجزاء المرتبطة بـ ${input.topic} (أ، ب، ج).`,
          answer:
            "الإجابة النموذجية: أ-الجزء المناسب، ب-الجزء المناسب، ج-الجزء المناسب.",
          rationale:
            "هذا النوع يقيس دقة الربط بين البنية واسمها العلمي.",
        };
      case "classification":
        return {
          question: `السؤال ${input.index + 1} (تصنيف): صنّف الأمثلة المرتبطة بـ ${input.topic} ضمن فئات علمية مناسبة.`,
          answer:
            "الإجابة النموذجية: فئة 1: ... | فئة 2: ... مع مبرر تصنيفي مختصر.",
          rationale:
            "هذا النوع يقيس القدرة على تنظيم المعرفة وفق قواعد تصنيف علمية.",
        };
      case "sequencing":
        return {
          question: `السؤال ${input.index + 1} (تسلسل): رتّب مراحل ${input.topic} بالترتيب الصحيح.`,
          answer:
            "الإجابة النموذجية: 1) المرحلة الأولى 2) المرحلة الثانية 3) المرحلة الثالثة.",
          rationale:
            "هذا النوع يقيس فهم ترتيب المراحل أو الأحداث العلمية زمنياً أو وظيفياً.",
        };
      case "process_mechanism":
        return {
          question: `السؤال ${input.index + 1} (عملية / آلية): اشرح آلية ${input.topic} خطوة بخطوة.`,
          answer:
            "الإجابة النموذجية: عرض متسلسل للمراحل مع توضيح العلاقة بين كل مرحلة والتي تليها.",
          rationale:
            "هذا النوع يقيس الفهم السببي والميكانيكي للظواهر العلمية.",
        };
      case "cause_effect":
        return {
          question: `السؤال ${input.index + 1} (سبب ونتيجة): اربط سبباً رئيسياً في ${input.topic} بنتيجة علمية مباشرة.`,
          answer:
            "الإجابة النموذجية: السبب -> النتيجة مع توضيح الرابط العلمي بإيجاز.",
          rationale:
            "هذا النوع يقيس القدرة على تحديد العلاقات السببية بدقة.",
        };
      case "distinguish_between":
        return {
          question: `السؤال ${input.index + 1} (ميّز بين): ميّز بين مفهومين متقاربين ضمن ${input.topic}.`,
          answer:
            "الإجابة النموذجية: عرض الفروق الجوهرية في التعريف أو الوظيفة أو السياق العلمي.",
          rationale:
            "هذا النوع يقيس الدقة المفاهيمية عند التفريق بين مصطلحات متشابهة.",
        };
      case "identify_structure":
        return {
          question: `السؤال ${input.index + 1} (تحديد بنية): حدّد البنية أو الجزء العلمي المرتبط بوظيفة أساسية ضمن ${input.topic}.`,
          answer:
            "الإجابة النموذجية: اسم البنية + ميزة تعريفية تؤكد صحة التحديد.",
          rationale:
            "هذا النوع يقيس التعرف البنيوي بناءً على الوظيفة أو الوصف العلمي.",
        };
      case "identify_compound":
        return {
          question: `السؤال ${input.index + 1} (تحديد مركب): حدّد المركب أو المادة الأنسب بناءً على خصائص مرتبطة بـ ${input.topic}.`,
          answer:
            "الإجابة النموذجية: اسم المركب + خاصية أو دليل علمي يدعم الاختيار.",
          rationale:
            "هذا النوع يقيس مهارة التعرف على المركبات من الصفات أو السلوك العلمي.",
        };
      default:
        return {
          question: `السؤال ${input.index + 1} (اختيار متعدد): ما أفضل تفسير علمي لـ ${input.topic}؟\nأ. وصف عام غير دقيق\nب. ${expectation}\nج. معلومة غير مرتبطة بالسياق\nد. نتيجة بلا تفسير`,
          answer: "الإجابة الصحيحة: ب.",
          rationale:
            "هذا النوع يقيس اختيار التفسير العلمي الأدق من بين بدائل متقاربة.",
        };
    }
  }

  switch (input.type) {
    case "true_false":
      return {
        question: `Question ${input.index + 1} (True / False): ${input.topic} can be explained accurately without any scientific context.`,
        answer: "Correct answer: False. A reliable explanation should connect the concept to scientific context or application.",
        rationale:
          "This item checks whether the learner can reject an oversimplified scientific claim.",
      };
    case "essay":
      return {
        question: `Question ${input.index + 1} (Essay): Analyze ${input.topic} in a structured scientific paragraph covering the idea, mechanism, and implication.`,
        answer: `Expected points: ${expectation}.`,
        rationale:
          "This item measures analytical writing and scientific organization.",
      };
    case "fill_blanks":
      return {
        question: `Question ${input.index + 1} (Fill in the blanks): The concept of ${input.topic} shows that ______ directly influences ______ in a scientific system.`,
        answer: "Model answer: complete the blanks with the relevant mechanism and affected outcome.",
        rationale:
          "This item checks precise recall of a core scientific relationship.",
      };
    case "short_answer":
      return {
        question: `Question ${input.index + 1} (Short answer): What is the key idea behind ${input.topic}?`,
        answer: `Model answer: ${expectation}.`,
        rationale:
          "This item rewards a direct, concise scientific explanation.",
      };
    case "matching":
      return {
        question: `Question ${input.index + 1} (Matching):\nA. Concept\nB. Mechanism\nC. Outcome\n\n1. Observable result\n2. Structured scientific explanation\n3. Process linking cause and effect\n\nMatch each item to ${input.topic}.`,
        answer: "Correct answer: A-2, B-3, C-1.",
        rationale:
          "This item checks whether the learner can connect scientific parts to their roles.",
      };
    case "multiple_response":
      return {
        question: `Question ${input.index + 1} (Multiple response): Select all correct statements about ${input.topic}.\nA. It connects to a core scientific idea.\nB. It never needs explanation or application.\nC. It can be linked to a scientific outcome.\nD. It supports structured scientific understanding.`,
        answer: "Correct answers: A, C, and D.",
        rationale:
          "This item checks whether the learner can identify more than one scientifically valid statement.",
      };
    case "terminology":
      return {
        question: `Question ${input.index + 1} (Terminology): What is the most accurate scientific term for ${input.topic}?`,
        answer:
          "Model answer: provide the exact term and one concise scientific meaning.",
        rationale:
          "This item checks precision in term recall and concept naming.",
      };
    case "definition":
      return {
        question: `Question ${input.index + 1} (Definition): Define ${input.topic} in a precise scientific sentence.`,
        answer:
          "Model answer: a technically accurate definition with one distinguishing feature.",
        rationale:
          "This item checks whether the learner can formulate a reliable scientific definition.",
      };
    case "comparison":
      return {
        question: `Question ${input.index + 1} (Comparison): Compare two aspects related to ${input.topic} using at least two scientific criteria.`,
        answer:
          "Model answer: clear similarities and key differences with concise scientific support.",
        rationale:
          "This item checks comparative reasoning between closely related scientific ideas.",
      };
    case "labeling":
      return {
        question: `Question ${input.index + 1} (Labeling / Naming): Assign correct names to the labeled parts (A, B, C) related to ${input.topic}.`,
        answer:
          "Model answer: A-name, B-name, C-name with accurate scientific naming.",
        rationale:
          "This item checks whether the learner can map labels to the correct structures/components.",
      };
    case "classification":
      return {
        question: `Question ${input.index + 1} (Classification): Classify examples related to ${input.topic} into the most suitable scientific categories.`,
        answer:
          "Model answer: grouped categories with a short rationale for each grouping.",
        rationale:
          "This item checks conceptual organization and rule-based scientific grouping.",
      };
    case "sequencing":
      return {
        question: `Question ${input.index + 1} (Sequencing): Arrange the stages of ${input.topic} in the correct order.`,
        answer:
          "Model answer: 1) first stage 2) second stage 3) third stage.",
        rationale:
          "This item checks understanding of ordered scientific progression.",
      };
    case "process_mechanism":
      return {
        question: `Question ${input.index + 1} (Process / Mechanism): Explain the mechanism behind ${input.topic} step by step.`,
        answer:
          "Model answer: an ordered mechanism showing how each stage leads to the next.",
        rationale:
          "This item checks mechanistic understanding beyond memorized facts.",
      };
    case "cause_effect":
      return {
        question: `Question ${input.index + 1} (Cause and effect): Identify one major cause in ${input.topic} and its direct scientific effect.`,
        answer:
          "Model answer: cause -> effect with a brief scientific link.",
        rationale:
          "This item checks causal reasoning and relationship accuracy.",
      };
    case "distinguish_between":
      return {
        question: `Question ${input.index + 1} (Distinguish between): Distinguish between two closely related concepts within ${input.topic}.`,
        answer:
          "Model answer: key differentiating points in definition, function, or context.",
        rationale:
          "This item checks conceptual discrimination between similar scientific terms.",
      };
    case "identify_structure":
      return {
        question: `Question ${input.index + 1} (Identify structure): Identify the structure/part linked to a key function in ${input.topic}.`,
        answer:
          "Model answer: structure name plus one identifying scientific feature.",
        rationale:
          "This item checks structure recognition from function or description.",
      };
    case "identify_compound":
      return {
        question: `Question ${input.index + 1} (Identify compound): Identify the compound/substance from properties related to ${input.topic}.`,
        answer:
          "Model answer: compound name and one supporting property or clue.",
        rationale:
          "This item checks compound identification from scientific evidence.",
      };
    default:
      return {
        question: `Question ${input.index + 1} (MCQ): Which option best explains ${input.topic}?\nA. A vague statement without scientific grounding\nB. ${expectation}\nC. An unrelated claim\nD. An outcome without explanation`,
        answer: "Correct answer: B.",
        rationale:
          "This item rewards selection of the most scientifically accurate explanation.",
      };
  }
}

function buildFallbackAssessmentQuestions(input: {
  prompt: string;
  orchestrationPrompt: string;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
  documentContext?: string | null;
}): AssessmentQuestion[] {
  const source = [
    ...splitPromptIntoFragments(input.prompt),
    ...splitPromptIntoFragments(input.documentContext || ""),
    ...splitPromptIntoFragments(input.orchestrationPrompt),
  ].filter((item, index, items) => items.indexOf(item) === index);

  const fallbackTopics = source.length > 0
    ? source
    : [
        input.language === "ar"
          ? "المراجعة العلمية الأساسية"
          : "core scientific review",
      ];
  const questionTypeSequence = expandQuestionTypeSequence(
    input.questionCount,
    input.questionTypeDistribution,
  );

  return Array.from({ length: input.questionCount }, (_, index) => {
    const topic = fallbackTopics[index % fallbackTopics.length]!;
    const type = questionTypeSequence[index] ?? "mcq";
    const copy = buildAssessmentQuestionCopy({
      index,
      topic,
      difficulty: input.difficulty,
      language: input.language,
      type,
    });
    const structuredData = resolveAssessmentQuestionStructuredData({
      questionType: type,
      questionText: copy.question,
      answerText: copy.answer,
      rationaleText: copy.rationale,
    });

    return {
      id: `q-${index + 1}`,
      type,
      difficulty: input.difficulty,
      question: copy.question,
      answer: copy.answer,
      rationale: copy.rationale,
      tags: buildAssessmentTagList(topic, input.language),
      structuredData,
    };
  });
}

function stripCodeFences(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractJsonPayload(value: string) {
  const stripped = stripCodeFences(value);
  const firstObjectBrace = stripped.indexOf("{");
  const lastObjectBrace = stripped.lastIndexOf("}");

  if (
    firstObjectBrace !== -1 &&
    lastObjectBrace !== -1 &&
    lastObjectBrace > firstObjectBrace
  ) {
    return stripped.slice(firstObjectBrace, lastObjectBrace + 1);
  }

  const firstArrayBrace = stripped.indexOf("[");
  const lastArrayBrace = stripped.lastIndexOf("]");

  if (
    firstArrayBrace !== -1 &&
    lastArrayBrace !== -1 &&
    lastArrayBrace > firstArrayBrace
  ) {
    return stripped.slice(firstArrayBrace, lastArrayBrace + 1);
  }

  return stripped;
}

function parseProviderAssessmentPayload(value: string): ProviderAssessmentPayload {
  const parsed = JSON.parse(extractJsonPayload(value)) as unknown;

  if (Array.isArray(parsed)) {
    return {
      questions: parsed as ProviderAssessmentQuestion[],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Assessment provider response was not a JSON object.");
  }

  return parsed as ProviderAssessmentPayload;
}

function normalizeProviderTags(
  tags: ProviderAssessmentQuestion["tags"],
  language: Locale,
) {
  if (Array.isArray(tags)) {
    const normalized = tags
      .map((tag) => normalizeWhitespace(String(tag || "")))
      .filter(Boolean)
      .slice(0, 3);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof tags === "string") {
    const normalized = normalizeWhitespace(tags);
    if (normalized) {
      return normalized
        .split(/[،,|/]+/)
        .map((tag) => normalizeWhitespace(tag))
        .filter(Boolean)
        .slice(0, 3);
    }
  }

  return language === "ar" ? ["مراجعة"] : ["review"];
}

function buildProviderStructuredDataPayload(
  question: ProviderAssessmentQuestion,
): Record<string, unknown> | undefined {
  const source = question.structuredData;
  const sourceRecord =
    source && typeof source === "object" ? (source as Record<string, unknown>) : undefined;

  return {
    ...(sourceRecord ?? {}),
    expectedTerm: question.expectedTerm ?? sourceRecord?.expectedTerm,
    acceptableVariants:
      question.acceptableVariants ?? sourceRecord?.acceptableVariants,
    concept: question.concept ?? sourceRecord?.concept,
    expectedDefinition:
      question.expectedDefinition ?? sourceRecord?.expectedDefinition,
    leftEntity: question.leftEntity ?? sourceRecord?.leftEntity,
    rightEntity: question.rightEntity ?? sourceRecord?.rightEntity,
    comparisonPoints:
      question.comparisonPoints ?? sourceRecord?.comparisonPoints,
    target: question.target ?? sourceRecord?.target,
    expectedLabel: question.expectedLabel ?? sourceRecord?.expectedLabel,
    categories: question.categories ?? sourceRecord?.categories,
    items: question.items ?? sourceRecord?.items,
    itemCategoryPairs:
      question.itemCategoryPairs ?? sourceRecord?.itemCategoryPairs,
    orderedSteps: question.orderedSteps ?? sourceRecord?.orderedSteps,
    processName: question.processName ?? sourceRecord?.processName,
    stages: question.stages ?? sourceRecord?.stages,
    cause: question.cause ?? sourceRecord?.cause,
    effect: question.effect ?? sourceRecord?.effect,
    subjectA: question.subjectA ?? sourceRecord?.subjectA,
    subjectB: question.subjectB ?? sourceRecord?.subjectB,
    distinctionPoints:
      question.distinctionPoints ?? sourceRecord?.distinctionPoints,
    expectedStructure:
      question.expectedStructure ?? sourceRecord?.expectedStructure,
    expectedCompound:
      question.expectedCompound ?? sourceRecord?.expectedCompound,
    explanatoryNote:
      question.explanatoryNote ?? sourceRecord?.explanatoryNote,
  };
}

function normalizeProviderQuestion(input: {
  question: ProviderAssessmentQuestion | string;
  fallback: AssessmentQuestion;
  index: number;
  language: Locale;
}): AssessmentQuestion {
  if (typeof input.question === "string") {
    const normalizedQuestion =
      normalizeMultilineWhitespace(input.question) || input.fallback.question;

    return {
      ...input.fallback,
      id: `q-${input.index + 1}`,
      difficulty: input.fallback.difficulty,
      question: normalizedQuestion,
      structuredData: resolveAssessmentQuestionStructuredData({
        questionType: input.fallback.type,
        structuredData: input.fallback.structuredData,
        questionText: normalizedQuestion,
        answerText: input.fallback.answer,
        rationaleText: input.fallback.rationale,
      }),
    } satisfies AssessmentQuestion;
  }

  const resolvedType =
    normalizeAssessmentQuestionType(input.question.type) ?? input.fallback.type;
  const normalizedQuestion =
    normalizeMultilineWhitespace(String(input.question.question || "")) ||
    input.fallback.question;
  const normalizedAnswer =
    normalizeMultilineWhitespace(String(input.question.answer || "")) ||
    input.fallback.answer;
  const normalizedRationale =
    normalizeMultilineWhitespace(String(input.question.rationale || "")) ||
    input.fallback.rationale;
  const structuredData = resolveAssessmentQuestionStructuredData({
    questionType: resolvedType,
    structuredData: buildProviderStructuredDataPayload(input.question),
    questionText: normalizedQuestion,
    answerText: normalizedAnswer,
    rationaleText: normalizedRationale,
  });

  return {
    id: `q-${input.index + 1}`,
    type: resolvedType,
    difficulty:
      normalizeProviderQuestionDifficulty(
        input.question.difficulty ??
          input.question.difficulty_level ??
          input.question.level,
      ) ?? input.fallback.difficulty,
    question: normalizedQuestion,
    answer: normalizedAnswer,
    rationale: normalizedRationale,
    tags: normalizeProviderTags(input.question.tags, input.language),
    structuredData,
  } satisfies AssessmentQuestion;
}

function buildNormalizedAssessmentQuestions(input: {
  payload: ProviderAssessmentPayload;
  prompt: string;
  orchestrationPrompt: string;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
  documentContext?: string | null;
}) {
  const fallbackQuestions = buildFallbackAssessmentQuestions({
    prompt: input.prompt,
    orchestrationPrompt: input.orchestrationPrompt,
    questionCount: input.questionCount,
    difficulty: input.difficulty,
    language: input.language,
    questionTypeDistribution: input.questionTypeDistribution,
    documentContext: input.documentContext,
  });

  const providerQuestions = Array.isArray(input.payload.questions)
    ? input.payload.questions
    : [];

  if (providerQuestions.length === 0) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected model returned an invalid assessment format.",
      502,
    );
  }

  const normalizedQuestions = providerQuestions
    .slice(0, input.questionCount)
    .map((question, index) =>
      normalizeProviderQuestion({
        question,
        fallback: fallbackQuestions[index]!,
        index,
        language: input.language,
      }),
    );

  while (normalizedQuestions.length < input.questionCount) {
    normalizedQuestions.push(fallbackQuestions[normalizedQuestions.length]!);
  }

  return normalizedQuestions;
}

function extractQwenContentText(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return normalizeWhitespace(part);
        }

        if (!part || typeof part !== "object") {
          return "";
        }

        const payload = part as { text?: unknown; content?: unknown };
        return normalizeWhitespace(String(payload.text ?? payload.content ?? ""));
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

type ProviderErrorSnapshot = {
  httpStatus: number;
  providerCode: string;
  providerType: string;
  providerMessage: string;
};

function normalizeProviderErrorToken(value: unknown) {
  return normalizeWhitespace(String(value || "")).toLowerCase();
}

function toProviderErrorSnapshot(input: {
  status: number;
  statusText: string;
  payload: unknown;
}): ProviderErrorSnapshot {
  const root =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;
  const nested =
    root?.error && typeof root.error === "object"
      ? (root.error as Record<string, unknown>)
      : root;

  const providerCode = normalizeProviderErrorToken(nested?.code);
  const providerType = normalizeProviderErrorToken(
    nested?.status ?? nested?.type,
  );
  const providerMessage =
    normalizeMultilineWhitespace(String(nested?.message || "")) ||
    normalizeMultilineWhitespace(String(root?.message || "")) ||
    normalizeWhitespace(`${input.status} ${input.statusText}`);

  return {
    httpStatus: input.status,
    providerCode,
    providerType,
    providerMessage,
  };
}

async function readProviderErrorSnapshot(response: Response) {
  const rawBody = await response.text().catch(() => "");
  let payload: unknown = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = {
        message: rawBody,
      };
    }
  }

  return toProviderErrorSnapshot({
    status: response.status,
    statusText: response.statusText,
    payload,
  });
}

function isAbortError(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "name" in value && String(value.name) === "AbortError";
}

function buildProviderTimeoutError(providerLabel: "Google" | "Qwen") {
  return new AssessmentExecutionError(
    "ASSESSMENT_PROVIDER_TIMEOUT",
    `The selected ${providerLabel} model did not respond before the request timeout.`,
    504,
  );
}

function isProviderModelUnavailableError(snapshot: ProviderErrorSnapshot) {
  const message = snapshot.providerMessage.toLowerCase();

  return (
    snapshot.httpStatus === 404 ||
    snapshot.providerType.includes("not_found") ||
    snapshot.providerCode.includes("model_not_found") ||
    snapshot.providerCode.includes("model_not_supported") ||
    (message.includes("model") &&
      (message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("unsupported")))
  );
}

/* This provider classifier keeps user-facing failures stable while splitting actionable
   infrastructure causes (auth, throttling, timeout, model mismatch) from generic runtime
   failures so routes and QA can distinguish transient outages from configuration issues. */
function buildProviderExecutionError(input: {
  providerLabel: "Google" | "Qwen";
  snapshot: ProviderErrorSnapshot;
}) {
  const { snapshot } = input;
  const message = snapshot.providerMessage.toLowerCase();
  const code = snapshot.providerCode;
  const type = snapshot.providerType;

  if (
    snapshot.httpStatus === 401 ||
    snapshot.httpStatus === 403 ||
    code.includes("invalid_api_key") ||
    code.includes("access_denied") ||
    message.includes("api key") ||
    message.includes("not authorized")
  ) {
    return new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_AUTH_FAILED",
      `The selected ${input.providerLabel} model runtime is not authorized to execute this request.`,
      503,
    );
  }

  if (
    snapshot.httpStatus === 429 ||
    code.includes("throttling") ||
    code.includes("limit") ||
    code.includes("quota") ||
    code.includes("insufficient_quota") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("quota")
  ) {
    return new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RATE_LIMITED",
      `The selected ${input.providerLabel} model is rate limited right now.`,
      429,
    );
  }

  if (
    snapshot.httpStatus === 408 ||
    snapshot.httpStatus === 504 ||
    code.includes("timeout") ||
    type.includes("deadline_exceeded") ||
    type.includes("requesttimeout") ||
    message.includes("timed out") ||
    message.includes("timeout")
  ) {
    return buildProviderTimeoutError(input.providerLabel);
  }

  if (isProviderModelUnavailableError(snapshot)) {
    return new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_MISCONFIGURED",
      `The configured ${input.providerLabel} model id is unavailable for the current provider runtime.`,
      503,
    );
  }

  return new AssessmentExecutionError(
    "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
    `The selected ${input.providerLabel} model could not complete the assessment request right now.`,
    502,
  );
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildInfographicSvg(input: {
  topic: string;
  style: InfographicRequest["style"];
  modelLabel: string;
  promptSummary: string;
}) {
  const title = escapeSvgText(input.topic);
  const subtitle = escapeSvgText(input.promptSummary.slice(0, 120));
  const accent =
    input.style === "bold" ? "#0f766e" : input.style === "balanced" ? "#15803d" : "#0f766e";
  const surface = input.style === "academic" ? "#ecfeff" : "#f0fdf4";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="${surface}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="720" rx="40" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="600" rx="32" fill="white" stroke="${accent}" stroke-width="4" />
  <circle cx="170" cy="160" r="52" fill="${accent}" opacity="0.12" />
  <circle cx="1030" cy="560" r="72" fill="${accent}" opacity="0.12" />
  <text x="120" y="170" fill="#0f172a" font-size="52" font-family="Arial, sans-serif" font-weight="700">${title}</text>
  <text x="120" y="230" fill="#334155" font-size="24" font-family="Arial, sans-serif">${escapeSvgText(input.modelLabel)}</text>
  <text x="120" y="300" fill="#0f172a" font-size="28" font-family="Arial, sans-serif">Key message</text>
  <text x="120" y="348" fill="#475569" font-size="24" font-family="Arial, sans-serif">${subtitle}</text>
  <rect x="120" y="410" width="420" height="160" rx="24" fill="#f8fafc" />
  <rect x="580" y="410" width="500" height="160" rx="24" fill="#f8fafc" />
  <text x="150" y="465" fill="${accent}" font-size="24" font-family="Arial, sans-serif">Structure</text>
  <text x="150" y="510" fill="#334155" font-size="22" font-family="Arial, sans-serif">1. Define the concept clearly</text>
  <text x="150" y="545" fill="#334155" font-size="22" font-family="Arial, sans-serif">2. Highlight the scientific mechanism</text>
  <text x="150" y="580" fill="#334155" font-size="22" font-family="Arial, sans-serif">3. Show a practical implication</text>
  <text x="610" y="465" fill="${accent}" font-size="24" font-family="Arial, sans-serif">Presentation note</text>
  <text x="610" y="510" fill="#334155" font-size="22" font-family="Arial, sans-serif">Use short bullets and strong visual hierarchy.</text>
  <text x="610" y="545" fill="#334155" font-size="22" font-family="Arial, sans-serif">This SVG is a local fallback while provider runtime is</text>
  <text x="610" y="580" fill="#334155" font-size="22" font-family="Arial, sans-serif">still being connected to external AI generation.</text>
</svg>`.trim();
}

async function executeGoogleAssessmentModel(input: {
  runtime: ReturnType<typeof resolveProviderRuntime>;
  prompt: string;
  temperature: number;
  directFile?: AssessmentDirectFileInput;
}) {
  if (input.runtime.provider !== "google") {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_MISCONFIGURED",
      "The selected model was routed to the wrong provider runtime.",
      500,
    );
  }

  if (!input.runtime.configured || !input.runtime.apiKey) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_NOT_CONFIGURED",
      "The selected model runtime is not configured on the server yet.",
      503,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${input.runtime.endpoint}/models/${encodeURIComponent(input.runtime.providerModel)}:generateContent?key=${encodeURIComponent(input.runtime.apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                ...(input.directFile
                  ? [
                      {
                        inline_data: {
                          mime_type: input.directFile.mimeType,
                          data: input.directFile.buffer.toString("base64"),
                        },
                      },
                    ]
                  : []),
                {
                  text: input.prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: input.temperature,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw buildProviderTimeoutError("Google");
    }

    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Google model could not complete the assessment request right now.",
      502,
    );
  }

  if (!response.ok) {
    const snapshot = await readProviderErrorSnapshot(response);
    throw buildProviderExecutionError({
      providerLabel: "Google",
      snapshot,
    });
  }

  let payload: GoogleProviderResponse;

  try {
    payload = (await response.json()) as GoogleProviderResponse;
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Google model returned an unreadable response.",
      502,
    );
  }

  const responseText = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => normalizeWhitespace(String(part.text || "")))
    .filter(Boolean)
    .join("\n");

  if (!responseText) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Google model returned an empty assessment response.",
      502,
    );
  }

  try {
    return parseProviderAssessmentPayload(responseText);
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Google model returned an invalid assessment format.",
      502,
    );
  }
}

async function executeQwenAssessmentModel(input: {
  runtime: ReturnType<typeof resolveProviderRuntime>;
  prompt: string;
  temperature: number;
}) {
  if (input.runtime.provider !== "qwen") {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_MISCONFIGURED",
      "The selected model was routed to the wrong provider runtime.",
      500,
    );
  }

  if (!input.runtime.apiKey) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_NOT_CONFIGURED",
      "The selected Qwen model is not configured on the server yet.",
      503,
    );
  }

  if (!input.runtime.baseUrl) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_MISCONFIGURED",
      `Qwen assessment runtime is missing a DashScope-compatible base URL. Configure one of: ${QWEN_BASE_URL_ENV_HINT}.`,
      503,
    );
  }

  const qwenClient = createQwenClient({
    baseUrl: input.runtime.baseUrl,
    apiKey: input.runtime.apiKey,
  });

  let response: Response;

  try {
    response = await qwenClient.createChatCompletion(
      {
        model: input.runtime.providerModel,
        temperature: input.temperature,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: QWEN_ASSESSMENT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: input.prompt,
          },
        ],
      },
      AbortSignal.timeout(90_000),
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw buildProviderTimeoutError("Qwen");
    }

    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Qwen model could not complete the assessment request right now.",
      502,
    );
  }

  if (!response.ok) {
    const snapshot = await readProviderErrorSnapshot(response);
    throw buildProviderExecutionError({
      providerLabel: "Qwen",
      snapshot,
    });
  }

  let payload: QwenOpenAiCompatibleChatCompletionResponse;

  try {
    payload = (await response.json()) as QwenOpenAiCompatibleChatCompletionResponse;
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Qwen model returned an unreadable response.",
      502,
    );
  }

  const responseText = extractQwenContentText(payload.choices?.[0]?.message?.content);

  if (!responseText) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Qwen model returned an empty assessment response.",
      502,
    );
  }

  try {
    return parseProviderAssessmentPayload(responseText);
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
      "The selected Qwen model returned an invalid assessment format.",
      502,
    );
  }
}

const LEGACY_ASSESSMENT_MODEL_ID_ALIASES: Record<string, string> = {
  "google-balanced": "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite": "gemini-3.1-flash-lite-preview",
  "google-advanced": "gemini-2.5-pro",
  "qwen-balanced": "qwen3.5-flash",
  "qwen-flash-us": "qwen3.5-flash",
};

function toCanonicalAssessmentModelId(modelId: string) {
  return LEGACY_ASSESSMENT_MODEL_ID_ALIASES[modelId] ?? modelId;
}

// Keep per-model routing explicit so future agents can audit which runtime
// path each Assessment option takes without reverse-engineering shared helpers.
async function executeAssessmentModel(input: {
  model: AiModelDescriptor;
  runtime: ReturnType<typeof resolveProviderRuntime>;
  prompt: string;
  directFile?: AssessmentDirectFileInput;
}) {
  switch (input.model.id) {
    case "gemini-3.1-flash-lite-preview":
      return executeGoogleAssessmentModel({
        runtime: input.runtime,
        prompt: input.prompt,
        temperature: 0.2,
        directFile: input.directFile,
      });
    case "gemini-2.5-pro":
      return executeGoogleAssessmentModel({
        runtime: input.runtime,
        prompt: input.prompt,
        temperature: 0.3,
        directFile: input.directFile,
      });
    case "gemini-2.5-flash":
      return executeGoogleAssessmentModel({
        runtime: input.runtime,
        prompt: input.prompt,
        temperature: 0.25,
        directFile: input.directFile,
      });
    case "qwen3.5-flash":
      return executeQwenAssessmentModel({
        runtime: input.runtime,
        prompt: input.prompt,
        temperature: 0.25,
      });
    default:
      throw new AssessmentExecutionError(
        "ASSESSMENT_MODEL_UNSUPPORTED",
        "The selected assessment model is not supported by the live server runtime.",
        400,
      );
  }
}

export async function generateAssessment(input: {
  ownerUid: string;
  ownerRole?: AssessmentGeneration["ownerRole"];
  request: AssessmentRequest;
  documentContext?: string | null;
  sourceDocument?: AssessmentGenerationSourceDocument | null;
  inputMode?: AssessmentInputMode;
  directFile?: AssessmentDirectFileInput;
  generationId?: string;
}): Promise<AssessmentGeneration> {
  const canonicalModelId = toCanonicalAssessmentModelId(input.request.modelId);
  const model = getModelById(canonicalModelId);
  const providerRuntime = resolveProviderRuntime(model.id);
  const canonicalRequest =
    canonicalModelId === input.request.modelId
      ? input.request
      : {
          ...input.request,
          modelId: canonicalModelId,
        };

  const orchestratedPrompt = buildAssessmentPrompt({
    userPrompt: canonicalRequest.prompt,
    modelLabel: model.label,
    mode: canonicalRequest.options.mode,
    language: canonicalRequest.options.language,
    questionCount: canonicalRequest.options.questionCount,
    difficulty: canonicalRequest.options.difficulty,
    questionTypes: canonicalRequest.options.questionTypes,
    questionTypeDistribution: canonicalRequest.options.questionTypeDistribution,
    documentContext: input.documentContext,
    inputMode: input.inputMode ?? (input.sourceDocument ? "text-context" : "prompt-only"),
    providerConfigured: providerRuntime.configured,
  });

  const providerPayload = await executeAssessmentModel({
    model,
    runtime: providerRuntime,
    prompt: orchestratedPrompt,
    directFile: input.directFile,
  });
  const timestamp = new Date().toISOString();
  /* Route-level idempotency can inject a deterministic generation id so replayed requests
     converge on one persisted record without double-consuming credits. */
  const generationId = input.generationId ?? randomUUID();
  const questions = buildNormalizedAssessmentQuestions({
    payload: providerPayload,
    prompt: canonicalRequest.prompt,
    orchestrationPrompt: orchestratedPrompt,
    questionCount: canonicalRequest.options.questionCount,
    difficulty: canonicalRequest.options.difficulty,
    language: canonicalRequest.options.language,
    questionTypeDistribution: canonicalRequest.options.questionTypeDistribution,
    documentContext: input.documentContext,
  });
  const providerSummary = normalizeWhitespace(String(providerPayload.summary || ""));

  return {
    id: generationId,
    ownerUid: input.ownerUid,
    ownerRole: input.ownerRole,
    title: buildAssessmentTitle({
      prompt: canonicalRequest.prompt,
      language: canonicalRequest.options.language,
      sourceDocument: input.sourceDocument ?? null,
    }),
    modelId: model.id,
    status: "ready",
    expiresAt: getAssessmentExpiryTimestamp(timestamp),
    previewRoute: buildAssessmentPreviewRoute(generationId),
    resultRoute: buildAssessmentResultRoute(generationId),
    request: canonicalRequest,
    questions,
    meta: {
      summary:
        providerSummary ||
        buildAssessmentSummary({
          prompt: canonicalRequest.prompt,
          mode: canonicalRequest.options.mode,
          questionCount: questions.length,
          difficulty: canonicalRequest.options.difficulty,
          language: canonicalRequest.options.language,
          sourceDocument: input.sourceDocument ?? null,
        }),
      questionCount: questions.length,
      difficulty: canonicalRequest.options.difficulty,
      language: canonicalRequest.options.language,
      mode: canonicalRequest.options.mode,
      questionTypes: canonicalRequest.options.questionTypes,
      questionTypeDistribution: canonicalRequest.options.questionTypeDistribution,
      modelLabel: model.label,
      provider: model.provider,
      inputMode: input.inputMode ?? (input.sourceDocument ? "text-context" : "prompt-only"),
      promptPreview: buildAssessmentPromptPreview(canonicalRequest.prompt),
      sourceDocument: input.sourceDocument ?? null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function generateInfographic(input: {
  ownerUid: string;
  ownerRole?: UserRole;
  request: InfographicRequest;
  documentContext?: string | null;
  sourceDocument?: InfographicGenerationSourceDocument | null;
}): Promise<InfographicGeneration> {
  const model = getModelById(input.request.modelId);
  const prompt = buildToolPrompt({
    tool: "infographic",
    userPrompt: input.request.topic,
    modelLabel: model.label,
    documentContext: input.documentContext,
    settings: {
      style: input.request.style,
    },
  });
  const createdAt = new Date().toISOString();
  const sourceDocument = input.sourceDocument ?? null;
  const inputMode = sourceDocument ? "text-context" : "prompt-only";

  const generation: InfographicGeneration = {
    id: randomUUID(),
    ownerUid: input.ownerUid,
    topic: input.request.topic,
    modelId: model.id,
    imageSvg: buildInfographicSvg({
      topic: input.request.topic,
      style: input.request.style,
      modelLabel: model.label,
      promptSummary: prompt,
    }),
    status: "ready",
    /* Keep infographic records explicitly lane-tagged so future tools/history/export paths
       can classify these outputs without guessing from route names or UI context. */
    meta: {
      toolName: "infographic",
      style: input.request.style,
      provider: model.provider,
      modelLabel: model.label,
      inputMode,
      sourceDocument,
      artifactType: "inline-svg",
    },
    createdAt,
    updatedAt: createdAt,
  };

  if (input.ownerRole) {
    generation.ownerRole = input.ownerRole;
  }

  return generation;
}
