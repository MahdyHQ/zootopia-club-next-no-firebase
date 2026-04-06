import "server-only";

import {
  ASSESSMENT_QUESTION_TYPES,
  type AssessmentDifficulty,
  type AssessmentInputMode,
  type AssessmentMode,
  type AssessmentQuestionType,
  type AssessmentQuestionTypeDistribution,
  type Locale,
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
    case "terminology":
      return "Terminology";
    case "definition":
      return "Definition";
    case "comparison":
      return "Comparison";
    case "labeling":
      return "Labeling / Naming";
    case "classification":
      return "Classification";
    case "sequencing":
      return "Sequence ordering";
    case "process_mechanism":
      return "Process / Mechanism";
    case "cause_effect":
      return "Cause and effect";
    case "distinguish_between":
      return "Distinguish between";
    case "identify_structure":
      return "Identify structure";
    case "identify_compound":
      return "Identify compound";
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
    case "terminology":
      return "Terminology: ask for the exact scientific term from a clue, context, or definition; the answer must provide the term and a brief meaning.";
    case "definition":
      return "Definition: ask for a precise scientific definition; the answer must be concise and technically accurate.";
    case "comparison":
      return "Comparison: ask learners to compare two related concepts or entities using at least two criteria; the answer should clearly separate similarities and differences.";
    case "labeling":
      return "Labeling / Naming: ask the learner to label parts, components, or stages from textual cues; the answer should map each label to the correct name.";
    case "classification":
      return "Classification: ask learners to group items or cases into classes/categories; the answer should provide the classification mapping.";
    case "sequencing":
      return "Sequencing: ask for the correct order of stages or events; the answer should provide an explicitly ordered list.";
    case "process_mechanism":
      return "Process / Mechanism: ask for the mechanism or pathway behind a phenomenon; the answer should explain the process in ordered stages.";
    case "cause_effect":
      return "Cause and effect: ask for causal relationships; the answer should explicitly map causes to effects.";
    case "distinguish_between":
      return "Distinguish between: ask learners to differentiate similar terms/concepts; the answer should focus on discriminating features.";
    case "identify_structure":
      return "Identify structure: ask learners to identify an anatomical, cellular, or molecular structure from clues/functions; the answer should include the structure and a key identifying feature.";
    case "identify_compound":
      return "Identify compound: ask learners to identify a compound/substance from properties, formula clues, or behavior; the answer should include the compound name and short justification.";
    default:
      return "MCQ: include four answer options labeled A-D inside the question text and identify the correct option in the answer.";
  }
}

function describeAssessmentStructuredDataRule(type: AssessmentQuestionType) {
  switch (type) {
    case "terminology":
      return "terminology -> structuredData should include expectedTerm and optional acceptableVariants[].";
    case "definition":
      return "definition -> structuredData should include concept and expectedDefinition.";
    case "comparison":
      return "comparison -> structuredData should include leftEntity, rightEntity, and optional comparisonPoints[].";
    case "labeling":
      return "labeling -> structuredData should include target, expectedLabel, and optional itemCategoryPairs[].";
    case "classification":
      return "classification -> structuredData should include categories[] and itemCategoryPairs[] (item -> category).";
    case "sequencing":
      return "sequencing -> structuredData should include orderedSteps[] in the exact expected order.";
    case "process_mechanism":
      return "process_mechanism -> structuredData should include processName and stages[].";
    case "cause_effect":
      return "cause_effect -> structuredData should include cause and effect.";
    case "distinguish_between":
      return "distinguish_between -> structuredData should include subjectA, subjectB, and distinctionPoints[].";
    case "identify_structure":
      return "identify_structure -> structuredData should include target and expectedStructure, with optional explanatoryNote.";
    case "identify_compound":
      return "identify_compound -> structuredData should include target and expectedCompound, with optional explanatoryNote.";
    default:
      return `${type} -> structuredData is optional; include it only when there is reliable structure.`;
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
  const userRequest =
    input.userPrompt.trim() ||
    "No extra steering prompt was supplied. Infer the assessment focus from the linked document and generation settings.";
  const supportedTypeList = ASSESSMENT_QUESTION_TYPES.join(" | ");
  const supportedDifficultyList = "easy | medium | hard";
  const lines = [
    "Tool: assessment",
    `Model lane: ${input.modelLabel}`,
    `Output contract: Return exactly ${input.questionCount} assessment items.`,
    'JSON contract: Return valid JSON only with the shape {"summary": string, "questions": [{"type": string, "difficulty": string, "question": string, "answer": string, "rationale": string, "tags": string[], "structuredData": object}]}',
    `Type enum contract: type must be one of ${supportedTypeList}.`,
    `Difficulty enum contract: difficulty must be one of ${supportedDifficultyList}.`,
    "Strict metadata contract: every question object must include both type and difficulty; never omit either field.",
    "Structured metadata contract: include structuredData only when fields are genuinely supported by the question content; never invent values.",
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
     /* Rendering and export surfaces branch by question type and difficulty metadata.
       Keep this rule explicit so provider output stays structurally aligned with UI/PDF/DOCX
       contracts instead of degrading into MCQ-shaped generic text. */
    "Structure instructions: format each question according to its type (for example MCQ options, explicit True/False statements, essay prompts, blanks, matching pairs, terminology/definition prompts, comparison/classification tables, labeling maps, sequence/process steps, and cause-effect links) and keep answer/rationale aligned with that type.",
    /* Assessment preview, result, and export surfaces now preserve Unicode content end-to-end.
       Keep this orchestration rule explicit so tasteful emojis remain intentional output instead
       of being treated as accidental noise by future prompt or normalization changes. */
    "Presentation instructions: Tasteful, relevant emojis are welcome when they genuinely improve clarity, memory, or tone. Use them sparingly, keep them educationally appropriate, and preserve any emoji characters directly inside the JSON strings.",
    describeAssessmentModeRule(input.mode),
    // Keep an explicit fallback request in the orchestration prompt so document-only runs still produce focused assessments.
    `User request: ${userRequest}`,
    `Question type rules: ${input.questionTypes
      .map((type) => describeAssessmentQuestionTypeRule(type))
      .join(" ")}`,
    /* Science-type rendering/export parity depends on these field-level hints staying explicit.
       Keep them here so providers return structured metadata instead of degrading into text blobs. */
    `Structured data rules: ${input.questionTypes
      .map((type) => describeAssessmentStructuredDataRule(type))
      .join(" ")}`,
  ];

  if (documentContext) {
    lines.push(`Document context:\n${documentContext}`);
  }

  return lines.join("\n\n");
}
