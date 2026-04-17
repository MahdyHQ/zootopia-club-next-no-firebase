import "server-only";

import {
  ASSESSMENT_PROMPT_CONTRACT_VERSION,
  ASSESSMENT_ACTIVE_QUESTION_TYPES,
  type AssessmentDifficulty,
  type AssessmentInputMode,
  type AssessmentMode,
  type AssessmentQuestionType,
  type AssessmentQuestionTypeDistribution,
  type Locale,
} from "@zootopia/shared-types";

import { prepareAssessmentDocumentContext } from "@/lib/server/assessment-records";

type ToolKind = "assessment" | "infographic";

function humanizeQuestionTypeId(type: AssessmentQuestionType) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
    case "mcq":
      return "MCQ";
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
    case "scientific_term":
      return "Scientific term";
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
      return "Process / mechanism";
    case "cause_effect":
      return "Cause and effect";
    case "distinguish_between":
      return "Distinguish between";
    case "identify_structure":
      return "Identify structure";
    case "identify_compound":
      return "Identify compound";
    default:
      return humanizeQuestionTypeId(type);
  }
}

function describeAssessmentQuestionTypeRule(type: AssessmentQuestionType) {
  switch (type) {
    case "mcq":
      return "MCQ: choices must contain exactly four ordered options labeled A-D, question must keep a clean stem, and answer must identify the exact correct choice marker + text from those choices.";
    case "true_false":
      return "True / False: present one clear statement and return a boolean-style answer contract (True or False), not an MCQ option list.";
    case "essay":
      return "Essay: return an open analytical prompt with a prose answer scaffold and no MCQ-style options.";
    case "fill_blanks":
      return "Fill in the blanks: include one or more blanks in the stem and return the completed text answer; keep blanks-specific structure and avoid MCQ option conversion.";
    case "short_answer":
      return "Short answer: ask for a concise direct response (one to three sentences) and keep a short-text answer contract, not MCQ.";
    case "matching":
      return "Matching: return matching-oriented content (pairs/associations) and a matching answer contract, not MCQ.";
    case "multiple_response":
      return "Multiple response: return a choice-based list where more than one option can be correct and mark each correct option explicitly.";
    case "terminology":
      return "Terminology: preserve terminology identity and return the scientific term with concise meaning; do not relabel as MCQ.";
    case "scientific_term":
      return "Scientific term: ask for the exact term from clue/context and return the precise term first, then a brief confirmation note; do not relabel as MCQ.";
    case "definition":
      return "Definition: ask for a precise scientific definition and return a concise technically accurate definition answer, not a choice-list answer.";
    case "comparison":
      return "Comparison: ask learners to compare two related entities with at least two criteria and keep comparison-oriented answer structure (similarities/differences), not MCQ.";
    case "labeling":
      return "Labeling: return labeling-oriented content with labeled parts and expected labels, not MCQ.";
    case "classification":
      return "Classification: return category/item classification content and category-mapping answer structure, not MCQ.";
    case "sequencing":
      return "Sequencing: return ordered-step content and ordered answer structure, not MCQ.";
    case "process_mechanism":
      return "Process / mechanism: return mechanism-oriented multi-step reasoning and ordered explanation, not MCQ.";
    case "cause_effect":
      return "Cause and effect: return explicit cause/effect structure and a causal answer contract, not MCQ.";
    case "distinguish_between":
      return "Distinguish between: return distinction-focused content with clear differentiating points, not MCQ.";
    case "identify_structure":
      return "Identify structure: return structure-identification content with expected structure details, not MCQ.";
    case "identify_compound":
      return "Identify compound: return compound-identification content with expected compound details, not MCQ.";
    default:
      return `${humanizeQuestionTypeId(type)}: keep this canonical type id unchanged and return a complete type-faithful object.`;
  }
}

function describeAssessmentStructuredDataRule(type: AssessmentQuestionType) {
  switch (type) {
    case "scientific_term":
      return "scientific_term -> structuredData should include expectedTerm and optional acceptableVariants[].";
    case "terminology":
      return "terminology -> structuredData should include expectedTerm and optional acceptableVariants[].";
    case "definition":
      return "definition -> structuredData should include concept and expectedDefinition.";
    case "comparison":
      return "comparison -> structuredData should include leftEntity, rightEntity, and optional comparisonPoints[].";
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
  const supportedTypeList = ASSESSMENT_ACTIVE_QUESTION_TYPES.join(" | ");
  const supportedDifficultyList = "easy | medium | hard";
  const lines = [
    "Tool: assessment",
    `Model lane: ${input.modelLabel}`,
    `Output contract: Return exactly ${input.questionCount} assessment items.`,
    `JSON contract version: ${ASSESSMENT_PROMPT_CONTRACT_VERSION}.`,
    'JSON contract: Return valid JSON only with the exact top-level shape {"contractVersion": string, "summary": string, "selectedQuestionTypes": string[], "requestedDistribution": [{"type": string, "percentage": number}], "questions": [{"type": string, "difficulty": string, "displayOrder": number, "sectionKey": string, "sectionTitle": string, "question": string, "choices": [{"marker": string, "text": string, "isCorrect": boolean}], "answer": string, "rationale": string, "tags": string[], "structuredData": object, "answerMetadata": object}]}',
    `ContractVersion rule: set contractVersion to ${ASSESSMENT_PROMPT_CONTRACT_VERSION}.`,
    "Summary contract: summary must be a meaningful lecture/document brief grounded in the provided prompt/context, not a generic placeholder.",
    "Summary length contract: write 3 to 5 full sentences with concrete learning focus (target roughly 220 to 420 characters) so compact cards render about 5 to 8 lines.",
    `Type enum contract: type must be one of ${supportedTypeList}.`,
    `Difficulty enum contract: difficulty must be one of ${supportedDifficultyList}.`,
    "Strict metadata contract: every question object must include both type and difficulty; never omit either field.",
    "Completeness contract: every question object must include question, choices, answer, rationale, and tags. Never return partial question objects, never drop a requested question, and never leave required arrays undefined.",
    "Type identity contract: preserve each question's canonical type exactly as generated for that item; never relabel non-MCQ items as MCQ and never collapse mixed-type output into one generic type.",
    "Choice-array contract: for MCQ or any other choice-based item, choices must contain the full ordered option list and must preserve every option exactly once. For non-choice question types, set choices to an empty array [].",
    "Choice-accuracy contract: if a question is choice-based, the answer must match the returned choices and the correct choice must be identifiable from both answer text and choices[].",
    "Anti-ambiguity contract: do not return ambiguous or partially typed objects; each question must be self-consistent for its own type-specific structure and answer format.",
    "Ordering contract: displayOrder must start at 1 and increase by 1 for each question.",
    "Grouping contract: sectionKey must equal the canonical type id and sectionTitle must be the human-readable label for that same type.",
    "Echo contract: selectedQuestionTypes and requestedDistribution must mirror the requested canonical ids/distribution exactly.",
    "Structured metadata contract: include structuredData only when fields are genuinely supported by the question content; never invent values.",
    "Answer metadata contract: answerMetadata is optional but should be an object when provided. Use it for stable fields such as expectedResponses or blankSlots; otherwise return an empty object.",
    "Renderer authority: do not invent renderVariant, exportVariant, or UI-only surface ids. The server derives renderer/export metadata from canonical type and structured data.",
    `Generation mode: ${describeAssessmentMode(input.mode)}`,
    `Language target: ${describeAssessmentLanguage(input.language)}`,
    `Difficulty target: ${describeAssessmentDifficulty(input.difficulty)}`,
    `Document input mode: ${describeAssessmentInputMode(input.inputMode)}`,
    `Selected canonical type ids: ${input.questionTypes.join(", ")}`,
    `Question types: ${input.questionTypes
      .map((type) => describeAssessmentQuestionType(type))
      .join(", ")}`,
    "Selection authority: selected canonical type ids are authoritative for final grouped rendering and export.",
    "Rendering filter contract: any question returned with an unsupported or unselected type will be ignored by the system.",
    "Type restriction: do not return additional question types outside the selected canonical ids.",
    `Canonical type distribution: ${input.questionTypeDistribution
      .map((entry) => `${entry.type}=${entry.percentage}%`)
      .join(", ")}`,
    `Question type distribution: ${formatAssessmentQuestionTypeDistribution(
      input.questionTypeDistribution,
    )}`,
    `Provider runtime configured: ${input.providerConfigured ? "yes" : "no"}`,
     "Authoring instructions: Keep the wording scientifically accurate, concise, and reliable. Each item must include a direct answer, a brief rationale, and one to three short topic tags.",
     /* Rendering and export surfaces branch by question type and difficulty metadata.
       Keep this rule explicit so provider output stays structurally aligned with UI/PDF/DOCX
       contracts instead of degrading into MCQ-shaped generic text. */
     "Structure instructions: format each question according to its selected type (for example MCQ options, explicit True/False statements, short-answer prompts, blank sentences, scientific-term prompts, terminology prompts, definition prompts, and comparison prompts) and keep answer/rationale aligned with that canonical type id. Choice-based questions must return both a clean question stem and a complete choices[] array in the same order.",
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
