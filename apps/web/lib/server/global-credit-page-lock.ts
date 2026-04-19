import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { SessionUser } from "@zootopia/shared-types";
import { cookies } from "next/headers";

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

const GLOBAL_CREDIT_PAGE_LOCK_ENABLED_ENV_KEY =
  "ZOOTOPIA_GLOBAL_CREDIT_PAGE_LOCK_ENABLED";
const GLOBAL_CREDIT_PAGE_PASSWORD_ENV_KEY =
  "ZOOTOPIA_GLOBAL_CREDIT_PAGE_PASSWORD";
const GLOBAL_CREDIT_PAGE_UNLOCK_COOKIE_NAME = "zootopia_global_credit_unlock";
const GLOBAL_CREDIT_PAGE_UNLOCK_TOKEN_VERSION = 1;

/* These env/cookie identifiers keep their older "global credit page" names for compatibility,
   but the guarded surface is the owner-scoped assessment credits page at `/credits`. Avoid
   introducing new runtime contracts that imply this gate protects a true cross-tool wallet. */

type GlobalCreditPageUnlockPayload = {
  v: number;
  uid: string;
  exp: number;
  fp: string;
};

type GlobalCreditPageLockConfig = {
  lockEnabled: boolean;
  password: string | null;
  passwordComparisonValues: string[];
  passwordHasQuotedWrapper: boolean;
  passwordFingerprint: string | null;
  signingSecret: string | null;
  signingSecretSource: PasswordGateSecretSource | null;
  cookieMaxAgeSeconds: number;
};

export type GlobalCreditPageAccessState = {
  lockEnabled: boolean;
  unlocked: boolean;
  isAdmin: boolean;
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

function buildUnlockSignature(payloadSegment: string, signingSecret: string) {
  return createHmac("sha256", signingSecret).update(payloadSegment).digest();
}

function readLockConfig(): GlobalCreditPageLockConfig {
  const passwordConfig = readPasswordGateMatchConfig(
    process.env[GLOBAL_CREDIT_PAGE_PASSWORD_ENV_KEY],
  );
  const signingSecret = resolvePasswordGateSigningSecret();
  const explicitLockEnabled = readPasswordGateBooleanFlag(
    process.env[GLOBAL_CREDIT_PAGE_LOCK_ENABLED_ENV_KEY],
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

function signUnlockPayload(
  payload: GlobalCreditPageUnlockPayload,
  signingSecret: string,
) {
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signatureSegment = toBase64Url(
    buildUnlockSignature(payloadSegment, signingSecret),
  );
  return `${payloadSegment}.${signatureSegment}`;
}

function readValidatedUnlockPayload(input: {
  token: string;
  signingSecret: string;
}): GlobalCreditPageUnlockPayload | null {
  const [payloadSegment, signatureSegment, ...rest] = input.token.split(".");
  if (!payloadSegment || !signatureSegment || rest.length > 0) {
    return null;
  }

  const providedSignature = fromBase64Url(signatureSegment);
  if (!providedSignature) {
    return null;
  }

  const expectedSignature = buildUnlockSignature(
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
      GlobalCreditPageUnlockPayload
    >;
    if (
      parsed.v !== GLOBAL_CREDIT_PAGE_UNLOCK_TOKEN_VERSION
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

function hasValidUnlockTokenForUser(input: {
  token: string | null;
  userUid: string;
  config: GlobalCreditPageLockConfig;
}) {
  if (!input.token || !input.config.signingSecret || !input.config.passwordFingerprint) {
    return false;
  }

  const payload = readValidatedUnlockPayload({
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

export function getGlobalCreditPageUnlockCookieName() {
  return GLOBAL_CREDIT_PAGE_UNLOCK_COOKIE_NAME;
}

export function getGlobalCreditPageUnlockCookieOptions(maxAgeSeconds: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

export function getGlobalCreditPageLockRuntimeState() {
  const config = readLockConfig();

  return {
    lockEnabled: config.lockEnabled,
    signingReady: Boolean(config.signingSecret && config.passwordFingerprint),
    cookieMaxAgeSeconds: config.cookieMaxAgeSeconds,
    passwordConfigured: Boolean(config.password),
    passwordHasQuotedWrapper: config.passwordHasQuotedWrapper,
    signingSecretSource: config.signingSecretSource,
  };
}

export function isGlobalCreditPagePasswordValid(inputPassword: string) {
  const config = readLockConfig();
  if (!config.lockEnabled || !config.password) {
    return false;
  }

  const normalizedInput = normalizeSubmittedPasswordGateValue(inputPassword);
  return hasTimingSafeStringMatchAny(
    normalizedInput,
    config.passwordComparisonValues,
  );
}

export function buildGlobalCreditPageUnlockCookieValueForUser(userUid: string) {
  const config = readLockConfig();
  if (!config.lockEnabled || !config.signingSecret || !config.passwordFingerprint) {
    return null;
  }

  /* The assessment credits page unlock is session-scoped and user-bound. Keeping the password
     fingerprint in the signed payload ensures env password rotations revoke previous unlock
     cookies instantly. */
  return signUnlockPayload(
    {
      v: GLOBAL_CREDIT_PAGE_UNLOCK_TOKEN_VERSION,
      uid: userUid,
      exp: Date.now() + config.cookieMaxAgeSeconds * 1000,
      fp: config.passwordFingerprint,
    },
    config.signingSecret,
  );
}

export async function getGlobalCreditPageAccessStateForUser(
  user: Pick<SessionUser, "uid" | "role">,
): Promise<GlobalCreditPageAccessState> {
  const config = readLockConfig();

  if (user.role === "admin") {
    return {
      lockEnabled: config.lockEnabled,
      unlocked: true,
      isAdmin: true,
    };
  }

  if (!config.lockEnabled) {
    return {
      lockEnabled: false,
      unlocked: true,
      isAdmin: false,
    };
  }

  const cookieValue = (await cookies()).get(GLOBAL_CREDIT_PAGE_UNLOCK_COOKIE_NAME)?.value ?? null;
  return {
    lockEnabled: true,
    unlocked: hasValidUnlockTokenForUser({
      token: cookieValue,
      userUid: user.uid,
      config,
    }),
    isAdmin: false,
  };
}
