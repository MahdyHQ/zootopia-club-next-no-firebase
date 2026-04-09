import type {
  AssessmentDifficulty,
  AssessmentMode,
  AssessmentQuestionType,
  AssessmentQuestionTypeDistribution,
  AssessmentRequest,
  AssessmentRequestFieldErrors,
  AssessmentRequestInput,
  Locale,
  RequiredUserProfile,
  UpdateUserProfileInput,
  UserProfileFieldErrors,
  UserRole,
} from "@zootopia/shared-types";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

type ValidationFailure = {
  ok: false;
  error: string;
};

type ProfileValidationSuccess = ValidationSuccess<{
  fullName: string;
  universityCode: string;
  nationality: string;
  cohortYear: number;
}>;

type ProfileValidationFailure = {
  ok: false;
  fieldErrors: UserProfileFieldErrors;
  message: string;
};

type AssessmentValidationSuccess = ValidationSuccess<AssessmentRequest>;

type AssessmentValidationFailure = {
  ok: false;
  fieldErrors: AssessmentRequestFieldErrors;
  message: string;
};

type AssessmentValidationOptions = {
  defaultModelId?: string;
  normalizeModelId?: (modelId: string) => string;
  isModelSupported?: (modelId: string) => boolean;
};

const NAME_PART_PATTERN = /^[\p{Script=Arabic}\p{Script=Latin}'-]+$/u;
const NAME_LETTERS_ONLY_PATTERN = /^[\p{Script=Arabic}\p{Script=Latin}]+$/u;
const LOCATION_TEXT_PATTERN =
  /^[\p{Script=Arabic}\p{Script=Latin}\s.'-]+$/u;
const E164_PHONE_PATTERN = /^\+[1-9]\d{6,17}$/;
const ASSESSMENT_MIN_QUESTION_COUNT = 10;
const ASSESSMENT_MAX_QUESTION_COUNT = 100;
const ASSESSMENT_QUESTION_COUNT_STEP = 10;
const SUPPORTED_ASSESSMENT_DIFFICULTIES: AssessmentDifficulty[] = [
  "easy",
  "medium",
  "hard",
];
const SUPPORTED_ASSESSMENT_LANGUAGES: Locale[] = ["en", "ar"];
const DEFAULT_ASSESSMENT_MODE: AssessmentMode = "question_generation";
const SUPPORTED_ASSESSMENT_MODES: AssessmentMode[] = [
  "question_generation",
  "exam_generation",
];
const DEFAULT_ASSESSMENT_QUESTION_TYPE: AssessmentQuestionType = "mcq";
const SUPPORTED_ASSESSMENT_QUESTION_TYPES: AssessmentQuestionType[] = [
  "mcq",
  "true_false",
  "essay",
  "fill_blanks",
  "short_answer",
  "matching",
  "multiple_response",
  "terminology",
  "definition",
  "comparison",
  "labeling",
  "classification",
  "sequencing",
  "process_mechanism",
  "cause_effect",
  "distinguish_between",
  "identify_structure",
  "identify_compound",
];

export function assertNonEmptyString(value: string, message: string) {
  if (!value.trim()) {
    throw new Error(message);
  }
}

export function normalizeWhitespace(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeMultilineWhitespace(value: string) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeWhitespace(line));
  const collapsedLines: string[] = [];

  // Assessment questions can embed answer choices inside multiline text. Preserve those
  // line breaks while still normalizing noisy spacing so preview/result/export renderers
  // can stack options cleanly without widening the saved data contract.
  for (const line of lines) {
    if (!line) {
      if (collapsedLines.length > 0 && collapsedLines[collapsedLines.length - 1] !== "") {
        collapsedLines.push("");
      }
      continue;
    }

    collapsedLines.push(line);
  }

  return collapsedLines.join("\n").trim();
}

export function normalizeOptionalString(value: string | null | undefined) {
  const normalized = normalizeWhitespace(String(value || ""));
  return normalized || undefined;
}

export function normalizeOptionalMultilineString(value: string | null | undefined) {
  const normalized = normalizeMultilineWhitespace(String(value || ""));
  return normalized || undefined;
}

export function normalizeFullName(value: string) {
  return normalizeWhitespace(value);
}

export function getUniversityCohortYearFromCode(value: string) {
  const normalized = String(value || "").trim();
  if (!/^\d{7}$/.test(normalized)) {
    return null;
  }

  const prefix = Number.parseInt(normalized.slice(0, 2), 10);
  if (!Number.isInteger(prefix) || prefix < 13 || prefix > 31) {
    return null;
  }

  return 2000 + prefix;
}

export function validateFullName(value: string): ValidationSuccess<string> | ValidationFailure {
  const normalized = normalizeFullName(value);
  if (!normalized) {
    return {
      ok: false,
      error: "Full name is required.",
    };
  }

  if (normalized.length < 12 || normalized.length > 120) {
    return {
      ok: false,
      error: "Full name must be between 12 and 120 characters.",
    };
  }

  const parts = normalized.split(" ");
  if (parts.length < 4) {
    return {
      ok: false,
      error: "Full name must contain at least 4 meaningful name parts.",
    };
  }

  for (const part of parts) {
    if (!NAME_PART_PATTERN.test(part)) {
      return {
        ok: false,
        error: "Full name may use Arabic or English letters with internal apostrophes or hyphens only.",
      };
    }

    const normalizedPart = part.replace(/['-]/g, "");
    if (
      normalizedPart.length < 2 ||
      !NAME_LETTERS_ONLY_PATTERN.test(normalizedPart)
    ) {
      return {
        ok: false,
        error: "Each name part must contain at least 2 Arabic or English letters.",
      };
    }
  }

  return {
    ok: true,
    value: normalized,
  };
}

export function validateUniversityCode(
  value: string,
): ValidationSuccess<{ code: string; cohortYear: number }> | ValidationFailure {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return {
      ok: false,
      error: "University code is required.",
    };
  }

  if (!/^\d{7}$/.test(normalized)) {
    return {
      ok: false,
      error: "University code must be exactly 7 digits.",
    };
  }

  const cohortYear = getUniversityCohortYearFromCode(normalized);
  if (!cohortYear) {
    return {
      ok: false,
      error: "University code must begin with a cohort prefix between 13 and 31 (2013-2031).",
    };
  }

  return {
    ok: true,
    value: {
      code: normalized,
      cohortYear,
    },
  };
}

function validateLocationField(
  value: string,
  label: string,
): ValidationSuccess<string> | ValidationFailure {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return {
      ok: false,
      error: `${label} is required.`,
    };
  }

  if (normalized.length < 2 || normalized.length > 80) {
    return {
      ok: false,
      error: `${label} must be between 2 and 80 characters.`,
    };
  }

  if (!LOCATION_TEXT_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: `${label} may use Arabic or English letters, spaces, apostrophes, periods, and hyphens only.`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

export function validateNationality(
  value: string,
): ValidationSuccess<string> | ValidationFailure {
  return validateLocationField(value, "Nationality");
}

export function validatePhoneNumberE164(
  value: string,
): ValidationSuccess<string> | ValidationFailure {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return {
      ok: false,
      error: "Phone number is required.",
    };
  }

  if (!E164_PHONE_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Phone number must use E.164 format (for example, +201234567890).",
    };
  }

  const phoneMetadata = getPhoneNumberMetadata(normalized);
  if (!phoneMetadata) {
    return {
      ok: false,
      error: "Phone number must be a possible international number in E.164 format.",
    };
  }

  return {
    ok: true,
    value: phoneMetadata.e164,
  };
}

export function getPhoneNumberMetadata(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || !E164_PHONE_PATTERN.test(normalized)) {
    return null;
  }

  const parsedPhoneNumber = parsePhoneNumberFromString(normalized);
  if (
    !parsedPhoneNumber ||
    parsedPhoneNumber.number !== normalized ||
    !parsedPhoneNumber.isPossible()
  ) {
    return null;
  }

  return {
    e164: parsedPhoneNumber.number,
    countryIso2: parsedPhoneNumber.country ?? null,
    countryCallingCode: parsedPhoneNumber.countryCallingCode ?? null,
  };
}

function normalizeVerifiedTimestamp(value: string | null | undefined) {
  const raw = normalizeWhitespace(String(value || ""));
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export function validateRequiredUserProfile(
  input: UpdateUserProfileInput | RequiredUserProfile,
): ProfileValidationSuccess | ProfileValidationFailure {
  const fullNameResult = validateFullName(input.fullName);
  const universityCodeResult = validateUniversityCode(input.universityCode);
  const nationalityResult = validateNationality(input.nationality);

  if (
    !fullNameResult.ok ||
    !universityCodeResult.ok ||
    !nationalityResult.ok
  ) {
    const fieldErrors: UserProfileFieldErrors = {};
    if (!fullNameResult.ok) {
      fieldErrors.fullName = fullNameResult.error;
    }

    if (!universityCodeResult.ok) {
      fieldErrors.universityCode = universityCodeResult.error;
    }

    if (!nationalityResult.ok) {
      fieldErrors.nationality = nationalityResult.error;
    }

    return {
      ok: false,
      fieldErrors,
      message:
        "Profile completion requires valid full name, university code, and nationality.",
    };
  }

  return {
    ok: true,
    value: {
      fullName: fullNameResult.value,
      universityCode: universityCodeResult.value.code,
      nationality: nationalityResult.value,
      cohortYear: universityCodeResult.value.cohortYear,
    },
  };
}

export function evaluateProfileCompletion(input: {
  role?: UserRole | null;
  fullName?: string | null;
  universityCode?: string | null;
  phoneNumber?: string | null;
  phoneVerifiedAt?: string | null;
  nationality?: string | null;
}) {
  if (input.role === "admin") {
    return {
      profileCompleted: true,
      normalizedFullName: null,
      normalizedUniversityCode: null,
      normalizedPhoneNumber: null,
      normalizedPhoneVerifiedAt: null,
      normalizedNationality: null,
      cohortYear: null,
    };
  }

  const fullNameResult = validateFullName(String(input.fullName || ""));
  const universityCodeResult = validateUniversityCode(
    String(input.universityCode || ""),
  );
  const phoneNumberResult = validatePhoneNumberE164(
    String(input.phoneNumber || ""),
  );
  const normalizedPhoneVerifiedAt = normalizeVerifiedTimestamp(input.phoneVerifiedAt);
  const nationalityResult = validateNationality(String(input.nationality || ""));
  const isPhoneVerified = phoneNumberResult.ok && Boolean(normalizedPhoneVerifiedAt);

  return {
    profileCompleted:
      fullNameResult.ok &&
      universityCodeResult.ok &&
      nationalityResult.ok &&
      isPhoneVerified,
    normalizedFullName: fullNameResult.ok ? fullNameResult.value : null,
    normalizedUniversityCode: universityCodeResult.ok
      ? universityCodeResult.value.code
      : null,
    normalizedPhoneNumber: phoneNumberResult.ok ? phoneNumberResult.value : null,
    normalizedPhoneVerifiedAt: isPhoneVerified ? normalizedPhoneVerifiedAt : null,
    normalizedNationality: nationalityResult.ok ? nationalityResult.value : null,
    cohortYear: universityCodeResult.ok
      ? universityCodeResult.value.cohortYear
      : null,
  };
}

function resolveAssessmentQuestionCount(input: AssessmentRequestInput) {
  const rawValue = input.options?.questionCount ?? input.questionCount;
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return NaN;
  }

  return Math.trunc(rawValue);
}

function resolveAssessmentMode(input: AssessmentRequestInput): AssessmentMode {
  const value = input.options?.mode ?? input.mode;
  return SUPPORTED_ASSESSMENT_MODES.includes(value as AssessmentMode)
    ? (value as AssessmentMode)
    : DEFAULT_ASSESSMENT_MODE;
}

function hasInvalidAssessmentMode(input: AssessmentRequestInput) {
  const rawValue = input.options?.mode ?? input.mode;
  return (
    rawValue !== undefined &&
    rawValue !== null &&
    !SUPPORTED_ASSESSMENT_MODES.includes(rawValue as AssessmentMode)
  );
}

function resolveAssessmentDifficulty(
  input: AssessmentRequestInput,
): AssessmentDifficulty | undefined {
  const value = input.options?.difficulty ?? input.difficulty;
  return SUPPORTED_ASSESSMENT_DIFFICULTIES.includes(value as AssessmentDifficulty)
    ? (value as AssessmentDifficulty)
    : undefined;
}

function resolveAssessmentLanguage(input: AssessmentRequestInput): Locale | undefined {
  const value = input.options?.language ?? input.language;
  return SUPPORTED_ASSESSMENT_LANGUAGES.includes(value as Locale)
    ? (value as Locale)
    : undefined;
}

function resolveAssessmentQuestionTypes(
  input: AssessmentRequestInput,
): AssessmentQuestionType[] {
  const rawValue = input.options?.questionTypes ?? input.questionTypes;
  if (!Array.isArray(rawValue)) {
    return [DEFAULT_ASSESSMENT_QUESTION_TYPE];
  }

  const normalized = rawValue.filter((value, index, values) => {
    if (!SUPPORTED_ASSESSMENT_QUESTION_TYPES.includes(value as AssessmentQuestionType)) {
      return false;
    }

    return values.indexOf(value) === index;
  }) as AssessmentQuestionType[];

  return normalized.length > 0 ? normalized : [DEFAULT_ASSESSMENT_QUESTION_TYPE];
}

function buildBalancedQuestionTypeDistribution(
  questionTypes: AssessmentQuestionType[],
): AssessmentQuestionTypeDistribution[] {
  const base = Math.floor(100 / questionTypes.length);
  let remainder = 100 - base * questionTypes.length;

  return questionTypes.map((type) => {
    const percentage = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);

    return {
      type,
      percentage,
    };
  });
}

function resolveAssessmentQuestionTypeDistribution(
  input: AssessmentRequestInput,
  questionTypes: AssessmentQuestionType[],
) {
  const rawValue =
    input.options?.questionTypeDistribution ?? input.questionTypeDistribution;
  if (!Array.isArray(rawValue) || rawValue.length === 0) {
    return buildBalancedQuestionTypeDistribution(questionTypes);
  }

  const distribution = questionTypes.map((type) => {
    const entry = rawValue.find((item) => item?.type === type);
    return {
      type,
      percentage:
        typeof entry?.percentage === "number" && Number.isFinite(entry.percentage)
          ? Math.trunc(entry.percentage)
          : NaN,
    } satisfies AssessmentQuestionTypeDistribution;
  });

  return distribution;
}

export function validateAssessmentRequest(
  input: AssessmentRequestInput,
  options: AssessmentValidationOptions = {},
): AssessmentValidationSuccess | AssessmentValidationFailure {
  const prompt = normalizeWhitespace(String(input.prompt || ""));
  const documentId = normalizeOptionalString(input.documentId);
  const rawModelId = normalizeWhitespace(
    String(input.modelId || options.defaultModelId || ""),
  );
  const modelId = normalizeWhitespace(
    options.normalizeModelId ? options.normalizeModelId(rawModelId) : rawModelId,
  );
  const mode = resolveAssessmentMode(input);
  const questionCount = resolveAssessmentQuestionCount(input);
  const difficulty = resolveAssessmentDifficulty(input);
  const language = resolveAssessmentLanguage(input);
  const questionTypes = resolveAssessmentQuestionTypes(input);
  const questionTypeDistribution = resolveAssessmentQuestionTypeDistribution(
    input,
    questionTypes,
  );
  const fieldErrors: AssessmentRequestFieldErrors = {};

  if (prompt.length > 2000) {
    fieldErrors.prompt = "Assessment prompt must stay under 2000 characters.";
  }

  // Assessment can now be driven by either a short steering prompt or a linked document.
  // Keep at least one content source required so the server never receives an empty generation brief.
  if (!prompt && !documentId) {
    fieldErrors.prompt = "Add a prompt or link a document before generating an assessment.";
    fieldErrors.documentId = "Add a prompt or link a document before generating an assessment.";
  }

  if (!modelId) {
    fieldErrors.modelId = "Model selection is required.";
  } else if (options.isModelSupported && !options.isModelSupported(modelId)) {
    fieldErrors.modelId = "Select one of the supported assessment models.";
  }

  if (hasInvalidAssessmentMode(input)) {
    fieldErrors.mode = "Assessment mode must be question generation or exam generation.";
  }

  if (!Number.isInteger(questionCount)) {
    fieldErrors.questionCount = "Question count must be a whole number.";
  } else if (
    questionCount < ASSESSMENT_MIN_QUESTION_COUNT ||
    questionCount > ASSESSMENT_MAX_QUESTION_COUNT
  ) {
    fieldErrors.questionCount = `Question count must stay between ${ASSESSMENT_MIN_QUESTION_COUNT} and ${ASSESSMENT_MAX_QUESTION_COUNT}.`;
  } else if (questionCount % ASSESSMENT_QUESTION_COUNT_STEP !== 0) {
    fieldErrors.questionCount = `Question count must use ${ASSESSMENT_QUESTION_COUNT_STEP}-question steps.`;
  }

  if (!difficulty) {
    fieldErrors.difficulty = "Difficulty must be easy, medium, or hard.";
  }

  if (!language) {
    fieldErrors.language = "Assessment language must be English or Arabic.";
  }

  if (questionTypes.length === 0) {
    fieldErrors.questionTypes = "Select at least one question type.";
  }

  if (questionTypeDistribution.length !== questionTypes.length) {
    fieldErrors.questionTypeDistribution = "Question type distribution is incomplete.";
  } else {
    const hasInvalidPercentages = questionTypeDistribution.some(
      (entry) =>
        !Number.isInteger(entry.percentage) ||
        entry.percentage < 0 ||
        entry.percentage > 100,
    );

    if (hasInvalidPercentages) {
      fieldErrors.questionTypeDistribution =
        "Question type percentages must be whole numbers between 0 and 100.";
    } else {
      const distributionTotal = questionTypeDistribution.reduce(
        (total, entry) => total + entry.percentage,
        0,
      );

      if (distributionTotal !== 100) {
        fieldErrors.questionTypeDistribution = "Question type percentages must total 100.";
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Assessment request needs a prompt or linked document, plus valid language and settings.",
    };
  }

  return {
    ok: true,
    value: {
      documentId,
      prompt,
      modelId,
      options: {
        mode,
        questionCount,
        difficulty: difficulty || "medium",
        language: language || "en",
        questionTypes,
        questionTypeDistribution,
      },
    },
  };
}
