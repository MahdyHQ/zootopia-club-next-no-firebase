const CARD_TEXT_PREVIEW_MIN_WORD_BOUNDARY = 80;

export function buildCardTextPreview(value: string, maxChars = 220): string {
  /* This utility controls generated card summary excerpts across protected surfaces.
     It keeps long AI/user text inside card boundaries with a stable trailing "..."
     while preserving full metadata in persistence and API contracts. */
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const wordBoundary = normalized.lastIndexOf(" ", maxChars);
  const safeCutoff =
    wordBoundary >= CARD_TEXT_PREVIEW_MIN_WORD_BOUNDARY
      ? wordBoundary
      : maxChars;

  return `${normalized.slice(0, safeCutoff).trimEnd()}...`;
}
