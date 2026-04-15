export const ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET = 2;
export const ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET = 3;
/* The first file page has to share vertical space with the premium cover block. Keep a separate
   complexity budget here so extreme long-form cards can safely fallback to one card without
   sacrificing the normal/common two-card opening rhythm. */
/* Card geometry was tuned slightly larger again to reduce visual whitespace. Keep this budget a
  touch tighter so first-page overflow fallback still triggers early enough for dense content. */
const ASSESSMENT_FILE_FIRST_PAGE_COMPLEXITY_BUDGET = 3120;
/* Keep later pages on the shared three-question rhythm in normal/common files while still
  allowing a rare fallback for unusually dense cards that would otherwise overlap in print/PDF. */
/* Following-page cards are also subtly larger now; this guard keeps the 3-card default while
  preventing footer-adjacent crowding when content density spikes unexpectedly. */
const ASSESSMENT_FILE_PAGE_COMPLEXITY_BUDGET = 3760;

function chunkItems<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function partitionAssessmentFileQuestions<T extends AssessmentFileQuestionLike>(questions: readonly T[]) {
  /* Detached preview/result pages and the shared print renderer must follow the same page-slot
     contract: page one targets two questions, and later question pages target three. Keep that
     chunking rule centralized here so future layout refinements do not desynchronize the React
     file surface from the Fast/Pro export HTML foundation. */
  const firstPageCandidateQuestions = questions.slice(0, ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET);
  const firstPageComplexity = firstPageCandidateQuestions.reduce(
    (sum, question) => sum + estimateQuestionComplexity(question),
    0,
  );
  const firstPageUsesOverflowFallback =
    firstPageCandidateQuestions.length === ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET &&
    firstPageComplexity > ASSESSMENT_FILE_FIRST_PAGE_COMPLEXITY_BUDGET;
  const firstPageQuestions = firstPageUsesOverflowFallback
    ? questions.slice(0, ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET - 1)
    : firstPageCandidateQuestions;
  const followingQuestions = questions.slice(firstPageQuestions.length);

  return {
    firstPageQuestions,
    firstPageUsesOverflowFallback,
    followingQuestionPages: chunkItems(
      followingQuestions,
      ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET,
    ),
  };
}

type AssessmentFileScienceBlockLike = {
  kind: "value" | "pair" | "list" | "pair-list";
  label: string;
  value?: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  items?: string[];
  pairs?: Array<{
    left: string;
    right: string;
  }>;
};

type AssessmentFileQuestionLike = {
  stem: string;
  sectionHeading?: string | null;
  startsSection?: boolean;
  questionType?: string | null;
  typeLabel?: string | null;
  difficultyLabel?: string | null;
  choices: Array<{ text: string }>;
  scienceBlocks?: AssessmentFileScienceBlockLike[];
  supplementalLines: string[];
  answerDisplay: string;
  rationale: string | null;
  tags: string[];
};

const ASSESSMENT_FILE_MULTILINE_COMPLEXITY_BONUS = 120;
const ASSESSMENT_FILE_LABEL_COMPLEXITY = 88;
const ASSESSMENT_FILE_DIFFICULTY_BADGE_COMPLEXITY = 112;
const ASSESSMENT_FILE_CHOICE_ROW_COMPLEXITY = 52;
const ASSESSMENT_FILE_SUPPLEMENTAL_LINE_COMPLEXITY = 36;
const ASSESSMENT_FILE_ANSWER_CARD_COMPLEXITY = 112;
const ASSESSMENT_FILE_RATIONALE_CARD_COMPLEXITY = 104;
const ASSESSMENT_FILE_TAG_COMPLEXITY = 26;
const ASSESSMENT_FILE_TRUE_FALSE_COMPLEXITY = 176;
const ASSESSMENT_FILE_FILL_BLANKS_COMPLEXITY = 88;
const ASSESSMENT_FILE_MATCHING_COMPLEXITY = 216;
const ASSESSMENT_FILE_MULTIPLE_RESPONSE_COMPLEXITY = 168;
const ASSESSMENT_FILE_SCIENCE_BLOCK_COMPLEXITY = 160;
const ASSESSMENT_FILE_SCIENCE_LIST_ITEM_COMPLEXITY = 64;
const ASSESSMENT_FILE_SCIENCE_PAIR_ITEM_COMPLEXITY = 90;
const ASSESSMENT_FILE_SECTION_HEADING_COMPLEXITY = 172;

function estimateTextComplexity(text: string | null | undefined) {
  if (!text) {
    return 0;
  }

  const normalizedText = text.trim();
  if (!normalizedText) {
    return 0;
  }

  const lineBreakCount = normalizedText.match(/\n/g)?.length ?? 0;

  return normalizedText.length + lineBreakCount * ASSESSMENT_FILE_MULTILINE_COMPLEXITY_BONUS;
}

function estimateScienceBlockComplexity(block: AssessmentFileScienceBlockLike) {
  /* The shared pagination budget must count the structured science blocks that preview/print/PDF
     cards can render beneath the stem. If future agents add richer block kinds without updating
     this helper, dense cards can look safe on paper yet still push the page footer onto the next
     sheet during export. */
  const baseComplexity =
    ASSESSMENT_FILE_SCIENCE_BLOCK_COMPLEXITY + estimateTextComplexity(block.label);

  switch (block.kind) {
    case "value":
      return baseComplexity + estimateTextComplexity(block.value);
    case "pair":
      return (
        baseComplexity +
        ASSESSMENT_FILE_SCIENCE_PAIR_ITEM_COMPLEXITY +
        estimateTextComplexity(block.leftLabel) +
        estimateTextComplexity(block.leftValue) +
        estimateTextComplexity(block.rightLabel) +
        estimateTextComplexity(block.rightValue)
      );
    case "list":
      return (
        baseComplexity +
        (block.items?.length ?? 0) * ASSESSMENT_FILE_SCIENCE_LIST_ITEM_COMPLEXITY +
        (block.items?.reduce((sum, item) => sum + estimateTextComplexity(item), 0) ?? 0)
      );
    case "pair-list":
      return (
        baseComplexity +
        (block.pairs?.length ?? 0) * ASSESSMENT_FILE_SCIENCE_PAIR_ITEM_COMPLEXITY +
        (block.pairs?.reduce(
          (sum, pair) =>
            sum + estimateTextComplexity(pair.left) + estimateTextComplexity(pair.right),
          0,
        ) ?? 0)
      );
    default:
      return baseComplexity;
  }
}

function estimateQuestionTypeComplexity(question: AssessmentFileQuestionLike) {
  switch (question.questionType) {
    case "true_false":
      return ASSESSMENT_FILE_TRUE_FALSE_COMPLEXITY;
    case "fill_blanks":
      return ASSESSMENT_FILE_FILL_BLANKS_COMPLEXITY;
    case "matching":
      return ASSESSMENT_FILE_MATCHING_COMPLEXITY;
    case "multiple_response":
      return question.choices.length === 0 ? ASSESSMENT_FILE_MULTIPLE_RESPONSE_COMPLEXITY : 0;
    default:
      return 0;
  }
}

function estimateQuestionComplexity(question: AssessmentFileQuestionLike) {
  /* Page-slot fallback is the shared contract that protects both detached preview pages and the
     Fast/Pro export renderer from footer spill. Count visible badges, structured detail cards,
     and multiline copy here so future card enrichments still trigger earlier fallback instead of
     silently letting the footer escape onto the following page. */
  return (
    (question.startsSection && question.sectionHeading
      ? ASSESSMENT_FILE_SECTION_HEADING_COMPLEXITY +
        estimateTextComplexity(question.sectionHeading)
      : 0) +
    estimateTextComplexity(question.stem) +
    (question.typeLabel ? ASSESSMENT_FILE_LABEL_COMPLEXITY + estimateTextComplexity(question.typeLabel) : 0) +
    (question.difficultyLabel
      ? ASSESSMENT_FILE_DIFFICULTY_BADGE_COMPLEXITY +
        estimateTextComplexity(question.difficultyLabel)
      : 0) +
    question.choices.reduce(
      (sum, choice) =>
        sum +
        ASSESSMENT_FILE_CHOICE_ROW_COMPLEXITY +
        estimateTextComplexity(choice.text),
      0,
    ) +
    question.supplementalLines.reduce(
      (sum, line) =>
        sum +
        ASSESSMENT_FILE_SUPPLEMENTAL_LINE_COMPLEXITY +
        estimateTextComplexity(line),
      0,
    ) +
    (question.answerDisplay
      ? ASSESSMENT_FILE_ANSWER_CARD_COMPLEXITY + estimateTextComplexity(question.answerDisplay)
      : 0) +
    (question.rationale
      ? ASSESSMENT_FILE_RATIONALE_CARD_COMPLEXITY + estimateTextComplexity(question.rationale)
      : 0) +
    question.tags.reduce(
      (sum, tag) => sum + ASSESSMENT_FILE_TAG_COMPLEXITY + estimateTextComplexity(tag),
      0,
    ) +
    estimateQuestionTypeComplexity(question) +
    (question.scienceBlocks?.reduce(
      (sum, block) => sum + estimateScienceBlockComplexity(block),
      0,
    ) ?? 0)
  );
}

function buildQuestionPageChunks<T extends AssessmentFileQuestionLike>(
  questions: readonly T[],
  targetCount: number,
) {
  const chunks: Array<{
    questions: T[];
    usesOverflowFallback: boolean;
  }> = [];
  let index = 0;

  while (index < questions.length) {
    const remaining = questions.length - index;
    const targetSlice = questions.slice(index, index + Math.min(targetCount, remaining));
    const targetComplexity = targetSlice.reduce(
      (sum, question) => sum + estimateQuestionComplexity(question),
      0,
    );

    if (targetSlice.length === targetCount && targetComplexity > ASSESSMENT_FILE_PAGE_COMPLEXITY_BUDGET) {
      const fallbackSlice = questions.slice(index, index + targetCount - 1);
      chunks.push({
        questions: [...fallbackSlice],
        usesOverflowFallback: true,
      });
      index += fallbackSlice.length;
      continue;
    }

    chunks.push({
      questions: [...targetSlice],
      usesOverflowFallback: false,
    });
    index += targetSlice.length;
  }

  return chunks;
}

export function buildAssessmentFileQuestionPages<T extends AssessmentFileQuestionLike>(
  questions: readonly T[],
) {
  const {
    firstPageQuestions,
    firstPageUsesOverflowFallback,
    followingQuestionPages,
  } = partitionAssessmentFileQuestions(questions);

  return [
    {
      questions: [...firstPageQuestions],
      usesOverflowFallback: firstPageUsesOverflowFallback,
    },
    ...buildQuestionPageChunks(
      followingQuestionPages.flat(),
      ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET,
    ),
  ].filter((page) => page.questions.length > 0);
}
