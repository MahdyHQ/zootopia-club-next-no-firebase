import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { AssessmentPromptEntitlement, SessionUser } from "@zootopia/shared-types";
import { cookies } from "next/headers";

import { getAssessmentPromptEntitlementForUser } from "@/lib/server/repository";
import {
  hasTimingSafeStringMatch,
  hasTimingSafeStringMatchAny,
  normalizeSubmittedPasswordGateValue,
  readPasswordGateBooleanFlag,
  readPasswordGateMatchConfig,
  resolvePasswordGateSigningSecret,
  type PasswordGateSecretSource,
} from "@/lib/server/password-gate-runtime";
import { getSessionTtlSeconds } from "@/lib/server/session-config";

const ASSESSMENT_PROMPT_LOCK_ENABLED_ENV_KEY = "ZOOTOPIA_ASSESSMENT_PROMPT_LOCK_ENABLED";
const ASSESSMENT_PROMPT_UNLOCK_PASSWORD_ENV_KEY =
  "ZOOTOPIA_ASSESSMENT_PROMPT_UNLOCK_PASSWORD";
const ASSESSMENT_PROMPT_UNLOCK_COOKIE_NAME = "zootopia_assessment_prompt_unlock";
const ASSESSMENT_PROMPT_UNLOCK_TOKEN_VERSION = 1;

type AssessmentPromptUnlockPayload = {
  v: number;
  uid: string;
  exp: number;
  fp: string;
};

type AssessmentPromptLockConfig = {
  lockEnabled: boolean;
  password: string | null;
  passwordComparisonValues: string[];
  passwordHasQuotedWrapper: boolean;
  passwordFingerprint: string | null;
  signingSecret: string | null;
  signingSecretSource: PasswordGateSecretSource | null;
  cookieMaxAgeSeconds: number;
};

export type AssessmentPromptAccessState = {
  lockEnabled: boolean;
  unlocked: boolean;
  isAdmin: boolean;
  entitlement: AssessmentPromptEntitlement;
};

function toBase64Url(input: Buffer | string) {
  const source = typeof input === "string" ? Buffer.from(input) : input;
  return source.toString("base64url");
}

function fromBase64Url(value: string) {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function buildPromptUnlockSignature(payloadSegment: string, signingSecret: string) {
  return createHmac("sha256", signingSecret).update(payloadSegment).digest();
}

function readPromptLockConfig(): AssessmentPromptLockConfig {
  const passwordConfig = readPasswordGateMatchConfig(
    process.env[ASSESSMENT_PROMPT_UNLOCK_PASSWORD_ENV_KEY],
  );
  const signingSecret = resolvePasswordGateSigningSecret();
  const explicitLockEnabled = readPasswordGateBooleanFlag(
    process.env[ASSESSMENT_PROMPT_LOCK_ENABLED_ENV_KEY],
  );
  const lockEnabled =
    Boolean(passwordConfig.configuredValue) && explicitLockEnabled !== false;

  return {
    lockEnabled,
    password: passwordConfig.configuredValue,
    passwordComparisonValues: passwordConfig.comparisonValues,
    passwordHasQuotedWrapper: passwordConfig.hasQuotedWrapper,
    passwordFingerprint: passwordConfig.configuredValue
      ? createHash("sha256").update(passwordConfig.configuredValue).digest("hex")
      : null,
    signingSecret: signingSecret.value,
    signingSecretSource: signingSecret.source,
    cookieMaxAgeSeconds: getSessionTtlSeconds(),
  };
}

function signPromptUnlockPayload(
  payload: AssessmentPromptUnlockPayload,
  signingSecret: string,
) {
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signatureSegment = toBase64Url(
    buildPromptUnlockSignature(payloadSegment, signingSecret),
  );
  return `${payloadSegment}.${signatureSegment}`;
}

function readValidatedPromptUnlockPayload(input: {
  token: string;
  signingSecret: string;
}): AssessmentPromptUnlockPayload | null {
  const [payloadSegment, signatureSegment, ...rest] = input.token.split(".");
  if (!payloadSegment || !signatureSegment || rest.length > 0) {
    return null;
  }

  const providedSignature = fromBase64Url(signatureSegment);
  if (!providedSignature) {
    return null;
  }

  const expectedSignature = buildPromptUnlockSignature(
    payloadSegment,
    input.signingSecret,
  );
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  const payloadBuffer = fromBase64Url(payloadSegment);
  if (!payloadBuffer) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadBuffer.toString("utf8")) as Partial<
      AssessmentPromptUnlockPayload
    >;
    if (
      parsed.v !== ASSESSMENT_PROMPT_UNLOCK_TOKEN_VERSION
      || typeof parsed.uid !== "string"
      || parsed.uid.trim().length === 0
      || typeof parsed.exp !== "number"
      || !Number.isFinite(parsed.exp)
      || typeof parsed.fp !== "string"
      || parsed.fp.trim().length === 0
    ) {
      return null;
    }

    return {
      v: parsed.v,
      uid: parsed.uid,
      exp: parsed.exp,
      fp: parsed.fp,
    };
  } catch {
    return null;
  }
}

function hasValidPromptUnlockTokenForUser(input: {
  token: string | null;
  userUid: string;
  config: AssessmentPromptLockConfig;
}) {
  if (!input.token || !input.config.signingSecret || !input.config.passwordFingerprint) {
    return false;
  }

  const payload = readValidatedPromptUnlockPayload({
    token: input.token,
    signingSecret: input.config.signingSecret,
  });
  if (!payload) {
    return false;
  }

  if (payload.exp <= Date.now()) {
    return false;
  }

  if (payload.uid !== input.userUid) {
    return false;
  }

  return hasTimingSafeStringMatch(payload.fp, input.config.passwordFingerprint);
}

export function getAssessmentPromptUnlockCookieName() {
  return ASSESSMENT_PROMPT_UNLOCK_COOKIE_NAME;
}

export function getAssessmentPromptUnlockCookieOptions(maxAgeSeconds: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

export function getAssessmentPromptLockRuntimeState() {
  const config = readPromptLockConfig();

  return {
    lockEnabled: config.lockEnabled,
    signingReady: Boolean(config.signingSecret && config.passwordFingerprint),
    cookieMaxAgeSeconds: config.cookieMaxAgeSeconds,
    passwordConfigured: Boolean(config.password),
    passwordHasQuotedWrapper: config.passwordHasQuotedWrapper,
    signingSecretSource: config.signingSecretSource,
  };
}

export function isAssessmentPromptUnlockPasswordValid(inputPassword: string) {
  const config = readPromptLockConfig();
  if (!config.lockEnabled || !config.password) {
    return false;
  }

  const normalizedInput = normalizeSubmittedPasswordGateValue(inputPassword);
  return hasTimingSafeStringMatchAny(
    normalizedInput,
    config.passwordComparisonValues,
  );
}

export function buildAssessmentPromptUnlockCookieValueForUser(userUid: string) {
  const config = readPromptLockConfig();
  if (!config.lockEnabled || !config.signingSecret || !config.passwordFingerprint) {
    return null;
  }

  /* Unlock grants are session-scoped and user-bound. Embedding the current password
     fingerprint means changing or removing the env password revokes prior grants safely. */
  return signPromptUnlockPayload(
    {
      v: ASSESSMENT_PROMPT_UNLOCK_TOKEN_VERSION,
      uid: userUid,
      exp: Date.now() + config.cookieMaxAgeSeconds * 1000,
      fp: config.passwordFingerprint,
    },
    config.signingSecret,
  );
}

export async function getAssessmentPromptEntitlementStateForUser(
  user: Pick<SessionUser, "uid" | "role">,
): Promise<AssessmentPromptEntitlement> {
  if (user.role === "admin") {
    return "enabled";
  }

  return getAssessmentPromptEntitlementForUser(user.uid);
}

export async function getAssessmentPromptAccessStateForUser(
  user: Pick<SessionUser, "uid" | "role">,
): Promise<AssessmentPromptAccessState> {
  const config = readPromptLockConfig();

  if (user.role === "admin") {
    return {
      lockEnabled: config.lockEnabled,
      unlocked: true,
      isAdmin: true,
      entitlement: "enabled",
    };
  }

  const entitlement = await getAssessmentPromptEntitlementStateForUser(user);

  if (entitlement !== "enabled") {
    /* Durable entitlement is the first gate for normal users. A stale unlock cookie must
       never bypass an explicit admin revocation of prompt-feature access. */
    return {
      lockEnabled: true,
      unlocked: false,
      isAdmin: false,
      entitlement,
    };
  }

  if (!config.lockEnabled) {
    return {
      lockEnabled: false,
      unlocked: true,
      isAdmin: false,
      entitlement,
    };
  }

  /* Lock enforcement is always server-authoritative. The browser only sends an opaque
     HttpOnly token; this helper verifies signature, expiry, owner uid, and password version. */
  const cookieValue = (await cookies()).get(ASSESSMENT_PROMPT_UNLOCK_COOKIE_NAME)?.value ?? null;

  return {
    lockEnabled: true,
    unlocked: hasValidPromptUnlockTokenForUser({
      token: cookieValue,
      userUid: user.uid,
      config,
    }),
    isAdmin: false,
    entitlement,
  };
}
