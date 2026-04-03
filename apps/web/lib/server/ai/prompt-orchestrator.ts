import "server-only";

import type {
  AssessmentDifficulty,
  AssessmentInputMode,
  AssessmentMode,
  AssessmentQuestionType,
  AssessmentQuestionTypeDistribution,
  Locale,
} from "@zootopia/shared-types";

import { prepareAssessmentDocumentContext } from "@/lib/server/assessment-records";

type ToolKind = "assessment" | "infographic";

function describeAssessmentLanguage(language: Locale) {
  return language === "ar" ? "Arabic" : "English";
}

function describeAssessmentDifficulty(difficulty: AssessmentDifficulty) {
  switch (difficulty) {
    case "easy":
      return "foundational";
    case "hard":
      return "advanced";
    default:
      return "intermediate";
  }
}

function describeAssessmentMode(mode: AssessmentMode) {
  return mode === "exam_generation" ? "Exam Generation" : "Question Generation";
}

function describeAssessmentModeRule(mode: AssessmentMode) {
  return mode === "exam_generation"
    ? "Mode instructions: make the set feel like a formal exam with tighter phrasing, balanced coverage, and fewer giveaway cues."
    : "Mode instructions: optimize for clear standalone practice questions that support guided study and revision.";
}

function describeAssessmentInputMode(inputMode: AssessmentInputMode) {
  switch (inputMode) {
    case "pdf-file":
      return "Linked PDF file";
    case "text-context":
      return "Extracted text context";
    default:
      return "Prompt only";
  }
}

function describeAssessmentQuestionType(type: AssessmentQuestionType) {
  switch (type) {
    case "true_false":
      return "True / False";
    case "essay":
      return "Essay";
    case "fill_blanks":
      return "Fill in the blanks";
    case "short_answer":
      return "Short answer";
    case "matching":
      return "Matching";
    case "multiple_response":
      return "Multiple response";
    default:
      return "MCQ";
  }
}

function describeAssessmentQuestionTypeRule(type: AssessmentQuestionType) {
  switch (type) {
    case "true_false":
      return "True / False: present one clear statement; the answer must explicitly say True or False and explain why.";
    case "essay":
      return "Essay: ask for a structured analytical response; the answer should summarize the expected key points.";
    case "fill_blanks":
      return "Fill in the blanks: include one or more blanks inside the question text and provide the completed answer.";
    case "short_answer":
      return "Short answer: ask for a concise direct response in one to three sentences.";
    case "matching":
      return "Matching: provide two short lists or labeled pairs in the question text and give the correct mapping in the answer.";
    case "multiple_response":
      return "Multiple response: ask the learner to select all correct answers and identify every correct option in the answer.";
    default:
      return "MCQ: include four answer options labeled A-D inside the question text and identify the correct option in the answer.";
  }
}

function formatAssessmentQuestionTypeDistribution(
  distribution: AssessmentQuestionTypeDistribution[],
) {
  return distribution
    .map(
      (entry) =>
        `${describeAssessmentQuestionType(entry.type)}=${entry.percentage}%`,
    )
    .join(", ");
}

export function buildToolPrompt(input: {
  tool: ToolKind;
  userPrompt: string;
  modelLabel: string;
  documentContext?: string | null;
  settings?: Record<string, string | number>;
}) {
  const lines = [
    `Tool: ${input.tool}`,
    `Model lane: ${input.modelLabel}`,
  ];

  if (input.settings) {
    lines.push(
      `Settings: ${Object.entries(input.settings)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`,
    );
  }

  lines.push(`User request: ${input.userPrompt}`);

  if (input.documentContext) {
    lines.push(`Document context:\n${input.documentContext}`);
  }

  return lines.join("\n\n");
}

export function buildAssessmentPrompt(input: {
  userPrompt: string;
  modelLabel: string;
  mode: AssessmentMode;
  questionCount: number;
  difficulty: AssessmentDifficulty;
  language: Locale;
  questionTypes: AssessmentQuestionType[];
  questionTypeDistribution: AssessmentQuestionTypeDistribution[];
  documentContext?: string | null;
  inputMode: AssessmentInputMode;
  providerConfigured: boolean;
}) {
  const documentContext = prepareAssessmentDocumentContext(input.documentContext);
  const lines = [
    "Tool: assessment",
    `Model lane: ${input.modelLabel}`,
    `Output contract: Return exactly ${input.questionCount} assessment items.`,
    'JSON contract: Return valid JSON only with the shape {"summary": string, "questions": [{"type": string, "question": string, "answer": string, "rationale": string, "tags": string[]}]}',
    `Generation mode: ${describeAssessmentMode(input.mode)}`,
    `Language target: ${describeAssessmentLanguage(input.language)}`,
    `Difficulty target: ${describeAssessmentDifficulty(input.difficulty)}`,
    `Document input mode: ${describeAssessmentInputMode(input.inputMode)}`,
    `Question types: ${input.questionTypes
      .map((type) => describeAssessmentQuestionType(type))
      .join(", ")}`,
    `Question type distribution: ${formatAssessmentQuestionTypeDistribution(
      input.questionTypeDistribution,
    )}`,
    `Provider runtime configured: ${input.providerConfigured ? "yes" : "no"}`,
    "Authoring instructions: Keep the wording scientifically accurate, concise, and reliable. Each item must include a direct answer, a brief rationale, and one to three short topic tags.",
    describeAssessmentModeRule(input.mode),
    `User request: ${input.userPrompt}`,
    `Question type rules: ${input.questionTypes
      .map((type) => describeAssessmentQuestionTypeRule(type))
      .join(" ")}`,
  ];

  if (documentContext) {
    lines.push(`Document context:\n${documentContext}`);
  }

  return lines.join("\n\n");
}
