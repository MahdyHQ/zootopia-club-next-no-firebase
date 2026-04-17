import {
  ASSESSMENT_ACTIVE_QUESTION_TYPES,
  type AssessmentQuestionType,
  type Locale,
} from "@zootopia/shared-types";

export const ASSESSMENT_UI_LOCK_ENV_KEYS = {
  enabled: "NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_ENABLED",
  maxQuestionCountForUser: "NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_MAX_QUESTION_COUNT_USER",
  allowedQuestionTypesForUser: "NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_QUESTION_TYPES",
  allowedOutputLanguagesForUser: "NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_OUTPUT_LANGUAGES",
} as const;

const DEFAULT_ASSESSMENT_UI_LOCK_CONFIG = {
  enabled: true,
  maxQuestionCountForUser: 40,
  allowedQuestionTypesForUser: ["mcq"] as AssessmentQuestionType[],
  allowedOutputLanguagesForUser: ["en"] as Locale[],
} as const;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const ALLOWED_QUESTION_TYPE_SET = new Set<AssessmentQuestionType>(
  ASSESSMENT_ACTIVE_QUESTION_TYPES,
);
const ALLOWED_OUTPUT_LANGUAGE_SET = new Set<Locale>(["en", "ar"]);

export type AssessmentUiLockConfig = {
  enabled: boolean;
  maxQuestionCountForUser: number;
  allowedQuestionTypesForUser: AssessmentQuestionType[];
  allowedOutputLanguagesForUser: Locale[];
};

function readBooleanEnvFlag(value: string | undefined, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
}

function parseCsvList(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is string => entry.length > 0);
}

function parseMaxQuestionCount(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ASSESSMENT_UI_LOCK_CONFIG.maxQuestionCountForUser;
  }

  return Math.min(100, parsed);
}

function parseAllowedQuestionTypes(value: string | undefined) {
  const parsed = parseCsvList(value).filter(
    (entry): entry is AssessmentQuestionType =>
      ALLOWED_QUESTION_TYPE_SET.has(entry as AssessmentQuestionType),
  );

  return parsed.length > 0
    ? parsed
    : [...DEFAULT_ASSESSMENT_UI_LOCK_CONFIG.allowedQuestionTypesForUser];
}

function parseAllowedOutputLanguages(value: string | undefined) {
  const parsed = parseCsvList(value).filter(
    (entry): entry is Locale =>
      ALLOWED_OUTPUT_LANGUAGE_SET.has(entry as Locale),
  );

  return parsed.length > 0
    ? parsed
    : [...DEFAULT_ASSESSMENT_UI_LOCK_CONFIG.allowedOutputLanguagesForUser];
}

/* This resolver is intentionally UI-only: it centralizes developer-controlled
   front-end product gating without changing server-side authorization, credits,
   persistence, or generation authority. */
export function getAssessmentUiLockConfig(): AssessmentUiLockConfig {
  return {
    enabled: readBooleanEnvFlag(
      process.env.NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_ENABLED,
      DEFAULT_ASSESSMENT_UI_LOCK_CONFIG.enabled,
    ),
    maxQuestionCountForUser: parseMaxQuestionCount(
      process.env.NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_MAX_QUESTION_COUNT_USER,
    ),
    allowedQuestionTypesForUser: parseAllowedQuestionTypes(
      process.env.NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_QUESTION_TYPES,
    ),
    allowedOutputLanguagesForUser: parseAllowedOutputLanguages(
      process.env.NEXT_PUBLIC_ZOOTOPIA_UI_LOCK_USER_ALLOWED_OUTPUT_LANGUAGES,
    ),
  };
}
