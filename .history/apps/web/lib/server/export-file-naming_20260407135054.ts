import "server-only";

import type { AssessmentGeneration } from "@zootopia/shared-types";

const EXPORT_FILE_PREFIX = "zootopiaclub";
const FALLBACK_SOURCE_SEGMENT = "manual-input";
const FALLBACK_TOOL_SEGMENT = "artifact";
const FALLBACK_MODE_SEGMENT = "default-mode";
const FALLBACK_TIMESTAMP_SEGMENT = "1970-01-01-0000";

function trimSegment(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength).replace(/-+$/g, "");
}

function sanitizeSegment(input: string | null | undefined, fallback: string, maxLength: number) {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safeValue = normalized || fallback;
  return trimSegment(safeValue, maxLength) || fallback;
}

function stripFileExtension(fileName: string | null | undefined) {
  return String(fileName || "").replace(/\.[a-z0-9]{1,10}$/i, "");
}

function formatDeterministicTimestamp(isoTimestamp: string | null | undefined) {
  const parsed = Date.parse(String(isoTimestamp || ""));
  if (!Number.isFinite(parsed)) {
    return FALLBACK_TIMESTAMP_SEGMENT;
  }

  const utc = new Date(parsed);
  const yyyy = String(utc.getUTCFullYear()).padStart(4, "0");
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  const hh = String(utc.getUTCHours()).padStart(2, "0");
  const min = String(utc.getUTCMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}-${hh}${min}`;
}

function normalizeExtension(value: string) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/^\.+/g, "")
    .replace(/[^a-z0-9]+/g, "");

  return normalized || "bin";
}

/* This shared naming contract keeps all generated/exported files consistent across routes.
   Future agents should extend this helper instead of introducing route-local filename builders. */
export function buildUnifiedGeneratedFileBase(input: {
  sourceFileName?: string | null;
  toolName?: string | null;
  modeName?: string | null;
  timestampIso?: string | null;
}) {
  const sourceSegment = sanitizeSegment(
    stripFileExtension(input.sourceFileName),
    FALLBACK_SOURCE_SEGMENT,
    48,
  );
  const toolSegment = sanitizeSegment(input.toolName, FALLBACK_TOOL_SEGMENT, 24);
  const modeSegment = sanitizeSegment(input.modeName, FALLBACK_MODE_SEGMENT, 40);
  const timestampSegment = formatDeterministicTimestamp(input.timestampIso);

  return `${EXPORT_FILE_PREFIX}-${sourceSegment}-${toolSegment}-${modeSegment}-${timestampSegment}`;
}

export function buildUnifiedGeneratedFileName(input: {
  sourceFileName?: string | null;
  toolName?: string | null;
  modeName?: string | null;
  timestampIso?: string | null;
  extension: string;
}) {
  const baseName = buildUnifiedGeneratedFileBase(input);
  return `${baseName}.${normalizeExtension(input.extension)}`;
}

export function buildAssessmentGeneratedFileName(input: {
  generation: Pick<AssessmentGeneration, "createdAt" | "meta">;
  extension: string;
  toolName?: string;
}) {
  const modeName = String(input.generation.meta.mode || "question_generation").replace(
    /_/g,
    "-",
  );

  return buildUnifiedGeneratedFileName({
    sourceFileName: input.generation.meta.sourceDocument?.fileName,
    toolName: input.toolName || "assessment",
    modeName,
    timestampIso: input.generation.createdAt,
    extension: input.extension,
  });
}