export interface AssessmentQuestionDisplay {
  stem: string;
  choiceLines: string[];
  supplementalLines: string[];
}

const CHOICE_LINE_PATTERN =
  /^(?:(?:[A-Za-z0-9\u0660-\u0669\u06F0-\u06F9\u0621-\u064A]{1,2}[.)-])|[-*+])\s+/u;

export function deriveAssessmentQuestionDisplay(
  questionText: string,
): AssessmentQuestionDisplay {
  // Assessment stores choice-based questions inside the existing `question` string. Parse a
  // display-only stem/options split here so preview/result/PDF/DOCX can stack options cleanly
  // without changing the persisted question contract or introducing a second assessment model.
  const normalizedLines = questionText.replace(/\r\n?/g, "\n").split("\n");
  const optionLikeIndexes = normalizedLines.reduce<number[]>((indexes, line, index) => {
    if (CHOICE_LINE_PATTERN.test(line.trim())) {
      indexes.push(index);
    }

    return indexes;
  }, []);

  if (optionLikeIndexes.length < 2) {
    return {
      stem: questionText.trim(),
      choiceLines: [],
      supplementalLines: [],
    };
  }

  const firstChoiceIndex = optionLikeIndexes[0]!;
  const stem = normalizedLines
    .slice(0, firstChoiceIndex)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  const choiceLines: string[] = [];
  const supplementalLines: string[] = [];
  let reachedSupplementalCopy = false;

  for (const rawLine of normalizedLines.slice(firstChoiceIndex)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (!reachedSupplementalCopy && CHOICE_LINE_PATTERN.test(line)) {
      choiceLines.push(line);
      continue;
    }

    reachedSupplementalCopy = true;
    supplementalLines.push(line);
  }

  return {
    stem: stem || questionText.trim(),
    choiceLines,
    supplementalLines,
  };
}
