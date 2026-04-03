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
  InfographicRequest,
  Locale,
} from "@zootopia/shared-types";
import { normalizeWhitespace } from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { getModelById } from "@/lib/ai/models";
import {
  buildAssessmentPrompt,
  buildToolPrompt,
} from "@/lib/server/ai/prompt-orchestrator";
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
  DASHSCOPE_US_COMPATIBLE_BASE_URL,
  resolveProviderRuntime,
} from "@/lib/server/ai/provider-runtime";
import type { AssessmentDirectFileInput } from "@/lib/server/assessment-linked-document";

type AssessmentExecutionErrorCode =
  | "ASSESSMENT_MODEL_UNSUPPORTED"
  | "ASSESSMENT_PROVIDER_NOT_CONFIGURED"
  | "ASSESSMENT_PROVIDER_MISCONFIGURED"
  | "ASSESSMENT_PROVIDER_EXECUTION_FAILED"
  | "ASSESSMENT_PROVIDER_RESPONSE_INVALID";

type ProviderAssessmentQuestion = {
  type?: string;
  question?: string;
  answer?: string;
  rationale?: string;
  tags?: string[] | string;
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

type QwenProviderResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
};

export class AssessmentExecutionError extends Error {
  constructor(
    public readonly code: AssessmentExecutionErrorCode,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "AssessmentExecutionError";
  }
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
        item.startsWith("Language target") ||
        item.startsWith("Difficulty target") ||
        item.startsWith("Provider runtime configured") ||
        item.startsWith("Authoring instructions") ||
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
    default:
      return undefined;
  }
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

    return {
      id: `q-${index + 1}`,
      type,
      question: copy.question,
      answer: copy.answer,
      rationale: copy.rationale,
      tags: buildAssessmentTagList(topic, input.language),
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

function normalizeProviderQuestion(input: {
  question: ProviderAssessmentQuestion | string;
  fallback: AssessmentQuestion;
  index: number;
  language: Locale;
}) {
  if (typeof input.question === "string") {
    return {
      ...input.fallback,
      id: `q-${input.index + 1}`,
      question:
        normalizeWhitespace(input.question) || input.fallback.question,
    } satisfies AssessmentQuestion;
  }

  return {
    id: `q-${input.index + 1}`,
    type:
      normalizeAssessmentQuestionType(input.question.type) ?? input.fallback.type,
    question:
      normalizeWhitespace(String(input.question.question || "")) ||
      input.fallback.question,
    answer:
      normalizeWhitespace(String(input.question.answer || "")) ||
      input.fallback.answer,
    rationale:
      normalizeWhitespace(String(input.question.rationale || "")) ||
      input.fallback.rationale,
    tags: normalizeProviderTags(input.question.tags, input.language),
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
      .map((part) => normalizeWhitespace(String(part?.text || "")))
      .filter(Boolean)
      .join("\n");
  }

  return "";
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
      "The selected Google model is not configured on the server yet.",
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
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Google model could not complete the assessment request right now.",
      502,
    );
  }

  if (!response.ok) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Google model could not complete the assessment request right now.",
      502,
    );
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

  if (!input.runtime.configured || !input.runtime.apiKey) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_NOT_CONFIGURED",
      "The selected Qwen model is not configured on the server yet.",
      503,
    );
  }

  if (!input.runtime.baseUrlValid) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_MISCONFIGURED",
      `Qwen assessment runtime must use the DashScope US (Virginia) endpoint at ${DASHSCOPE_US_COMPATIBLE_BASE_URL}.`,
      503,
    );
  }

  let response: Response;

  try {
    response = await fetch(`${input.runtime.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${input.runtime.apiKey}`,
      },
      body: JSON.stringify({
        model: input.runtime.providerModel,
        temperature: input.temperature,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              "You generate scientifically reliable assessment questions and must respond with valid JSON only.",
          },
          {
            role: "user",
            content: input.prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Qwen model could not complete the assessment request right now.",
      502,
    );
  }

  if (!response.ok) {
    throw new AssessmentExecutionError(
      "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
      "The selected Qwen model could not complete the assessment request right now.",
      502,
    );
  }

  let payload: QwenProviderResponse;

  try {
    payload = (await response.json()) as QwenProviderResponse;
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

// Keep per-model routing explicit so future agents can audit which runtime
// path each Assessment option takes without reverse-engineering shared helpers.
async function executeAssessmentModel(input: {
  model: AiModelDescriptor;
  prompt: string;
  directFile?: AssessmentDirectFileInput;
}) {
  const runtime = resolveProviderRuntime(input.model.id);

  switch (input.model.id) {
    case "gemini-3.1-flash-lite-preview":
      return executeGoogleAssessmentModel({
        runtime,
        prompt: input.prompt,
        temperature: 0.2,
        directFile: input.directFile,
      });
    case "gemini-2.5-pro":
      return executeGoogleAssessmentModel({
        runtime,
        prompt: input.prompt,
        temperature: 0.3,
        directFile: input.directFile,
      });
    case "gemini-2.5-flash":
      return executeGoogleAssessmentModel({
        runtime,
        prompt: input.prompt,
        temperature: 0.25,
        directFile: input.directFile,
      });
    case "gemini-2.5-flash-lite":
      return executeGoogleAssessmentModel({
        runtime,
        prompt: input.prompt,
        temperature: 0.2,
        directFile: input.directFile,
      });
    case "qwen3.5-flash":
      return executeQwenAssessmentModel({
        runtime,
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
  request: AssessmentRequest;
  documentContext?: string | null;
  sourceDocument?: AssessmentGenerationSourceDocument | null;
  inputMode?: AssessmentInputMode;
  directFile?: AssessmentDirectFileInput;
}): Promise<AssessmentGeneration> {
  const model = getModelById(input.request.modelId);
  const orchestratedPrompt = buildAssessmentPrompt({
    userPrompt: input.request.prompt,
    modelLabel: model.label,
    mode: input.request.options.mode,
    language: input.request.options.language,
    questionCount: input.request.options.questionCount,
    difficulty: input.request.options.difficulty,
    questionTypes: input.request.options.questionTypes,
    questionTypeDistribution: input.request.options.questionTypeDistribution,
    documentContext: input.documentContext,
    inputMode: input.inputMode ?? (input.sourceDocument ? "text-context" : "prompt-only"),
    providerConfigured: resolveProviderRuntime(model.id).configured,
  });
  const providerPayload = await executeAssessmentModel({
    model,
    prompt: orchestratedPrompt,
    directFile: input.directFile,
  });
  const timestamp = new Date().toISOString();
  const generationId = randomUUID();
  const questions = buildNormalizedAssessmentQuestions({
    payload: providerPayload,
    prompt: input.request.prompt,
    orchestrationPrompt: orchestratedPrompt,
    questionCount: input.request.options.questionCount,
    difficulty: input.request.options.difficulty,
    language: input.request.options.language,
    questionTypeDistribution: input.request.options.questionTypeDistribution,
    documentContext: input.documentContext,
  });
  const providerSummary = normalizeWhitespace(String(providerPayload.summary || ""));

  return {
    id: generationId,
    ownerUid: input.ownerUid,
    title: buildAssessmentTitle(
      input.request.prompt,
      input.request.options.language,
    ),
    modelId: model.id,
    status: "ready",
    expiresAt: getAssessmentExpiryTimestamp(timestamp),
    previewRoute: buildAssessmentPreviewRoute(generationId),
    resultRoute: buildAssessmentResultRoute(generationId),
    request: input.request,
    questions,
    meta: {
      summary:
        providerSummary ||
        buildAssessmentSummary({
          prompt: input.request.prompt,
          mode: input.request.options.mode,
          questionCount: questions.length,
          difficulty: input.request.options.difficulty,
          language: input.request.options.language,
          sourceDocument: input.sourceDocument ?? null,
        }),
      questionCount: questions.length,
      difficulty: input.request.options.difficulty,
      language: input.request.options.language,
      mode: input.request.options.mode,
      questionTypes: input.request.options.questionTypes,
      questionTypeDistribution: input.request.options.questionTypeDistribution,
      modelLabel: model.label,
      provider: model.provider,
      inputMode: input.inputMode ?? (input.sourceDocument ? "text-context" : "prompt-only"),
      promptPreview: buildAssessmentPromptPreview(input.request.prompt),
      sourceDocument: input.sourceDocument ?? null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function generateInfographic(input: {
  ownerUid: string;
  request: InfographicRequest;
  documentContext?: string | null;
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

  return {
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
    createdAt: new Date().toISOString(),
  };
}
