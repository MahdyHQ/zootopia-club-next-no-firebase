import "server-only";

import { createHash } from "node:crypto";

import { getZootopiaSql } from "@/lib/server/zootopia-postgres-adapter";

export type VerificationResendMode = "provider" | "disabled";

export type VerificationResendGovernanceCode =
  | "VERIFICATION_RESEND_READY"
  | "VERIFICATION_RESEND_COOLDOWN_ACTIVE"
  | "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_UNAVAILABLE";

type GovernanceScope = "account" | "ip";

type ScopeWindowSnapshot = {
  maxAttempts: number;
  usedAttempts: number;
  remainingAttempts: number;
  resetAt: string;
};

export type VerificationResendGovernanceSnapshot = {
  mode: VerificationResendMode;
  allowed: boolean;
  governanceCode: VerificationResendGovernanceCode;
  retryAfterSeconds: number | null;
  cooldownRemainingSeconds: number;
  nextAllowedAt: string | null;
  account: ScopeWindowSnapshot;
  ip: ScopeWindowSnapshot;
  hasAcceptedSend: boolean;
  lastAcceptedSendAt: string | null;
};

export type VerificationResendGovernanceConfig = {
  mode: VerificationResendMode;
  cooldownSeconds: number;
  accountMaxAttempts: number;
  accountWindowSeconds: number;
  ipMaxAttempts: number;
  ipWindowSeconds: number;
  hashSalt: string;
};

type GovernanceRow = {
  key_scope: GovernanceScope;
  key_hash: string;
  window_starts_at: string;
  window_expires_at: string;
  attempt_count: number;
  cooldown_until: string | null;
  last_provider_accepted_at: string | null;
};

type GovernanceAdminRow = GovernanceRow & {
  updated_at: string;
};

export type VerificationResendGovernanceAdminRecord = {
  keyScope: "account" | "ip";
  keyHash: string;
  windowStartsAt: string;
  windowExpiresAt: string;
  attemptCount: number;
  cooldownUntil: string | null;
  lastProviderAcceptedAt: string | null;
  updatedAt: string;
};

export type VerificationResendGovernanceAdminLookup = {
  mode: VerificationResendMode;
  accountKeyHash: string;
  accountRecord: VerificationResendGovernanceAdminRecord | null;
};

export type VerificationResendGovernanceAdminClearResult = {
  mode: VerificationResendMode;
  accountKeyHash: string;
  deleted: boolean;
};

type MutableScopeWindow = {
  scope: GovernanceScope;
  keyHash: string;
  windowStartsAtMs: number;
  windowExpiresAtMs: number;
  attemptCount: number;
  cooldownUntilMs: number | null;
  lastProviderAcceptedAt: string | null;
};

type GovernanceSubjectKeys = {
  accountKeyHash: string;
  /** null when client IP could not be determined from request headers */
  ipKeyHash: string | null;
  /** false when IP was undetectable — callers skip IP-scope rate limiting */
  ipDetected: boolean;
};

const DEFAULT_VERIFICATION_RESEND_COOLDOWN_SECONDS = 30;
const DEFAULT_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS = 5;
const DEFAULT_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS = 60 * 60;
const DEFAULT_VERIFICATION_RESEND_IP_MAX_ATTEMPTS = 20;
const DEFAULT_VERIFICATION_RESEND_IP_WINDOW_SECONDS = 60 * 60;

const MIN_COOLDOWN_SECONDS = 0;
const MAX_COOLDOWN_SECONDS = 30 * 60;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 500;
const MIN_WINDOW_SECONDS = 30;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = Math.floor(MAX_WINDOW_SECONDS / 60);

const GOVERNANCE_ENV_KEYS = {
  mode: [
    "ZOOTOPIA_EMAIL_VERIFICATION_RESEND_MODE",
    "ZOOTOPIA_VERIFICATION_RESEND_MODE",
  ],
  cooldownSeconds: [
    "ZOOTOPIA_EMAIL_VERIFICATION_COOLDOWN_SECONDS",
    "ZOOTOPIA_VERIFICATION_RESEND_COOLDOWN_SECONDS",
  ],
  accountMaxAttempts: [
    "ZOOTOPIA_EMAIL_VERIFICATION_MAX_ATTEMPTS",
    "ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS",
  ],
  accountWindowMinutes: [
    "ZOOTOPIA_EMAIL_VERIFICATION_WINDOW_MINUTES",
  ],
  accountWindowSecondsLegacy: [
    "ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS",
  ],
  ipMaxAttempts: [
    "ZOOTOPIA_EMAIL_VERIFICATION_IP_MAX_ATTEMPTS",
    "ZOOTOPIA_VERIFICATION_RESEND_IP_MAX_ATTEMPTS",
  ],
  ipWindowMinutes: [
    "ZOOTOPIA_EMAIL_VERIFICATION_IP_WINDOW_MINUTES",
  ],
  ipWindowSecondsLegacy: [
    "ZOOTOPIA_VERIFICATION_RESEND_IP_WINDOW_SECONDS",
  ],
  hashSalt: [
    "ZOOTOPIA_EMAIL_VERIFICATION_HASH_SALT",
    "ZOOTOPIA_VERIFICATION_RESEND_HASH_SALT",
  ],
} as const;

type ResolvedEnvValue = {
  raw: string | undefined;
  envKey: string;
};

function readEnv(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

function resolveEnvValue(envKeys: readonly string[]): ResolvedEnvValue {
  for (const envKey of envKeys) {
    const raw = readEnv(process.env[envKey]);
    if (raw) {
      return { raw, envKey };
    }
  }

  return {
    raw: undefined,
    envKey: envKeys[0],
  };
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
      `[verification-resend-governance] Invalid ${input.envKey} value "${trimmed}", using ${input.fallback}.`,
    );
    return input.fallback;
  }

  if (parsed < input.min || parsed > input.max) {
    console.warn(
      `[verification-resend-governance] ${input.envKey}=${parsed} is outside ${input.min}-${input.max}, clamping.`,
    );
    return Math.min(input.max, Math.max(input.min, parsed));
  }

  return parsed;
}

function parseVerificationResendMode(raw: string | undefined, envKey: string): VerificationResendMode {
  const normalized = readEnv(raw).toLowerCase();

  if (!normalized || normalized === "provider") {
    return "provider";
  }

  if (normalized === "disabled") {
    return "disabled";
  }

  console.warn(
    `[verification-resend-governance] Unknown ${envKey} value "${raw}", defaulting to "provider".`,
  );
  return "provider";
}

function parseWindowSecondsFromMinutesOrLegacySeconds(input: {
  minutesEnvKeys: readonly string[];
  legacySecondsEnvKeys: readonly string[];
  fallbackSeconds: number;
}) {
  const minutesSource = resolveEnvValue(input.minutesEnvKeys);
  if (minutesSource.raw) {
    const minutes = parseBoundedInt({
      raw: minutesSource.raw,
      fallback: Math.floor(input.fallbackSeconds / 60),
      min: MIN_WINDOW_MINUTES,
      max: MAX_WINDOW_MINUTES,
      envKey: minutesSource.envKey,
    });

    return minutes * 60;
  }

  const legacySecondsSource = resolveEnvValue(input.legacySecondsEnvKeys);
  return parseBoundedInt({
    raw: legacySecondsSource.raw,
    fallback: input.fallbackSeconds,
    min: MIN_WINDOW_SECONDS,
    max: MAX_WINDOW_SECONDS,
    envKey: legacySecondsSource.envKey,
  });
}

export function getVerificationResendGovernanceConfig(): VerificationResendGovernanceConfig {
  const mode = resolveEnvValue(GOVERNANCE_ENV_KEYS.mode);
  const cooldownSeconds = resolveEnvValue(GOVERNANCE_ENV_KEYS.cooldownSeconds);
  const accountMaxAttempts = resolveEnvValue(GOVERNANCE_ENV_KEYS.accountMaxAttempts);
  const ipMaxAttempts = resolveEnvValue(GOVERNANCE_ENV_KEYS.ipMaxAttempts);
  const hashSalt = resolveEnvValue(GOVERNANCE_ENV_KEYS.hashSalt);

  return {
    mode: parseVerificationResendMode(mode.raw, mode.envKey),
    cooldownSeconds: parseBoundedInt({
      raw: cooldownSeconds.raw,
      fallback: DEFAULT_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      min: MIN_COOLDOWN_SECONDS,
      max: MAX_COOLDOWN_SECONDS,
      envKey: cooldownSeconds.envKey,
    }),
    accountMaxAttempts: parseBoundedInt({
      raw: accountMaxAttempts.raw,
      fallback: DEFAULT_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: accountMaxAttempts.envKey,
    }),
    accountWindowSeconds: parseWindowSecondsFromMinutesOrLegacySeconds({
      minutesEnvKeys: GOVERNANCE_ENV_KEYS.accountWindowMinutes,
      legacySecondsEnvKeys: GOVERNANCE_ENV_KEYS.accountWindowSecondsLegacy,
      fallbackSeconds: DEFAULT_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS,
    }),
    ipMaxAttempts: parseBoundedInt({
      raw: ipMaxAttempts.raw,
      fallback: DEFAULT_VERIFICATION_RESEND_IP_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: ipMaxAttempts.envKey,
    }),
    ipWindowSeconds: parseWindowSecondsFromMinutesOrLegacySeconds({
      minutesEnvKeys: GOVERNANCE_ENV_KEYS.ipWindowMinutes,
      legacySecondsEnvKeys: GOVERNANCE_ENV_KEYS.ipWindowSecondsLegacy,
      fallbackSeconds: DEFAULT_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
    }),
    hashSalt: hashSalt.raw ?? "",
  };
}

export function normalizeVerificationResendEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidVerificationResendEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  // Keep IPv6 literals intact while stripping common "ip:port" suffixes for IPv4 entries.
  if (trimmed.includes(":") && !trimmed.includes(".")) {
    return trimmed;
  }

  return trimmed.replace(/:\d+$/, "");
}

/**
 * Extracts the real client IP from request headers.
 * Returns null when IP cannot be reliably determined — callers must skip
 * IP-based rate limiting in that case to avoid a shared "unknown" bucket
 * that would rate-limit ALL users once it exhausts.
 *
 * Header priority:
 *  1. x-real-ip                  — single clean value (Nginx, most proxies)
 *  2. x-forwarded-for            — comma list; first entry is the original client
 *  3. x-vercel-forwarded-for     — Vercel's own single-value equivalent
 *  4. cf-connecting-ip           — Cloudflare equivalent
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
    cooldownUntilMs: null,
    lastProviderAcceptedAt: null,
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
    cooldownUntilMs: toMs(input.row.cooldown_until),
    lastProviderAcceptedAt: input.row.last_provider_accepted_at,
  };
}

function toScopeSnapshot(input: {
  window: MutableScopeWindow;
  maxAttempts: number;
}): ScopeWindowSnapshot {
  const usedAttempts = Math.max(0, input.window.attemptCount);
  const remainingAttempts = Math.max(0, input.maxAttempts - usedAttempts);

  return {
    maxAttempts: input.maxAttempts,
    usedAttempts,
    remainingAttempts,
    resetAt: new Date(input.window.windowExpiresAtMs).toISOString(),
  };
}

/**
 * FIX: ipDetected param added.
 * When IP is undetectable, IP-scope limiting is skipped entirely (ipRemaining = Infinity).
 * This prevents a shared "unknown-ip" bucket from exhausting and blocking ALL users globally.
 */
function resolveGovernanceBlockingState(input: {
  config: VerificationResendGovernanceConfig;
  accountWindow: MutableScopeWindow;
  ipWindow: MutableScopeWindow;
  ipDetected: boolean;
  nowMs: number;
}) {
  if (input.config.mode === "disabled") {
    return {
      allowed: false,
      governanceCode: "VERIFICATION_RESEND_UNAVAILABLE" as const,
      retryAfterSeconds: null,
      nextAllowedAt: null,
    };
  }

  const accountRemaining = Math.max(
    0,
    input.config.accountMaxAttempts - input.accountWindow.attemptCount,
  );

  // When IP is undetectable, skip IP-scope limiting entirely.
  // Using Infinity prevents a shared "unknown-ip" bucket from blocking all users.
  const ipRemaining = input.ipDetected
    ? Math.max(0, input.config.ipMaxAttempts - input.ipWindow.attemptCount)
    : Infinity;

  const cooldownTargetMs = Math.max(
    input.accountWindow.cooldownUntilMs ?? 0,
    input.ipDetected ? (input.ipWindow.cooldownUntilMs ?? 0) : 0,
  );
  const cooldownRemainingSeconds = Math.max(
    0,
    Math.ceil((cooldownTargetMs - input.nowMs) / 1000),
  );

  if (accountRemaining <= 0) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((input.accountWindow.windowExpiresAtMs - input.nowMs) / 1000),
    );
    return {
      allowed: false,
      governanceCode: "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED" as const,
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
      governanceCode: "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED" as const,
      retryAfterSeconds,
      nextAllowedAt: new Date(input.ipWindow.windowExpiresAtMs).toISOString(),
    };
  }

  if (cooldownRemainingSeconds > 0) {
    return {
      allowed: false,
      governanceCode: "VERIFICATION_RESEND_COOLDOWN_ACTIVE" as const,
      retryAfterSeconds: cooldownRemainingSeconds,
      nextAllowedAt: new Date(cooldownTargetMs).toISOString(),
    };
  }

  return {
    allowed: true,
    governanceCode: "VERIFICATION_RESEND_READY" as const,
    retryAfterSeconds: null,
    nextAllowedAt: null,
  };
}

function buildGovernanceSnapshot(input: {
  config: VerificationResendGovernanceConfig;
  accountWindow: MutableScopeWindow;
  ipWindow: MutableScopeWindow;
  ipDetected: boolean;
  nowMs: number;
}): VerificationResendGovernanceSnapshot {
  const account = toScopeSnapshot({
    window: input.accountWindow,
    maxAttempts: input.config.accountMaxAttempts,
  });
  const ip = toScopeSnapshot({
    window: input.ipWindow,
    maxAttempts: input.config.ipMaxAttempts,
  });

  const cooldownTargetMs = Math.max(
    input.accountWindow.cooldownUntilMs ?? 0,
    input.ipDetected ? (input.ipWindow.cooldownUntilMs ?? 0) : 0,
  );
  const cooldownRemainingSeconds = Math.max(
    0,
    Math.ceil((cooldownTargetMs - input.nowMs) / 1000),
  );

  const blocking = resolveGovernanceBlockingState({
    config: input.config,
    accountWindow: input.accountWindow,
    ipWindow: input.ipWindow,
    ipDetected: input.ipDetected,
    nowMs: input.nowMs,
  });

  return {
    mode: input.config.mode,
    allowed: blocking.allowed,
    governanceCode: blocking.governanceCode,
    retryAfterSeconds: blocking.retryAfterSeconds,
    cooldownRemainingSeconds,
    nextAllowedAt: blocking.nextAllowedAt,
    account,
    ip,
    hasAcceptedSend: Boolean(input.accountWindow.lastProviderAcceptedAt),
    lastAcceptedSendAt: input.accountWindow.lastProviderAcceptedAt,
  };
}

function buildUnavailableSnapshot(config: VerificationResendGovernanceConfig) {
  const nowIso = new Date().toISOString();

  return {
    mode: config.mode,
    allowed: false,
    governanceCode: "VERIFICATION_RESEND_UNAVAILABLE" as const,
    retryAfterSeconds: null,
    cooldownRemainingSeconds: 0,
    nextAllowedAt: null,
    account: {
      maxAttempts: config.accountMaxAttempts,
      usedAttempts: 0,
      remainingAttempts: config.accountMaxAttempts,
      resetAt: nowIso,
    },
    ip: {
      maxAttempts: config.ipMaxAttempts,
      usedAttempts: 0,
      remainingAttempts: config.ipMaxAttempts,
      resetAt: nowIso,
    },
    hasAcceptedSend: false,
    lastAcceptedSendAt: null,
  } satisfies VerificationResendGovernanceSnapshot;
}

/**
 * FIX: Returns null ipKeyHash when IP is undetectable instead of falling back
 * to a shared "unknown-ip" string that would exhaust a single global bucket
 * and block all users after just 20 combined resend attempts.
 */
function buildSubjectKeys(input: {
  request: Request;
  email: string;
  config: VerificationResendGovernanceConfig;
}): GovernanceSubjectKeys {
  const normalizedEmail = normalizeVerificationResendEmail(input.email);
  const ipAddress = getRequestIp(input.request);
  const ipDetected = ipAddress !== null;

  if (!ipDetected) {
    console.warn(
      "[verification-resend-governance] Client IP undetectable from request headers. " +
        "IP-based rate limiting will be skipped for this request to prevent a shared " +
        "'unknown-ip' bucket from blocking all users.",
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

function buildAccountKeyHash(email: string, config: VerificationResendGovernanceConfig) {
  return hashGovernanceSubject({
    scope: "account",
    value: normalizeVerificationResendEmail(email),
    salt: config.hashSalt,
  });
}

function mapGovernanceAdminRow(row: GovernanceAdminRow): VerificationResendGovernanceAdminRecord {
  return {
    keyScope: row.key_scope,
    keyHash: row.key_hash,
    windowStartsAt: row.window_starts_at,
    windowExpiresAt: row.window_expires_at,
    attemptCount: Math.max(0, Number(row.attempt_count) || 0),
    cooldownUntil: row.cooldown_until,
    lastProviderAcceptedAt: row.last_provider_accepted_at,
    updatedAt: row.updated_at,
  };
}

async function loadScopeWindowForUpdate(input: {
  sql: ReturnType<typeof getZootopiaSql>;
  scope: GovernanceScope;
  keyHash: string;
  nowMs: number;
  windowMs: number;
}) {
  const rows = await input.sql`
    SELECT
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count,
      cooldown_until,
      last_provider_accepted_at
    FROM public.email_verification_resend_governance
    WHERE key_scope = ${input.scope} AND key_hash = ${input.keyHash}
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
  sql: ReturnType<typeof getZootopiaSql>;
  window: MutableScopeWindow;
}) {
  const startsAtIso = new Date(input.window.windowStartsAtMs).toISOString();
  const expiresAtIso = new Date(input.window.windowExpiresAtMs).toISOString();
  const cooldownUntilIso =
    input.window.cooldownUntilMs !== null
      ? new Date(input.window.cooldownUntilMs).toISOString()
      : null;

  await input.sql`
    INSERT INTO public.email_verification_resend_governance (
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count,
      cooldown_until,
      last_provider_accepted_at,
      created_at,
      updated_at
    )
    VALUES (
      ${input.window.scope},
      ${input.window.keyHash},
      ${startsAtIso},
      ${expiresAtIso},
      ${input.window.attemptCount},
      ${cooldownUntilIso},
      ${input.window.lastProviderAcceptedAt},
      NOW(),
      NOW()
    )
    ON CONFLICT (key_scope, key_hash)
    DO UPDATE SET
      window_starts_at          = EXCLUDED.window_starts_at,
      window_expires_at         = EXCLUDED.window_expires_at,
      attempt_count             = EXCLUDED.attempt_count,
      cooldown_until            = EXCLUDED.cooldown_until,
      last_provider_accepted_at = COALESCE(
        EXCLUDED.last_provider_accepted_at,
        public.email_verification_resend_governance.last_provider_accepted_at
      ),
      updated_at = NOW()
  `;
}

/**
 * Read-only governance snapshot.
 *
 * FIX: Removed the unnecessary sql.begin() + FOR UPDATE that the original used.
 * This was a read-only path that never mutated any rows, yet it held a
 * transaction-scoped connection lock on every GET poll, wasting pool slots
 * and contributing to MaxClientsInSessionMode exhaustion.
 *
 * Now uses parallel plain SELECTs with no transaction and no row locks.
 */
export async function readVerificationResendGovernanceSnapshot(input: {
  request: Request;
  email: string;
}): Promise<VerificationResendGovernanceSnapshot> {
  const config = getVerificationResendGovernanceConfig();

  if (config.mode === "disabled") {
    return buildUnavailableSnapshot(config);
  }

  const nowMs = Date.now();
  const subjectKeys = buildSubjectKeys({
    request: input.request,
    email: input.email,
    config,
  });

  const sql = getZootopiaSql();

  // Load both windows in parallel — plain reads, no locking needed for a snapshot.
  const [accountRow, ipRow] = await Promise.all([
    sql`
      SELECT
        key_scope,
        key_hash,
        window_starts_at,
        window_expires_at,
        attempt_count,
        cooldown_until,
        last_provider_accepted_at
      FROM public.email_verification_resend_governance
      WHERE key_scope = 'account'
        AND key_hash  = ${subjectKeys.accountKeyHash}
      LIMIT 1
    `.then((rows) => rows[0] as GovernanceRow | undefined),

    subjectKeys.ipKeyHash !== null
      ? sql`
          SELECT
            key_scope,
            key_hash,
            window_starts_at,
            window_expires_at,
            attempt_count,
            cooldown_until,
            last_provider_accepted_at
          FROM public.email_verification_resend_governance
          WHERE key_scope = 'ip'
            AND key_hash  = ${subjectKeys.ipKeyHash}
          LIMIT 1
        `.then((rows) => rows[0] as GovernanceRow | undefined)
      : Promise.resolve(undefined),
  ]);

  const accountWindow = hydrateScopeWindow({
    scope: "account",
    keyHash: subjectKeys.accountKeyHash,
    row: accountRow,
    nowMs,
    windowMs: config.accountWindowSeconds * 1000,
  });

  // Build a synthetic fresh IP window when IP is undetected (never persisted).
  const ipKeyHash = subjectKeys.ipKeyHash ?? "undetected";
  const ipWindow = hydrateScopeWindow({
    scope: "ip",
    keyHash: ipKeyHash,
    row: ipRow,
    nowMs,
    windowMs: config.ipWindowSeconds * 1000,
  });

  return buildGovernanceSnapshot({
    config,
    accountWindow,
    ipWindow,
    ipDetected: subjectKeys.ipDetected,
    nowMs,
  });
}

/**
 * Reserve a resend attempt inside a serialized transaction.
 *
 * FIX: IP window is only loaded, locked, incremented, and persisted when a
 * real IP was actually detected. When IP is undetectable the account-scope
 * window is still enforced, keeping per-user limits intact.
 */
export async function reserveVerificationResendAttempt(input: {
  request: Request;
  email: string;
}): Promise<VerificationResendGovernanceSnapshot> {
  const config = getVerificationResendGovernanceConfig();

  if (config.mode === "disabled") {
    return buildUnavailableSnapshot(config);
  }

  const nowMs = Date.now();
  const cooldownUntilMs = nowMs + config.cooldownSeconds * 1000;
  const subjectKeys = buildSubjectKeys({
    request: input.request,
    email: input.email,
    config,
  });

  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    const accountWindow = await loadScopeWindowForUpdate({
      sql: txSql,
      scope: "account",
      keyHash: subjectKeys.accountKeyHash,
      nowMs,
      windowMs: config.accountWindowSeconds * 1000,
    });

    // Only load and lock the IP window when we have a reliably detected IP.
    const ipKeyHash = subjectKeys.ipKeyHash ?? "undetected";
    const ipWindow = subjectKeys.ipDetected
      ? await loadScopeWindowForUpdate({
          sql: txSql,
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs: config.ipWindowSeconds * 1000,
        })
      : buildFreshWindow({
          scope: "ip",
          keyHash: ipKeyHash,
          nowMs,
          windowMs: config.ipWindowSeconds * 1000,
        });

    const blocking = resolveGovernanceBlockingState({
      config,
      accountWindow,
      ipWindow,
      ipDetected: subjectKeys.ipDetected,
      nowMs,
    });

    if (!blocking.allowed) {
      return buildGovernanceSnapshot({
        config,
        accountWindow,
        ipWindow,
        ipDetected: subjectKeys.ipDetected,
        nowMs,
      });
    }

    // Always increment the account-scope window.
    accountWindow.attemptCount += 1;
    accountWindow.cooldownUntilMs = cooldownUntilMs;
    await persistScopeWindow({ sql: txSql, window: accountWindow });

    // Only increment and persist the IP-scope window when IP was reliably detected.
    if (subjectKeys.ipDetected) {
      ipWindow.attemptCount += 1;
      ipWindow.cooldownUntilMs = cooldownUntilMs;
      await persistScopeWindow({ sql: txSql, window: ipWindow });
    }

    return buildGovernanceSnapshot({
      config,
      accountWindow,
      ipWindow,
      ipDetected: subjectKeys.ipDetected,
      nowMs,
    });
  }) as Promise<VerificationResendGovernanceSnapshot>;
}

export async function markVerificationResendProviderAccepted(input: {
  email: string;
}): Promise<void> {
  const config = getVerificationResendGovernanceConfig();
  if (config.mode === "disabled") {
    return;
  }

  const accountKeyHash = buildAccountKeyHash(input.email, config);

  const sql = getZootopiaSql();
  await sql`
    UPDATE public.email_verification_resend_governance
    SET
      last_provider_accepted_at = NOW(),
      updated_at                = NOW()
    WHERE key_scope = 'account' AND key_hash = ${accountKeyHash}
  `;
}

export async function readVerificationResendAccountGovernanceByEmail(input: {
  email: string;
}): Promise<VerificationResendGovernanceAdminLookup> {
  const config = getVerificationResendGovernanceConfig();
  const accountKeyHash = buildAccountKeyHash(input.email, config);

  const sql = getZootopiaSql();
  const rows = await sql`
    SELECT
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count,
      cooldown_until,
      last_provider_accepted_at,
      updated_at
    FROM public.email_verification_resend_governance
    WHERE key_scope = 'account' AND key_hash = ${accountKeyHash}
    LIMIT 1
  `;

  const row = rows[0] as GovernanceAdminRow | undefined;

  return {
    mode: config.mode,
    accountKeyHash,
    accountRecord: row ? mapGovernanceAdminRow(row) : null,
  };
}

export async function clearVerificationResendAccountGovernanceByEmail(input: {
  email: string;
}): Promise<VerificationResendGovernanceAdminClearResult> {
  const config = getVerificationResendGovernanceConfig();
  const accountKeyHash = buildAccountKeyHash(input.email, config);

  const sql = getZootopiaSql();
  const deletedRows = await sql`
    DELETE FROM public.email_verification_resend_governance
    WHERE key_scope = 'account' AND key_hash = ${accountKeyHash}
    RETURNING key_hash
  `;

  return {
    mode: config.mode,
    accountKeyHash,
    deleted: deletedRows.length > 0,
  };
}