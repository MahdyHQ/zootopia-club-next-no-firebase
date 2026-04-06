import type {
  AssessmentQuestionStructuredData,
  AssessmentQuestionStructuredPair,
  AssessmentQuestionType,
  Locale,
} from "@zootopia/shared-types";
import {
  normalizeMultilineWhitespace,
  normalizeWhitespace,
} from "@zootopia/shared-utils";

export interface AssessmentQuestionChoiceDisplay {
  marker: string | null;
  text: string;
  displayText: string;
}

export interface AssessmentQuestionChoiceDisplayState
  extends AssessmentQuestionChoiceDisplay {
  isCorrect: boolean;
}

export interface AssessmentQuestionDisplay {
  stem: string;
  choices: AssessmentQuestionChoiceDisplay[];
  choiceLayout: "stack" | "grid-2x2";
  supplementalLines: string[];
}

const CHOICE_MARKER_SCAN_PATTERN =
  /(?:[A-Za-z]|[0-9\u0660-\u0669\u06F0-\u06F9]{1,2}|[\u0621-\u064A])/gu;
const CHOICE_LINE_PATTERN =
  /^(?:(?<marker>(?:[A-Za-z]|[0-9\u0660-\u0669\u06F0-\u06F9]{1,2}|[\u0621-\u064A]))(?<separator>[.):-])|(?<bullet>[-*+]))\s+(?<text>.+)$/u;
const INLINE_CHOICE_PATTERN =
  /(?<marker>(?:[A-Za-z]|[0-9\u0660-\u0669\u06F0-\u06F9]{1,2}|[\u0621-\u064A]))(?<separator>[.):-])\s+/gu;
const ANSWER_PREFIX_PATTERN =
  /^(?:correct answers?|correct answer|model answer|answer|الإجابة الصحيحة|الإجابة النموذجية|الإجابة|محاور الإجابة)\s*[:：-]\s*/iu;
const FILL_BLANK_PATTERN = /_{2,}|\[\s*\.{2,}\s*\]|\(\s*\.{2,}\s*\)|\[\s*blank\s*\]/giu;
const STRUCTURED_LINE_SPLIT_PATTERN = /[\n;|]+/u;
const STRUCTURED_PAIR_PATTERN =
  /^(?<left>[^:=\-–—>]{1,120}?)\s*(?:->|=>|=|:|[-–—])\s*(?<right>[^\n]{1,160})$/u;
const NUMBERED_STEP_PREFIX_PATTERN =
  /^(?:\d{1,2}|[A-Za-z]|[\u0660-\u0669\u06F0-\u06F9]{1,2})[).:-]\s*/u;
const BULLET_STEP_PREFIX_PATTERN = /^[-*+]\s+/u;
const BINARY_COMPARISON_PATTERN =
  /\b(?:between|compare|distinguish(?:\s+between)?)\s+(?<left>[^\n.,;:!?]{1,80}?)\s+(?:and|vs\.?|versus)\s+(?<right>[^\n.,;:!?]{1,80})/iu;
const BINARY_COMPARISON_AR_PATTERN =
  /(?:بين|قارن\s+بين|مي[ّ']?ز\s+بين)\s+(?<left>[^\n،؛:؟!.]{1,80}?)\s+و\s+(?<right>[^\n،؛:؟!.]{1,80})/u;
const STRUCTURED_VALUE_MAX_LENGTH = 200;
const STRUCTURED_LIST_MAX_ITEMS = 8;

export type AssessmentTrueFalseValue = "true" | "false";

export interface AssessmentMatchingPair {
  left: string;
  right: string;
}

export type AssessmentScienceRenderBlockKind =
  | "value"
  | "pair"
  | "list"
  | "pair-list";

export interface AssessmentScienceRenderBlock {
  key: string;
  kind: AssessmentScienceRenderBlockKind;
  label: string;
  value?: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  items?: string[];
  pairs?: AssessmentQuestionStructuredPair[];
  ordered?: boolean;
}

function convertIndicDigitsToAscii(value: string) {
  return value
    .replace(/[\u0660-\u0669]/gu, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06F0-\u06F9]/gu, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    );
}

function normalizeChoiceMarker(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return convertIndicDigitsToAscii(value).toLowerCase();
}

function formatChoiceMarker(value: string) {
  return /^[A-Za-z]$/u.test(value) ? value.toUpperCase() : value;
}

function isChoiceBoundary(value: string | undefined) {
  return !value || /[\s([{:،؛,-]/u.test(value);
}

function buildChoiceDisplayText(marker: string | null, text: string) {
  return `${marker ? `${marker})` : "•"} ${text}`;
}

function createChoice(
  marker: string | null,
  text: string,
): AssessmentQuestionChoiceDisplay {
  const normalizedText = normalizeWhitespace(text);
  const displayMarker = marker ? formatChoiceMarker(marker) : null;

  return {
    marker: displayMarker,
    text: normalizedText,
    displayText: buildChoiceDisplayText(displayMarker, normalizedText),
  };
}

function getChoiceLayout(choices: AssessmentQuestionChoiceDisplay[]) {
  return choices.length === 4 &&
    choices.every((choice) => choice.displayText.length <= 96)
    ? "grid-2x2"
    : "stack";
}

function parseChoiceLine(value: string) {
  const match = value.trim().match(CHOICE_LINE_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const text = normalizeWhitespace(match.groups.text || "");
  if (!text) {
    return null;
  }

  return createChoice(match.groups.marker ?? null, text);
}

function deriveLineChoiceDisplay(questionText: string): AssessmentQuestionDisplay | null {
  const normalizedText = normalizeMultilineWhitespace(questionText);
  const normalizedLines = normalizedText.split("\n");
  const parsedChoiceLines = normalizedLines
    .map((line, index) => ({
      index,
      choice: parseChoiceLine(line),
    }))
    .filter(
      (
        entry,
      ): entry is { index: number; choice: AssessmentQuestionChoiceDisplay } =>
        Boolean(entry.choice),
    );

  if (parsedChoiceLines.length < 2) {
    return null;
  }

  const firstChoiceIndex = parsedChoiceLines[0]!.index;
  const stem = normalizedLines
    .slice(0, firstChoiceIndex)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  const choices: AssessmentQuestionChoiceDisplay[] = [];
  const supplementalLines: string[] = [];
  let reachedSupplementalCopy = false;

  /* Preview/result/PDF/DOCX/Markdown all depend on this display-only split.
     Keep it tolerant of both true multiline choices and trailing notes so the saved question text
     can stay canonical while every viewer/export surface gets the same structured hierarchy. */
  for (const rawLine of normalizedLines.slice(firstChoiceIndex)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parsedChoice = parseChoiceLine(line);
    if (!reachedSupplementalCopy && parsedChoice) {
      choices.push(parsedChoice);
      continue;
    }

    reachedSupplementalCopy = true;
    supplementalLines.push(line);
  }

  return {
    stem: stem || normalizedText,
    choices,
    choiceLayout: getChoiceLayout(choices),
    supplementalLines,
  };
}

function deriveInlineChoiceDisplay(questionText: string): AssessmentQuestionDisplay | null {
  const compactText = normalizeWhitespace(
    normalizeMultilineWhitespace(questionText).replace(/\n+/g, " "),
  );
  const matches: Array<{ index: number; afterIndex: number; marker: string }> = [];

  INLINE_CHOICE_PATTERN.lastIndex = 0;
  for (let match = INLINE_CHOICE_PATTERN.exec(compactText); match; match = INLINE_CHOICE_PATTERN.exec(compactText)) {
    const marker = match.groups?.marker;
    if (!marker) {
      continue;
    }

    if (!isChoiceBoundary(compactText[match.index - 1])) {
      continue;
    }

    matches.push({
      index: match.index,
      afterIndex: INLINE_CHOICE_PATTERN.lastIndex,
      marker,
    });
  }

  if (matches.length < 2) {
    return null;
  }

  const uniqueMarkers = new Set(
    matches.map((match) => normalizeChoiceMarker(match.marker)),
  );
  if (uniqueMarkers.size < 2) {
    return null;
  }

  const stem = compactText
    .slice(0, matches[0]!.index)
    .trim()
    .replace(/[.:;،-]+$/u, "")
    .trim();
  const choices = matches.map((match, index) => {
    const nextIndex = matches[index + 1]?.index ?? compactText.length;
    const text = compactText
      .slice(match.afterIndex, nextIndex)
      .trim()
      .replace(/[;،]+$/u, "")
      .trim();

    return text ? createChoice(match.marker, text) : null;
  });

  if (choices.some((choice) => !choice)) {
    return null;
  }

  return {
    stem: stem || compactText,
    choices: choices as AssessmentQuestionChoiceDisplay[],
    choiceLayout: getChoiceLayout(choices as AssessmentQuestionChoiceDisplay[]),
    supplementalLines: [],
  };
}

function collectAnswerChoiceMarkers(answerText: string) {
  const normalizedAnswer = normalizeMultilineWhitespace(answerText);
  const markers: string[] = [];
  const scanPattern = new RegExp(CHOICE_MARKER_SCAN_PATTERN);

  /* Answer resolution should only map explicit choice markers, not random single-letter words.
     Keep these boundary checks strict so MCQ answer labels become human-readable without corrupting
     essay, matching, or explanatory answer text on preview/result/export surfaces. */
  for (const match of normalizedAnswer.matchAll(scanPattern)) {
    const marker = match[0];
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }

    const previousCharacter = normalizedAnswer[index - 1];
    const nextCharacter = normalizedAnswer[index + marker.length];
    if (!isChoiceBoundary(previousCharacter)) {
      continue;
    }

    if (nextCharacter && !/[.),:;\-،]/u.test(nextCharacter)) {
      continue;
    }

    const normalizedMarker = normalizeChoiceMarker(marker);
    if (!normalizedMarker || markers.includes(normalizedMarker)) {
      continue;
    }

    markers.push(normalizedMarker);
  }

  return markers;
}

function stripAnswerPrefix(value: string) {
  return normalizeMultilineWhitespace(value).replace(ANSWER_PREFIX_PATTERN, "").trim();
}

function normalizeAssessmentAnswerToken(value: string) {
  return stripAnswerPrefix(value)
    .toLowerCase()
    .replace(/[\s\u200f\u200e]+/gu, " ")
    .trim();
}

function normalizeComparableText(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function createChoiceComparisonKey(choice: AssessmentQuestionChoiceDisplay) {
  return `${normalizeChoiceMarker(choice.marker) ?? ""}::${normalizeComparableText(choice.text)}`;
}

function resolveAnswerChoices(input: {
  answerText: string;
  choices: AssessmentQuestionChoiceDisplay[];
}) {
  if (input.choices.length === 0) {
    return [];
  }

  const normalizedAnswer = normalizeMultilineWhitespace(input.answerText);
  const choicesByMarker = new Map(
    input.choices
      .filter((choice) => choice.marker)
      .map((choice) => [normalizeChoiceMarker(choice.marker), choice] as const),
  );
  const resolvedByMarker = collectAnswerChoiceMarkers(normalizedAnswer)
    .map((marker) => choicesByMarker.get(marker) ?? null)
    .filter((choice): choice is AssessmentQuestionChoiceDisplay => Boolean(choice));

  if (resolvedByMarker.length > 0) {
    return resolvedByMarker;
  }

  const normalizedBareAnswer = normalizeComparableText(
    stripAnswerPrefix(normalizedAnswer),
  );
  if (!normalizedBareAnswer) {
    return [];
  }

  return input.choices.filter((choice) => {
    const choiceText = normalizeComparableText(choice.text);
    const choiceDisplayText = normalizeComparableText(choice.displayText);

    return (
      normalizedBareAnswer === choiceText ||
      normalizedBareAnswer === choiceDisplayText
    );
  });
}

export function deriveAssessmentQuestionDisplay(
  questionText: string,
): AssessmentQuestionDisplay {
  // The persisted assessment question string remains the canonical source of truth.
  // This helper owns the safe display/export interpretation layer that can split inline
  // or multiline MCQ choices into a professional hierarchy without rewriting stored data.
  return (
    deriveLineChoiceDisplay(questionText) ??
    deriveInlineChoiceDisplay(questionText) ?? {
      stem: normalizeMultilineWhitespace(questionText),
      choices: [],
      choiceLayout: "stack",
      supplementalLines: [],
    }
  );
}

export function annotateAssessmentCorrectChoices(input: {
  answerText: string;
  choices: AssessmentQuestionChoiceDisplay[];
}): AssessmentQuestionChoiceDisplayState[] {
  /* Preview/result/PDF choice highlighting must all resolve from the raw saved answer once.
     Keep this annotation step shared so every surface marks the same correct options without
     inventing separate heuristics or mutating the persisted assessment record. */
  const correctChoiceKeys = new Set(
    resolveAnswerChoices(input).map((choice) => createChoiceComparisonKey(choice)),
  );

  return input.choices.map((choice) => ({
    ...choice,
    isCorrect: correctChoiceKeys.has(createChoiceComparisonKey(choice)),
  }));
}

export function formatAssessmentAnswerDisplay(input: {
  answerText: string;
  questionType?: AssessmentQuestionType | null;
  choices: AssessmentQuestionChoiceDisplay[];
}) {
  // Answer cards and export files should resolve marker-only MCQ answers into the same
  // human-readable "B) Ecosystem" format wherever the choice text is safely available.
  // Preserve the raw saved answer for storage/API truth, but keep display surfaces readable.
  const normalizedAnswer = normalizeMultilineWhitespace(input.answerText);
  if (input.choices.length === 0) {
    return normalizedAnswer;
  }

  const resolvedChoices = resolveAnswerChoices({
    answerText: input.answerText,
    choices: input.choices,
  });

  if (input.questionType === "multiple_response" && resolvedChoices.length > 0) {
    return resolvedChoices.map((choice) => choice.displayText).join(", ");
  }

  if (
    (input.questionType === "mcq" || input.questionType == null) &&
    resolvedChoices.length === 1
  ) {
    return resolvedChoices[0]!.displayText;
  }

  if (input.questionType === "mcq" || input.questionType == null) {
    const resolvedChoiceByText = resolvedChoices[0];

    if (resolvedChoiceByText) {
      return resolvedChoiceByText.displayText;
    }
  }

  return normalizedAnswer;
}

export function resolveTrueFalseAnswerValue(answerText: string): AssessmentTrueFalseValue | null {
  const normalized = normalizeAssessmentAnswerToken(answerText);
  if (!normalized) {
    return null;
  }

  const startsWithTrue = /^(?:true|صح|صحيح|صواب)\b/u.test(normalized);
  const startsWithFalse = /^(?:false|خطأ|خاطئ|غلط)\b/u.test(normalized);

  if (startsWithTrue) {
    return "true";
  }

  if (startsWithFalse) {
    return "false";
  }

  const hasTrue = /\b(?:true|صح|صحيح|صواب)\b/u.test(normalized);
  const hasFalse = /\b(?:false|خطأ|خاطئ|غلط)\b/u.test(normalized);

  if (hasTrue && !hasFalse) {
    return "true";
  }

  if (hasFalse && !hasTrue) {
    return "false";
  }

  return null;
}

export function countFillBlanks(questionStem: string) {
  const matches = normalizeMultilineWhitespace(questionStem).match(FILL_BLANK_PATTERN);
  return matches?.length ?? 0;
}

export function extractMatchingPairs(value: string): AssessmentMatchingPair[] {
  const normalized = stripAnswerPrefix(value);
  if (!normalized) {
    return [];
  }

  const pairPattern = /^(?<left>[^:=\-–—>]{1,80}?)\s*(?:->|=>|=|:|[-–—])\s*(?<right>[^\n]{1,140})$/u;
  const pairs: AssessmentMatchingPair[] = [];
  const seen = new Set<string>();

  /* Matching answers can arrive as line-based mappings (A-1, term -> definition, etc.).
     Keep extraction tolerant but bounded so preview/result/export surfaces can present a clean
     pair table without rewriting the canonical stored answer text. */
  for (const segment of normalized.split(/[\n,؛;]/u)) {
    const line = normalizeWhitespace(segment);
    if (!line) {
      continue;
    }

    const match = line.match(pairPattern);
    if (!match?.groups) {
      continue;
    }

    const left = normalizeWhitespace(match.groups.left || "");
    const right = normalizeWhitespace(match.groups.right || "");
    if (!left || !right) {
      continue;
    }

    const key = `${left}::${right}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    pairs.push({ left, right });
  }

  return pairs;
}

export function splitMultipleResponseAnswers(value: string) {
  return stripAnswerPrefix(value)
    .split(/[،,;\n]+/u)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}
