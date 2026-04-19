import "server-only";

import { createHash } from "node:crypto";

import { getZootopiaSql } from "@/lib/server/zootopia-postgres-adapter";

export type AuthAdmissionKind = "sign_in" | "sign_up";
export type AuthAdmissionMode = "enforce" | "disabled";

export type AuthAdmissionGovernanceCode =
  | "AUTH_ADMISSION_READY"
  | "AUTH_ADMISSION_ACCOUNT_WINDOW_EXHAUSTED"
  | "AUTH_ADMISSION_IP_WINDOW_EXHAUSTED";

type GovernanceScope = "account" | "ip";

type ScopeWindowSnapshot = {
  maxAttempts: number;
  usedAttempts: number;
  remainingAttempts: number;
  resetAt: string;
};

export type AuthAdmissionSnapshot = {
  kind: AuthAdmissionKind;
  mode: AuthAdmissionMode;
  allowed: boolean;
  governanceCode: AuthAdmissionGovernanceCode;
  retryAfterSeconds: number | null;
  nextAllowedAt: string | null;
  account: ScopeWindowSnapshot;
  ip: ScopeWindowSnapshot;
  /** Internal route helper: true when this request successfully reserved capacity. */
  reservationAccepted?: boolean;
};

export type AuthAdmissionConfig = {
  mode: AuthAdmissionMode;
  windowSeconds: number;
  hashSalt: string;
  signInAccountMaxAttempts: number;
  signInIpMaxAttempts: number;
  signUpAccountMaxAttempts: number;
  signUpIpMaxAttempts: number;
};

type GovernanceRow = {
  gate_name: string;
  key_scope: GovernanceScope;
  key_hash: string;
  window_starts_at: string;
  window_expires_at: string;
  attempt_count: number;
};

type MutableScopeWindow = {
  scope: GovernanceScope;
  keyHash: string;
  windowStartsAtMs: number;
  windowExpiresAtMs: number;
  attemptCount: number;
};

type GovernanceSubjectKeys = {
  accountKeyHash: string;
  /** null when the client IP cannot be determined safely from request headers. */
  ipKeyHash: string | null;
  /** false when IP detection failed and IP-scope limiting must be skipped. */
  ipDetected: boolean;
};

const DEFAULT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_SIGN_IN_ACCOUNT_MAX_ATTEMPTS = 12;
const DEFAULT_SIGN_IN_IP_MAX_ATTEMPTS = 60;
const DEFAULT_SIGN_UP_ACCOUNT_MAX_ATTEMPTS = 3;
const DEFAULT_SIGN_UP_IP_MAX_ATTEMPTS = 15;

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 500;
const MIN_WINDOW_SECONDS = 60;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const CANONICAL_HASH_SALT_ENV_KEY = "ZOOTOPIA_AUTH_ADMISSION_HASH_SALT";

let hasWarnedAboutMissingHashSalt = false;

function readEnv(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

function parseBoundedInt(input: {
  raw: string | undefined;
  fallback: number;
  min: number;
  max: number;
  envKey: string;
}) {
  const trimmed = readEnv(input.raw);
  if (!trimmed) {
    return input.fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(
      `[auth-admission-governance] Invalid ${input.envKey} value "${trimmed}", using ${input.fallback}.`,
    );
    return input.fallback;
  }

  if (parsed < input.min || parsed > input.max) {
    console.warn(
      `[auth-admission-governance] ${input.envKey}=${parsed} is outside ${input.min}-${input.max}, clamping.`,
    );
    return Math.min(input.max, Math.max(input.min, parsed));
  }

  return parsed;
}

function parseAdmissionMode(raw: string | undefined) {
  const normalized = readEnv(raw).toLowerCase();

  if (!normalized || normalized === "enforce") {
    return "enforce" satisfies AuthAdmissionMode;
  }

  if (normalized === "disabled") {
    return "disabled" satisfies AuthAdmissionMode;
  }

  console.warn(
    `[auth-admission-governance] Unknown ZOOTOPIA_AUTH_ADMISSION_MODE value "${raw}", defaulting to "enforce".`,
  );
  return "enforce" satisfies AuthAdmissionMode;
}

function resolveHashSalt(raw: string | undefined) {
  const hashSalt = readEnv(raw);
  if (hashSalt) {
    return hashSalt;
  }

  if (!hasWarnedAboutMissingHashSalt) {
    console.warn(
      "[auth-admission-governance] "
        + `${CANONICAL_HASH_SALT_ENV_KEY} is unset. `
        + "Stable salts keep per-account and per-IP buckets deterministic across deploys.",
    );
    hasWarnedAboutMissingHashSalt = true;
  }

  return "";
}

export function getAuthAdmissionConfig(): AuthAdmissionConfig {
  return {
    mode: parseAdmissionMode(process.env.ZOOTOPIA_AUTH_ADMISSION_MODE),
    windowSeconds: parseBoundedInt({
      raw: process.env.ZOOTOPIA_AUTH_ADMISSION_WINDOW_SECONDS,
      fallback: DEFAULT_WINDOW_SECONDS,
      min: MIN_WINDOW_SECONDS,
      max: MAX_WINDOW_SECONDS,
      envKey: "ZOOTOPIA_AUTH_ADMISSION_WINDOW_SECONDS",
    }),
    hashSalt: resolveHashSalt(process.env.ZOOTOPIA_AUTH_ADMISSION_HASH_SALT),
    signInAccountMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_AUTH_SIGNIN_ACCOUNT_MAX_ATTEMPTS,
      fallback: DEFAULT_SIGN_IN_ACCOUNT_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_AUTH_SIGNIN_ACCOUNT_MAX_ATTEMPTS",
    }),
    signInIpMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_AUTH_SIGNIN_IP_MAX_ATTEMPTS,
      fallback: DEFAULT_SIGN_IN_IP_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_AUTH_SIGNIN_IP_MAX_ATTEMPTS",
    }),
    signUpAccountMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_AUTH_SIGNUP_ACCOUNT_MAX_ATTEMPTS,
      fallback: DEFAULT_SIGN_UP_ACCOUNT_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_AUTH_SIGNUP_ACCOUNT_MAX_ATTEMPTS",
    }),
    signUpIpMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_AUTH_SIGNUP_IP_MAX_ATTEMPTS,
      fallback: DEFAULT_SIGN_UP_IP_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_AUTH_SIGNUP_IP_MAX_ATTEMPTS",
    }),
  };
}

function getForwardedIp(value: string | null) {
  if (!value) {
    return "";
  }

  return value.split(",")[0]?.trim() ?? "";
}

function normalizeIpCandidate(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  // Keep IPv6 literals intact while stripping common `ip:port` suffixes for IPv4 entries.
  if (trimmed.includes(":") && !trimmed.includes(".")) {
    return trimmed;
  }

  return trimmed.replace(/:\d+$/, "");
}

/**
 * Auth admission must never fall back to a shared "unknown-ip" bucket.
 * If the real client IP cannot be determined, account-scoped shaping still
 * applies while IP-scoped shaping is skipped to avoid globally blocking users.
 */
function getRequestIp(request: Request): string | null {
  const raw =
    normalizeIpCandidate(request.headers.get("x-real-ip") ?? "")
    || normalizeIpCandidate(getForwardedIp(request.headers.get("x-forwarded-for")))
    || normalizeIpCandidate(request.headers.get("x-vercel-forwarded-for") ?? "")
    || normalizeIpCandidate(request.headers.get("cf-connecting-ip") ?? "");

  if (!raw) {
    return null;
  }

  return raw.slice(0, 120);
}

function normalizeAdmissionEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashGovernanceSubject(input: {
  scope: GovernanceScope;
  value: string;
  salt: string;
}) {
  return createHash("sha256")
    .update(input.scope)
    .update("|")
    .update(input.salt)
    .update("|")
    .update(input.value)
    .digest("hex");
}

function toMs(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFreshWindow(input: {
  scope: GovernanceScope;
  keyHash: string;
  nowMs: number;
  windowMs: number;
}): MutableScopeWindow {
  return {
    scope: input.scope,
    keyHash: input.keyHash,
    windowStartsAtMs: input.nowMs,
    windowExpiresAtMs: input.nowMs + input.windowMs,
    attemptCount: 0,
  };
}

function hydrateScopeWindow(input: {
  scope: GovernanceScope;
  keyHash: string;
  row: GovernanceRow | undefined;
  nowMs: number;
  windowMs: number;
}): MutableScopeWindow {
  if (!input.row) {
    return buildFreshWindow({
      scope: input.scope,
      keyHash: input.keyHash,
      nowMs: input.nowMs,
      windowMs: input.windowMs,
    });
  }

  const startsAtMs = toMs(input.row.window_starts_at);
  const expiresAtMs = toMs(input.row.window_expires_at);

  if (
    !startsAtMs
    || !expiresAtMs
    || expiresAtMs <= startsAtMs
    || expiresAtMs <= input.nowMs
  ) {
    return buildFreshWindow({
      scope: input.scope,
      keyHash: input.keyHash,
      nowMs: input.nowMs,
      windowMs: input.windowMs,
    });
  }

  return {
    scope: input.scope,
    keyHash: input.keyHash,
    windowStartsAtMs: startsAtMs,
    windowExpiresAtMs: expiresAtMs,
    attemptCount: Math.max(0, Number(input.row.attempt_count) || 0),
  };
}

function toScopeSnapshot(input: {
  window: MutableScopeWindow;
  maxAttempts: number;
}) {
  const usedAttempts = Math.max(0, input.window.attemptCount);
  const remainingAttempts = Math.max(0, input.maxAttempts - usedAttempts);

  return {
    maxAttempts: input.maxAttempts,
    usedAttempts,
    remainingAttempts,
    resetAt: new Date(input.window.windowExpiresAtMs).toISOString(),
  } satisfies ScopeWindowSnapshot;
}

function getLimitsForKind(input: {
  kind: AuthAdmissionKind;
  config: AuthAdmissionConfig;
}) {
  if (input.kind === "sign_up") {
    return {
      accountMaxAttempts: input.config.signUpAccountMaxAttempts,
      ipMaxAttempts: input.config.signUpIpMaxAttempts,
      gateNamePrefix: "sign_up",
    } as const;
  }

  return {
    accountMaxAttempts: input.config.signInAccountMaxAttempts,
    ipMaxAttempts: input.config.signInIpMaxAttempts,
    gateNamePrefix: "sign_in",
  } as const;
}

function resolveBlockingState(input: {
  accountWindow: MutableScopeWindow;
  ipWindow: MutableScopeWindow;
  ipDetected: boolean;
  accountMaxAttempts: number;
  ipMaxAttempts: number;
  nowMs: number;
}) {
  const accountRemaining = Math.max(0, input.accountMaxAttempts - input.accountWindow.attemptCount);
  const ipRemaining = input.ipDetected
    ? Math.max(0, input.ipMaxAttempts - input.ipWindow.attemptCount)
    : Number.POSITIVE_INFINITY;

  if (accountRemaining <= 0) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((input.accountWindow.windowExpiresAtMs - input.nowMs) / 1000),
    );

    return {
      allowed: false,
      governanceCode: "AUTH_ADMISSION_ACCOUNT_WINDOW_EXHAUSTED" as const,
      retryAfterSeconds,
      nextAllowedAt: new Date(input.accountWindow.windowExpiresAtMs).toISOString(),
    };
  }

  if (ipRemaining <= 0) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((input.ipWindow.windowExpiresAtMs - input.nowMs) / 1000),
    );

    return {
      allowed: false,
      governanceCode: "AUTH_ADMISSION_IP_WINDOW_EXHAUSTED" as const,
      retryAfterSeconds,
      nextAllowedAt: new Date(input.ipWindow.windowExpiresAtMs).toISOString(),
    };
  }

  return {
    allowed: true,
    governanceCode: "AUTH_ADMISSION_READY" as const,
    retryAfterSeconds: null,
    nextAllowedAt: null,
  };
}

function buildSnapshot(input: {
  kind: AuthAdmissionKind;
  mode: AuthAdmissionMode;
  accountWindow: MutableScopeWindow;
  ipWindow: MutableScopeWindow;
  ipDetected: boolean;
  accountMaxAttempts: number;
  ipMaxAttempts: number;
  nowMs: number;
}) {
  const blocking = resolveBlockingState({
    accountWindow: input.accountWindow,
    ipWindow: input.ipWindow,
    ipDetected: input.ipDetected,
    accountMaxAttempts: input.accountMaxAttempts,
    ipMaxAttempts: input.ipMaxAttempts,
    nowMs: input.nowMs,
  });

  return {
    kind: input.kind,
    mode: input.mode,
    allowed: blocking.allowed,
    governanceCode: blocking.governanceCode,
    retryAfterSeconds: blocking.retryAfterSeconds,
    nextAllowedAt: blocking.nextAllowedAt,
    account: toScopeSnapshot({
      window: input.accountWindow,
      maxAttempts: input.accountMaxAttempts,
    }),
    ip: toScopeSnapshot({
      window: input.ipWindow,
      maxAttempts: input.ipMaxAttempts,
    }),
  } satisfies AuthAdmissionSnapshot;
}

function buildSubjectKeys(input: {
  request: Request;
  email: string;
  config: AuthAdmissionConfig;
}): GovernanceSubjectKeys {
  const normalizedEmail = normalizeAdmissionEmail(input.email);
  const ipAddress = getRequestIp(input.request);
  const ipDetected = ipAddress !== null;

  if (!ipDetected) {
    console.warn(
      "[auth-admission-governance] Client IP undetectable from request headers. "
        + "IP admission shaping will be skipped for this request.",
    );
  }

  return {
    accountKeyHash: hashGovernanceSubject({
      scope: "account",
      value: normalizedEmail,
      salt: input.config.hashSalt,
    }),
    ipKeyHash: ipDetected
      ? hashGovernanceSubject({
          scope: "ip",
          value: ipAddress!,
          salt: input.config.hashSalt,
        })
      : null,
    ipDetected,
  };
}

async function loadScopeWindowForUpdate(input: {
  gateName: string;
  sql: ReturnType<typeof getZootopiaSql>;
  scope: GovernanceScope;
  keyHash: string;
  nowMs: number;
  windowMs: number;
}) {
  const rows = await input.sql`
    SELECT
      gate_name,
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count
    FROM public.auth_admission_governance
    WHERE gate_name = ${input.gateName}
      AND key_scope = ${input.scope}
      AND key_hash = ${input.keyHash}
    FOR UPDATE
  `;

  const row = rows[0] as GovernanceRow | undefined;
  return hydrateScopeWindow({
    scope: input.scope,
    keyHash: input.keyHash,
    row,
    nowMs: input.nowMs,
    windowMs: input.windowMs,
  });
}

async function persistScopeWindow(input: {
  gateName: string;
  sql: ReturnType<typeof getZootopiaSql>;
  window: MutableScopeWindow;
}) {
  const startsAtIso = new Date(input.window.windowStartsAtMs).toISOString();
  const expiresAtIso = new Date(input.window.windowExpiresAtMs).toISOString();

  await input.sql`
    INSERT INTO public.auth_admission_governance (
      gate_name,
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count,
      last_admitted_at,
      created_at,
      updated_at
    )
    VALUES (
      ${input.gateName},
      ${input.window.scope},
      ${input.window.keyHash},
      ${startsAtIso},
      ${expiresAtIso},
      ${input.window.attemptCount},
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (gate_name, key_scope, key_hash)
    DO UPDATE SET
      window_starts_at = EXCLUDED.window_starts_at,
      window_expires_at = EXCLUDED.window_expires_at,
      attempt_count = EXCLUDED.attempt_count,
      last_admitted_at = NOW(),
      updated_at = NOW()
  `;
}

async function decrementScopeWindowAttempt(input: {
  gateName: string;
  sql: ReturnType<typeof getZootopiaSql>;
  scope: GovernanceScope;
  keyHash: string;
}) {
  await input.sql`
    UPDATE public.auth_admission_governance
    SET
      attempt_count = GREATEST(attempt_count - 1, 0),
      updated_at = NOW()
    WHERE gate_name = ${input.gateName}
      AND key_scope = ${input.scope}
      AND key_hash = ${input.keyHash}
  `;
}

/**
 * Server-backed public-auth admission control.
 * This keeps sign-up and login shaping consistent across concurrent requests and
 * across instances, instead of relying on per-process memory for the public edge.
 */
export async function reserveAuthAdmissionAttempt(input: {
  request: Request;
  email: string;
  kind: AuthAdmissionKind;
}): Promise<AuthAdmissionSnapshot> {
  const config = getAuthAdmissionConfig();
  if (config.mode === "disabled") {
    const nowMs = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const limits = getLimitsForKind({
      kind: input.kind,
      config,
    });
    const placeholderWindow = buildFreshWindow({
      scope: "account",
      keyHash: "disabled",
      nowMs,
      windowMs,
    });
    const placeholderIpWindow = buildFreshWindow({
      scope: "ip",
      keyHash: "disabled",
      nowMs,
      windowMs,
    });

    return buildSnapshot({
      kind: input.kind,
      mode: config.mode,
      accountWindow: placeholderWindow,
      ipWindow: placeholderIpWindow,
      ipDetected: false,
      accountMaxAttempts: limits.accountMaxAttempts,
      ipMaxAttempts: limits.ipMaxAttempts,
      nowMs,
    });
  }

  const nowMs = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const limits = getLimitsForKind({
    kind: input.kind,
    config,
  });
  const subjectKeys = buildSubjectKeys({
    request: input.request,
    email: input.email,
    config,
  });
  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    const accountWindow = await loadScopeWindowForUpdate({
      gateName: `${limits.gateNamePrefix}_account`,
      sql: txSql,
      scope: "account",
      keyHash: subjectKeys.accountKeyHash,
      nowMs,
      windowMs,
    });

    const ipKeyHash = subjectKeys.ipKeyHash ?? "undetected";
    const ipWindow = subjectKeys.ipDetected
      ? await loadScopeWindowForUpdate({
          gateName: `${limits.gateNamePrefix}_ip`,
          sql: txSql,
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs,
        })
      : buildFreshWindow({
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs,
        });

    const blocking = resolveBlockingState({
      accountWindow,
      ipWindow,
      ipDetected: subjectKeys.ipDetected,
      accountMaxAttempts: limits.accountMaxAttempts,
      ipMaxAttempts: limits.ipMaxAttempts,
      nowMs,
    });

    if (!blocking.allowed) {
      return buildSnapshot({
        kind: input.kind,
        mode: config.mode,
        accountWindow,
        ipWindow,
        ipDetected: subjectKeys.ipDetected,
        accountMaxAttempts: limits.accountMaxAttempts,
        ipMaxAttempts: limits.ipMaxAttempts,
        nowMs,
      });
    }

    accountWindow.attemptCount += 1;
    await persistScopeWindow({
      gateName: `${limits.gateNamePrefix}_account`,
      sql: txSql,
      window: accountWindow,
    });

    if (subjectKeys.ipDetected) {
      ipWindow.attemptCount += 1;
      await persistScopeWindow({
        gateName: `${limits.gateNamePrefix}_ip`,
        sql: txSql,
        window: ipWindow,
      });
    }

    return {
      ...buildSnapshot({
        kind: input.kind,
        mode: config.mode,
        accountWindow,
        ipWindow,
        ipDetected: subjectKeys.ipDetected,
        accountMaxAttempts: limits.accountMaxAttempts,
        ipMaxAttempts: limits.ipMaxAttempts,
        nowMs,
      }),
      reservationAccepted: true,
    };
  }) as Promise<AuthAdmissionSnapshot>;
}

export async function rollbackAuthAdmissionAttempt(input: {
  request: Request;
  email: string;
  kind: AuthAdmissionKind;
}): Promise<AuthAdmissionSnapshot> {
  const config = getAuthAdmissionConfig();
  const nowMs = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const limits = getLimitsForKind({
    kind: input.kind,
    config,
  });
  const subjectKeys = buildSubjectKeys({
    request: input.request,
    email: input.email,
    config,
  });
  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    const accountWindow = await loadScopeWindowForUpdate({
      gateName: `${limits.gateNamePrefix}_account`,
      sql: txSql,
      scope: "account",
      keyHash: subjectKeys.accountKeyHash,
      nowMs,
      windowMs,
    });

    if (accountWindow.attemptCount > 0) {
      accountWindow.attemptCount -= 1;
      await decrementScopeWindowAttempt({
        gateName: `${limits.gateNamePrefix}_account`,
        sql: txSql,
        scope: "account",
        keyHash: subjectKeys.accountKeyHash,
      });
    }

    const ipKeyHash = subjectKeys.ipKeyHash ?? "undetected";
    const ipWindow = subjectKeys.ipDetected
      ? await loadScopeWindowForUpdate({
          gateName: `${limits.gateNamePrefix}_ip`,
          sql: txSql,
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs,
        })
      : buildFreshWindow({
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs,
        });

    if (subjectKeys.ipDetected && ipWindow.attemptCount > 0) {
      ipWindow.attemptCount -= 1;
      await decrementScopeWindowAttempt({
        gateName: `${limits.gateNamePrefix}_ip`,
        sql: txSql,
        scope: "ip",
        keyHash: ipKeyHash,
      });
    }

    return buildSnapshot({
      kind: input.kind,
      mode: config.mode,
      accountWindow,
      ipWindow,
      ipDetected: subjectKeys.ipDetected,
      accountMaxAttempts: limits.accountMaxAttempts,
      ipMaxAttempts: limits.ipMaxAttempts,
      nowMs,
    });
  }) as Promise<AuthAdmissionSnapshot>;
}
