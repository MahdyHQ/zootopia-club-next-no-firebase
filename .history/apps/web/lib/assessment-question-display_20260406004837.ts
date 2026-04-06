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

function localizeScienceLabel(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function normalizeStructuredString(value: unknown) {
  const normalized = normalizeWhitespace(String(value || ""));
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= STRUCTURED_VALUE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, STRUCTURED_VALUE_MAX_LENGTH - 1).trimEnd()}...`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

function normalizeStructuredList(value: unknown) {
  if (Array.isArray(value)) {
    return dedupeStrings(
      value
        .map((item) => normalizeStructuredString(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, STRUCTURED_LIST_MAX_ITEMS),
    );
  }

  if (typeof value === "string") {
    return dedupeStrings(
      value
        .split(STRUCTURED_LINE_SPLIT_PATTERN)
        .flatMap((segment) => segment.split(/[،,]+/u))
        .map((item) => normalizeStructuredString(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, STRUCTURED_LIST_MAX_ITEMS),
    );
  }

  return [];
}

function normalizeStructuredPair(value: unknown): AssessmentQuestionStructuredPair | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    left?: unknown;
    right?: unknown;
    item?: unknown;
    category?: unknown;
    label?: unknown;
    value?: unknown;
  };
  const left = normalizeStructuredString(item.left ?? item.item ?? item.label);
  const right = normalizeStructuredString(item.right ?? item.category ?? item.value);

  if (!left || !right) {
    return null;
  }

  return {
    left,
    right,
  };
}

function normalizeStructuredPairs(value: unknown) {
  const normalized: AssessmentQuestionStructuredPair[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const pair = normalizeStructuredPair(item);
      if (!pair) {
        continue;
      }

      normalized.push(pair);
    }
  }

  if (typeof value === "string") {
    const extracted = extractMatchingPairs(value);
    for (const pair of extracted) {
      normalized.push(pair);
    }
  }

  if (normalized.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const deduped: AssessmentQuestionStructuredPair[] = [];
  for (const pair of normalized) {
    const key = `${pair.left}::${pair.right}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(pair);
  }

  return deduped.slice(0, STRUCTURED_LIST_MAX_ITEMS);
}

function buildStructuredDataFromSource(source: AssessmentQuestionStructuredData) {
  const normalized: AssessmentQuestionStructuredData = {};

  if (source.expectedTerm) {
    normalized.expectedTerm = source.expectedTerm;
  }

  if (source.acceptableVariants && source.acceptableVariants.length > 0) {
    normalized.acceptableVariants = source.acceptableVariants;
  }

  if (source.concept) {
    normalized.concept = source.concept;
  }

  if (source.expectedDefinition) {
    normalized.expectedDefinition = source.expectedDefinition;
  }

  if (source.leftEntity) {
    normalized.leftEntity = source.leftEntity;
  }

  if (source.rightEntity) {
    normalized.rightEntity = source.rightEntity;
  }

  if (source.comparisonPoints && source.comparisonPoints.length > 0) {
    normalized.comparisonPoints = source.comparisonPoints;
  }

  if (source.target) {
    normalized.target = source.target;
  }

  if (source.expectedLabel) {
    normalized.expectedLabel = source.expectedLabel;
  }

  if (source.categories && source.categories.length > 0) {
    normalized.categories = source.categories;
  }

  if (source.items && source.items.length > 0) {
    normalized.items = source.items;
  }

  if (source.itemCategoryPairs && source.itemCategoryPairs.length > 0) {
    normalized.itemCategoryPairs = source.itemCategoryPairs;
  }

  if (source.orderedSteps && source.orderedSteps.length > 0) {
    normalized.orderedSteps = source.orderedSteps;
  }

  if (source.processName) {
    normalized.processName = source.processName;
  }

  if (source.stages && source.stages.length > 0) {
    normalized.stages = source.stages;
  }

  if (source.cause) {
    normalized.cause = source.cause;
  }

  if (source.effect) {
    normalized.effect = source.effect;
  }

  if (source.subjectA) {
    normalized.subjectA = source.subjectA;
  }

  if (source.subjectB) {
    normalized.subjectB = source.subjectB;
  }

  if (source.distinctionPoints && source.distinctionPoints.length > 0) {
    normalized.distinctionPoints = source.distinctionPoints;
  }

  if (source.expectedStructure) {
    normalized.expectedStructure = source.expectedStructure;
  }

  if (source.expectedCompound) {
    normalized.expectedCompound = source.expectedCompound;
  }

  if (source.explanatoryNote) {
    normalized.explanatoryNote = source.explanatoryNote;
  }

  return normalized;
}

function extractLabeledValue(value: string, labels: string[]) {
  const lines = normalizeMultilineWhitespace(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`^${escapedLabel}\\s*[:：-]\\s*(.+)$`, "iu");
      const match = line.match(pattern);
      if (!match) {
        continue;
      }

      const normalized = normalizeStructuredString(match[1]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function extractLabeledList(value: string, labels: string[]) {
  const labeledValue = extractLabeledValue(value, labels);
  if (!labeledValue) {
    return [];
  }

  return normalizeStructuredList(labeledValue);
}

function extractFirstMeaningfulSegment(value: string) {
  const normalized = stripAnswerPrefix(value);
  if (!normalized) {
    return undefined;
  }

  const firstLine = normalized.split("\n").find((line) => line.trim().length > 0) ?? "";
  const firstSentence = firstLine.split(/[.;؛،]/u).find((segment) => segment.trim().length > 0);
  return normalizeStructuredString(firstSentence ?? firstLine);
}

function extractInlineNumberedSteps(value: string) {
  const compact = normalizeWhitespace(value);
  const segments = compact
    .split(/\s(?=\d{1,2}[).:-]\s*)/u)
    .map((segment) => segment.replace(NUMBERED_STEP_PREFIX_PATTERN, "").trim())
    .filter(Boolean);

  return segments.length > 1 ? dedupeStrings(segments).slice(0, STRUCTURED_LIST_MAX_ITEMS) : [];
}

function extractOrderedSteps(value: string) {
  const lines = normalizeMultilineWhitespace(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const lineSteps = lines
    .filter((line) => NUMBERED_STEP_PREFIX_PATTERN.test(line) || BULLET_STEP_PREFIX_PATTERN.test(line))
    .map((line) => line.replace(NUMBERED_STEP_PREFIX_PATTERN, "").replace(BULLET_STEP_PREFIX_PATTERN, "").trim())
    .filter(Boolean);

  if (lineSteps.length > 1) {
    return dedupeStrings(lineSteps).slice(0, STRUCTURED_LIST_MAX_ITEMS);
  }

  return extractInlineNumberedSteps(value);
}

function extractBinarySubjects(value: string) {
  const normalized = normalizeMultilineWhitespace(value);
  const englishMatch = normalized.match(BINARY_COMPARISON_PATTERN);
  if (englishMatch?.groups?.left && englishMatch.groups.right) {
    return {
      left: normalizeStructuredString(englishMatch.groups.left),
      right: normalizeStructuredString(englishMatch.groups.right),
    };
  }

  const arabicMatch = normalized.match(BINARY_COMPARISON_AR_PATTERN);
  if (arabicMatch?.groups?.left && arabicMatch.groups.right) {
    return {
      left: normalizeStructuredString(arabicMatch.groups.left),
      right: normalizeStructuredString(arabicMatch.groups.right),
    };
  }

  return {
    left: undefined,
    right: undefined,
  };
}

function extractCauseEffectValues(value: string) {
  const cause = extractLabeledValue(value, ["cause", "السبب"]);
  const effect = extractLabeledValue(value, ["effect", "النتيجة", "الأثر"]);

  if (cause || effect) {
    return {
      cause,
      effect,
    };
  }

  const pairs = extractMatchingPairs(value);
  if (pairs.length > 0) {
    return {
      cause: normalizeStructuredString(pairs[0]?.left),
      effect: normalizeStructuredString(pairs[0]?.right),
    };
  }

  return {
    cause: undefined,
    effect: undefined,
  };
}

function extractComparisonPoints(value: string) {
  const lines = normalizeMultilineWhitespace(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(NUMBERED_STEP_PREFIX_PATTERN, "").replace(BULLET_STEP_PREFIX_PATTERN, "").trim())
    .filter(Boolean)
    .slice(0, STRUCTURED_LIST_MAX_ITEMS);

  return lines.length > 1 ? dedupeStrings(lines) : [];
}

function extractConceptFromQuestion(questionText: string) {
  const englishMatch = questionText.match(/\b(?:define|definition\s+of)\s+([^\n.,;:!?]{1,96})/iu);
  if (englishMatch?.[1]) {
    return normalizeStructuredString(englishMatch[1]);
  }

  const arabicMatch = questionText.match(/(?:عر[ّ']?ف|ما\s+تعريف)\s+([^\n،؛:؟!.]{1,96})/u);
  if (arabicMatch?.[1]) {
    return normalizeStructuredString(arabicMatch[1]);
  }

  return undefined;
}

function extractTargetFromQuestion(questionText: string) {
  const afterColon = questionText.split(/[:：]/u)[1];
  if (afterColon) {
    const normalized = normalizeStructuredString(afterColon);
    if (normalized) {
      return normalized;
    }
  }

  return normalizeStructuredString(questionText);
}

function mergeStructuredData(
  primary: AssessmentQuestionStructuredData,
  fallback: AssessmentQuestionStructuredData,
): AssessmentQuestionStructuredData {
  return buildStructuredDataFromSource({
    expectedTerm: primary.expectedTerm ?? fallback.expectedTerm,
    acceptableVariants:
      primary.acceptableVariants && primary.acceptableVariants.length > 0
        ? primary.acceptableVariants
        : fallback.acceptableVariants,
    concept: primary.concept ?? fallback.concept,
    expectedDefinition: primary.expectedDefinition ?? fallback.expectedDefinition,
    leftEntity: primary.leftEntity ?? fallback.leftEntity,
    rightEntity: primary.rightEntity ?? fallback.rightEntity,
    comparisonPoints:
      primary.comparisonPoints && primary.comparisonPoints.length > 0
        ? primary.comparisonPoints
        : fallback.comparisonPoints,
    target: primary.target ?? fallback.target,
    expectedLabel: primary.expectedLabel ?? fallback.expectedLabel,
    categories:
      primary.categories && primary.categories.length > 0
        ? primary.categories
        : fallback.categories,
    items:
      primary.items && primary.items.length > 0
        ? primary.items
        : fallback.items,
    itemCategoryPairs:
      primary.itemCategoryPairs && primary.itemCategoryPairs.length > 0
        ? primary.itemCategoryPairs
        : fallback.itemCategoryPairs,
    orderedSteps:
      primary.orderedSteps && primary.orderedSteps.length > 0
        ? primary.orderedSteps
        : fallback.orderedSteps,
    processName: primary.processName ?? fallback.processName,
    stages:
      primary.stages && primary.stages.length > 0 ? primary.stages : fallback.stages,
    cause: primary.cause ?? fallback.cause,
    effect: primary.effect ?? fallback.effect,
    subjectA: primary.subjectA ?? fallback.subjectA,
    subjectB: primary.subjectB ?? fallback.subjectB,
    distinctionPoints:
      primary.distinctionPoints && primary.distinctionPoints.length > 0
        ? primary.distinctionPoints
        : fallback.distinctionPoints,
    expectedStructure: primary.expectedStructure ?? fallback.expectedStructure,
    expectedCompound: primary.expectedCompound ?? fallback.expectedCompound,
    explanatoryNote: primary.explanatoryNote ?? fallback.explanatoryNote,
  });
}

export function normalizeAssessmentQuestionStructuredData(
  value: unknown,
): AssessmentQuestionStructuredData | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const normalized = buildStructuredDataFromSource({
    expectedTerm: normalizeStructuredString(
      source.expectedTerm ?? source.term ?? source.terminology,
    ),
    acceptableVariants: normalizeStructuredList(
      source.acceptableVariants ?? source.acceptedVariants ?? source.variants,
    ),
    concept: normalizeStructuredString(source.concept),
    expectedDefinition: normalizeStructuredString(
      source.expectedDefinition ?? source.definition,
    ),
    leftEntity: normalizeStructuredString(source.leftEntity),
    rightEntity: normalizeStructuredString(source.rightEntity),
    comparisonPoints: normalizeStructuredList(
      source.comparisonPoints ?? source.points ?? source.differences,
    ),
    target: normalizeStructuredString(source.target),
    expectedLabel: normalizeStructuredString(
      source.expectedLabel ?? source.label ?? source.expectedName,
    ),
    categories: normalizeStructuredList(source.categories),
    items: normalizeStructuredList(source.items),
    itemCategoryPairs: normalizeStructuredPairs(
      source.itemCategoryPairs ?? source.itemPairs ?? source.pairs ?? source.mapping,
    ),
    orderedSteps: normalizeStructuredList(
      source.orderedSteps ?? source.steps ?? source.sequence,
    ),
    processName: normalizeStructuredString(source.processName),
    stages: normalizeStructuredList(source.stages),
    cause: normalizeStructuredString(source.cause),
    effect: normalizeStructuredString(source.effect),
    subjectA: normalizeStructuredString(source.subjectA),
    subjectB: normalizeStructuredString(source.subjectB),
    distinctionPoints: normalizeStructuredList(
      source.distinctionPoints ?? source.distinctions,
    ),
    expectedStructure: normalizeStructuredString(
      source.expectedStructure ?? source.structure,
    ),
    expectedCompound: normalizeStructuredString(
      source.expectedCompound ?? source.compound,
    ),
    explanatoryNote: normalizeStructuredString(
      source.explanatoryNote ?? source.note ?? source.explanation,
    ),
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function deriveAssessmentQuestionStructuredData(input: {
  questionType: AssessmentQuestionType | null | undefined;
  questionText: string;
  answerText: string;
  rationaleText?: string | null;
}): AssessmentQuestionStructuredData | undefined {
  if (!input.questionType) {
    return undefined;
  }

  const questionText = normalizeMultilineWhitespace(input.questionText);
  const answerText = normalizeMultilineWhitespace(input.answerText);
  const rationaleText = normalizeStructuredString(input.rationaleText);

  switch (input.questionType) {
    case "terminology":
      return buildStructuredDataFromSource({
        expectedTerm: extractFirstMeaningfulSegment(answerText),
        acceptableVariants: extractLabeledList(answerText, [
          "acceptable variants",
          "accepted variants",
          "variants",
          "البدائل المقبولة",
        ]),
        explanatoryNote: rationaleText,
      });
    case "definition":
      return buildStructuredDataFromSource({
        concept: extractConceptFromQuestion(questionText),
        expectedDefinition: normalizeStructuredString(answerText),
      });
    case "comparison": {
      const subjects = extractBinarySubjects(`${questionText}\n${answerText}`);
      return buildStructuredDataFromSource({
        leftEntity: subjects.left,
        rightEntity: subjects.right,
        comparisonPoints: extractComparisonPoints(answerText),
      });
    }
    case "labeling":
      return buildStructuredDataFromSource({
        target: extractTargetFromQuestion(questionText),
        expectedLabel: extractFirstMeaningfulSegment(answerText),
        itemCategoryPairs: normalizeStructuredPairs(answerText),
      });
    case "classification": {
      const itemCategoryPairs = normalizeStructuredPairs(answerText);
      const categories = dedupeStrings(
        itemCategoryPairs.map((pair) => pair.right).filter(Boolean),
      );
      const items = dedupeStrings(
        itemCategoryPairs.map((pair) => pair.left).filter(Boolean),
      );

      return buildStructuredDataFromSource({
        categories,
        items,
        itemCategoryPairs,
      });
    }
    case "sequencing":
      return buildStructuredDataFromSource({
        orderedSteps: extractOrderedSteps(answerText),
      });
    case "process_mechanism":
      return buildStructuredDataFromSource({
        processName: extractTargetFromQuestion(questionText),
        stages: extractOrderedSteps(answerText),
      });
    case "cause_effect": {
      const values = extractCauseEffectValues(answerText);
      return buildStructuredDataFromSource({
        cause: values.cause,
        effect: values.effect,
      });
    }
    case "distinguish_between": {
      const subjects = extractBinarySubjects(questionText);
      return buildStructuredDataFromSource({
        subjectA: subjects.left,
        subjectB: subjects.right,
        distinctionPoints: extractComparisonPoints(answerText),
      });
    }
    case "identify_structure":
      return buildStructuredDataFromSource({
        target: extractTargetFromQuestion(questionText),
        expectedStructure: extractFirstMeaningfulSegment(answerText),
        explanatoryNote: rationaleText,
      });
    case "identify_compound":
      return buildStructuredDataFromSource({
        target: extractTargetFromQuestion(questionText),
        expectedCompound: extractFirstMeaningfulSegment(answerText),
        explanatoryNote: rationaleText,
      });
    default:
      return undefined;
  }
}

/* This resolver protects backward compatibility: provider-structured fields are honored first,
   and only clearly derivable fields are synthesized from generic text when providers omit pieces.
   Future agents should preserve this order to avoid inventing metadata that cannot be justified. */
export function resolveAssessmentQuestionStructuredData(input: {
  questionType: AssessmentQuestionType | null | undefined;
  structuredData?: unknown;
  questionText: string;
  answerText: string;
  rationaleText?: string | null;
}): AssessmentQuestionStructuredData | undefined {
  const normalizedStructured = normalizeAssessmentQuestionStructuredData(
    input.structuredData,
  );
  const derivedStructured = deriveAssessmentQuestionStructuredData({
    questionType: input.questionType,
    questionText: input.questionText,
    answerText: input.answerText,
    rationaleText: input.rationaleText,
  });

  if (!normalizedStructured) {
    return derivedStructured;
  }

  if (!derivedStructured) {
    return normalizedStructured;
  }

  return mergeStructuredData(normalizedStructured, derivedStructured);
}

function createValueBlock(input: {
  key: string;
  label: string;
  value: string | undefined;
}): AssessmentScienceRenderBlock | null {
  if (!input.value) {
    return null;
  }

  return {
    key: input.key,
    kind: "value",
    label: input.label,
    value: input.value,
  };
}

function createListBlock(input: {
  key: string;
  label: string;
  items: string[] | undefined;
  ordered?: boolean;
}): AssessmentScienceRenderBlock | null {
  if (!input.items || input.items.length === 0) {
    return null;
  }

  return {
    key: input.key,
    kind: "list",
    label: input.label,
    items: input.items,
    ordered: input.ordered,
  };
}

function createPairBlock(input: {
  key: string;
  label: string;
  leftLabel: string;
  leftValue: string | undefined;
  rightLabel: string;
  rightValue: string | undefined;
}): AssessmentScienceRenderBlock | null {
  if (!input.leftValue && !input.rightValue) {
    return null;
  }

  return {
    key: input.key,
    kind: "pair",
    label: input.label,
    leftLabel: input.leftLabel,
    leftValue: input.leftValue,
    rightLabel: input.rightLabel,
    rightValue: input.rightValue,
  };
}

function createPairListBlock(input: {
  key: string;
  label: string;
  pairs: AssessmentQuestionStructuredPair[] | undefined;
}): AssessmentScienceRenderBlock | null {
  if (!input.pairs || input.pairs.length === 0) {
    return null;
  }

  return {
    key: input.key,
    kind: "pair-list",
    label: input.label,
    pairs: input.pairs,
  };
}

/* Preview/result/print/Markdown/DOCX all consume these normalized blocks so new science types
   render as structured educational content instead of collapsing into one generic answer blob.
   Keep this centralized to preserve cross-surface parity and avoid per-renderer drift. */
export function buildAssessmentScienceRenderBlocks(input: {
  locale: Locale;
  questionType: AssessmentQuestionType | null | undefined;
  structuredData?: unknown;
  questionText: string;
  answerText: string;
  rationaleText?: string | null;
}): AssessmentScienceRenderBlock[] {
  if (!input.questionType) {
    return [];
  }

  const structuredData = resolveAssessmentQuestionStructuredData({
    questionType: input.questionType,
    structuredData: input.structuredData,
    questionText: input.questionText,
    answerText: input.answerText,
    rationaleText: input.rationaleText,
  });

  if (!structuredData) {
    return [];
  }

  const blocks: Array<AssessmentScienceRenderBlock | null> = [];

  switch (input.questionType) {
    case "terminology":
      blocks.push(
        createValueBlock({
          key: "expected-term",
          label: localizeScienceLabel(input.locale, "Expected term", "المصطلح المتوقع"),
          value: structuredData.expectedTerm,
        }),
      );
      blocks.push(
        createListBlock({
          key: "accepted-variants",
          label: localizeScienceLabel(input.locale, "Accepted variants", "البدائل المقبولة"),
          items: structuredData.acceptableVariants,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "terminology-note",
          label: localizeScienceLabel(input.locale, "Explanation note", "ملاحظة توضيحية"),
          value: structuredData.explanatoryNote,
        }),
      );
      break;
    case "definition":
      blocks.push(
        createValueBlock({
          key: "concept",
          label: localizeScienceLabel(input.locale, "Concept", "المفهوم"),
          value: structuredData.concept,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "expected-definition",
          label: localizeScienceLabel(input.locale, "Expected definition", "التعريف المتوقع"),
          value: structuredData.expectedDefinition,
        }),
      );
      break;
    case "comparison":
      blocks.push(
        createPairBlock({
          key: "comparison-entities",
          label: localizeScienceLabel(input.locale, "Comparison focus", "محور المقارنة"),
          leftLabel: localizeScienceLabel(input.locale, "Left", "الجانب الأول"),
          leftValue: structuredData.leftEntity,
          rightLabel: localizeScienceLabel(input.locale, "Right", "الجانب الثاني"),
          rightValue: structuredData.rightEntity,
        }),
      );
      blocks.push(
        createListBlock({
          key: "comparison-points",
          label: localizeScienceLabel(input.locale, "Comparison points", "نقاط المقارنة"),
          items: structuredData.comparisonPoints,
        }),
      );
      break;
    case "labeling":
      blocks.push(
        createValueBlock({
          key: "label-target",
          label: localizeScienceLabel(input.locale, "Target surface", "سطح التحديد"),
          value: structuredData.target,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "expected-label",
          label: localizeScienceLabel(input.locale, "Expected label", "الوسم المتوقع"),
          value: structuredData.expectedLabel,
        }),
      );
      blocks.push(
        createPairListBlock({
          key: "label-map",
          label: localizeScienceLabel(input.locale, "Label map", "خريطة الوسوم"),
          pairs: structuredData.itemCategoryPairs,
        }),
      );
      break;
    case "classification":
      blocks.push(
        createListBlock({
          key: "categories",
          label: localizeScienceLabel(input.locale, "Categories", "الفئات"),
          items: structuredData.categories,
        }),
      );
      blocks.push(
        createPairListBlock({
          key: "item-category-map",
          label: localizeScienceLabel(input.locale, "Item-category mapping", "ربط العناصر بالفئات"),
          pairs: structuredData.itemCategoryPairs,
        }),
      );
      break;
    case "sequencing":
      blocks.push(
        createListBlock({
          key: "ordered-steps",
          label: localizeScienceLabel(input.locale, "Ordered steps", "الخطوات المرتبة"),
          items: structuredData.orderedSteps,
          ordered: true,
        }),
      );
      break;
    case "process_mechanism":
      blocks.push(
        createValueBlock({
          key: "process-name",
          label: localizeScienceLabel(input.locale, "Process name", "اسم العملية"),
          value: structuredData.processName,
        }),
      );
      blocks.push(
        createListBlock({
          key: "process-stages",
          label: localizeScienceLabel(input.locale, "Stages", "المراحل"),
          items: structuredData.stages,
          ordered: true,
        }),
      );
      break;
    case "cause_effect":
      blocks.push(
        createPairBlock({
          key: "cause-effect",
          label: localizeScienceLabel(input.locale, "Cause and effect", "السبب والنتيجة"),
          leftLabel: localizeScienceLabel(input.locale, "Cause", "السبب"),
          leftValue: structuredData.cause,
          rightLabel: localizeScienceLabel(input.locale, "Effect", "النتيجة"),
          rightValue: structuredData.effect,
        }),
      );
      break;
    case "distinguish_between":
      blocks.push(
        createPairBlock({
          key: "distinguish-subjects",
          label: localizeScienceLabel(input.locale, "Distinguish between", "التمييز بين"),
          leftLabel: localizeScienceLabel(input.locale, "Subject A", "العنصر أ"),
          leftValue: structuredData.subjectA,
          rightLabel: localizeScienceLabel(input.locale, "Subject B", "العنصر ب"),
          rightValue: structuredData.subjectB,
        }),
      );
      blocks.push(
        createListBlock({
          key: "distinction-points",
          label: localizeScienceLabel(input.locale, "Distinction points", "نقاط التمييز"),
          items: structuredData.distinctionPoints,
        }),
      );
      break;
    case "identify_structure":
      blocks.push(
        createValueBlock({
          key: "identify-structure-target",
          label: localizeScienceLabel(input.locale, "Target prompt", "الهدف المطلوب"),
          value: structuredData.target,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "expected-structure",
          label: localizeScienceLabel(input.locale, "Expected structure", "البنية المتوقعة"),
          value: structuredData.expectedStructure,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "identify-structure-note",
          label: localizeScienceLabel(input.locale, "Explanatory note", "ملاحظة تفسيرية"),
          value: structuredData.explanatoryNote,
        }),
      );
      break;
    case "identify_compound":
      blocks.push(
        createValueBlock({
          key: "identify-compound-target",
          label: localizeScienceLabel(input.locale, "Target prompt", "الهدف المطلوب"),
          value: structuredData.target,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "expected-compound",
          label: localizeScienceLabel(input.locale, "Expected compound", "المركب المتوقع"),
          value: structuredData.expectedCompound,
        }),
      );
      blocks.push(
        createValueBlock({
          key: "identify-compound-note",
          label: localizeScienceLabel(input.locale, "Explanatory note", "ملاحظة تفسيرية"),
          value: structuredData.explanatoryNote,
        }),
      );
      break;
    default:
      return [];
  }

  return blocks.filter((block): block is AssessmentScienceRenderBlock => Boolean(block));
}
