import "server-only";

import { timingSafeEqual } from "node:crypto";

const WRAPPING_QUOTE_CHARACTERS = new Set(["\"", "'"]);

export type PasswordGateSecretSource = "AUTH_SECRET" | "NEXTAUTH_SECRET";

export type PasswordGateMatchConfig = {
  configuredValue: string | null;
  comparisonValues: string[];
  hasQuotedWrapper: boolean;
};

type SigningSecretResolution = {
  value: string | null;
  source: PasswordGateSecretSource | null;
};

function readTrimmedEnvValue(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function unwrapMatchingQuotePair(value: string) {
  if (value.length < 2) {
    return null;
  }

  const firstCharacter = value[0];
  const lastCharacter = value[value.length - 1];
  if (
    firstCharacter !== lastCharacter
    || !WRAPPING_QUOTE_CHARACTERS.has(firstCharacter)
  ) {
    return null;
  }

  return value.slice(1, -1);
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

/* Assessment prompt unlock and the legacy-named assessment credits page unlock both depend on env-backed
   passwords entered by operators through local files and dashboard forms. We trim
   surrounding whitespace and tolerate one accidental wrapping quote pair so copied
   Vercel-style values like `"secret"` do not falsely reject the intended password.
   Future agents: keep matching strict beyond this narrow operator-format recovery. */
export function readPasswordGateMatchConfig(
  value: string | undefined,
): PasswordGateMatchConfig {
  const configuredValue = readTrimmedEnvValue(value);
  if (!configuredValue) {
    return {
      configuredValue: null,
      comparisonValues: [],
      hasQuotedWrapper: false,
    };
  }

  const unwrappedValue = unwrapMatchingQuotePair(configuredValue);
  const comparisonValues = dedupeStrings(
    [configuredValue, unwrappedValue]
      .filter((candidate): candidate is string => Boolean(candidate))
      .filter((candidate) => candidate.length > 0),
  );

  return {
    configuredValue,
    comparisonValues,
    hasQuotedWrapper:
      Boolean(unwrappedValue) && unwrappedValue !== configuredValue,
  };
}

function readOperatorNormalizedEnvValue(value: string | undefined) {
  const configuredValue = readTrimmedEnvValue(value);
  if (!configuredValue) {
    return null;
  }

  return unwrapMatchingQuotePair(configuredValue) ?? configuredValue;
}

export function readPasswordGateBooleanFlag(value: string | undefined) {
  const normalized = readOperatorNormalizedEnvValue(value)?.toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

export function resolvePasswordGateSigningSecret(): SigningSecretResolution {
  for (const key of ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const) {
    const value = readOperatorNormalizedEnvValue(process.env[key]);
    if (value) {
      return {
        value,
        source: key,
      };
    }
  }

  return {
    value: null,
    source: null,
  };
}

export function hasTimingSafeStringMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasTimingSafeStringMatchAny(
  value: string,
  comparisonValues: string[],
) {
  if (!value || comparisonValues.length === 0) {
    return false;
  }

  return comparisonValues.some((comparisonValue) =>
    hasTimingSafeStringMatch(value, comparisonValue),
  );
}

export function normalizeSubmittedPasswordGateValue(value: string | undefined | null) {
  return String(value ?? "").trim();
}
