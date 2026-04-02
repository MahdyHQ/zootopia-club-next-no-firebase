import type {
  RequiredUserProfile,
  UpdateUserProfileInput,
  UserProfileFieldErrors,
  UserRole,
} from "@zootopia/shared-types";

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
  cohortYear: number;
}>;

type ProfileValidationFailure = {
  ok: false;
  fieldErrors: UserProfileFieldErrors;
  message: string;
};

const NAME_PART_PATTERN = /^[\p{Script=Arabic}\p{Script=Latin}'-]+$/u;
const NAME_LETTERS_ONLY_PATTERN = /^[\p{Script=Arabic}\p{Script=Latin}]+$/u;

export function assertNonEmptyString(value: string, message: string) {
  if (!value.trim()) {
    throw new Error(message);
  }
}

export function normalizeWhitespace(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
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

export function validateRequiredUserProfile(
  input: UpdateUserProfileInput | RequiredUserProfile,
): ProfileValidationSuccess | ProfileValidationFailure {
  const fullNameResult = validateFullName(input.fullName);
  const universityCodeResult = validateUniversityCode(input.universityCode);

  if (!fullNameResult.ok || !universityCodeResult.ok) {
    const fieldErrors: UserProfileFieldErrors = {};
    if (!fullNameResult.ok) {
      fieldErrors.fullName = fullNameResult.error;
    }

    if (!universityCodeResult.ok) {
      fieldErrors.universityCode = universityCodeResult.error;
    }

    return {
      ok: false,
      fieldErrors,
      message: "Profile completion requires a valid full name and university code.",
    };
  }

  return {
    ok: true,
    value: {
      fullName: fullNameResult.value,
      universityCode: universityCodeResult.value.code,
      cohortYear: universityCodeResult.value.cohortYear,
    },
  };
}

export function evaluateProfileCompletion(input: {
  role?: UserRole | null;
  fullName?: string | null;
  universityCode?: string | null;
}) {
  if (input.role === "admin") {
    return {
      profileCompleted: true,
      normalizedFullName: null,
      normalizedUniversityCode: null,
      cohortYear: null,
    };
  }

  const fullNameResult = validateFullName(String(input.fullName || ""));
  const universityCodeResult = validateUniversityCode(
    String(input.universityCode || ""),
  );

  return {
    profileCompleted: fullNameResult.ok && universityCodeResult.ok,
    normalizedFullName: fullNameResult.ok ? fullNameResult.value : null,
    normalizedUniversityCode: universityCodeResult.ok
      ? universityCodeResult.value.code
      : null,
    cohortYear: universityCodeResult.ok
      ? universityCodeResult.value.cohortYear
      : null,
  };
}
