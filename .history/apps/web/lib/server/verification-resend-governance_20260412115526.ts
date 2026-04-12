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
  ipKeyHash: string;
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

function parseVerificationResendMode(raw: string | undefined): VerificationResendMode {
  const normalized = readEnv(raw).toLowerCase();

  if (!normalized || normalized === "provider") {
    return "provider";
  }

  if (normalized === "disabled") {
    return "disabled";
  }

  console.warn(
    `[verification-resend-governance] Unknown ZOOTOPIA_VERIFICATION_RESEND_MODE value "${raw}", defaulting to "provider".`,
  );
  return "provider";
}

export function getVerificationResendGovernanceConfig(): VerificationResendGovernanceConfig {
  return {
    mode: parseVerificationResendMode(process.env.ZOOTOPIA_VERIFICATION_RESEND_MODE),
    cooldownSeconds: parseBoundedInt({
      raw: process.env.ZOOTOPIA_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      fallback: DEFAULT_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      min: MIN_COOLDOWN_SECONDS,
      max: MAX_COOLDOWN_SECONDS,
      envKey: "ZOOTOPIA_VERIFICATION_RESEND_COOLDOWN_SECONDS",
    }),
    accountMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS,
      fallback: DEFAULT_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_MAX_ATTEMPTS",
    }),
    accountWindowSeconds: parseBoundedInt({
      raw: process.env.ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS,
      fallback: DEFAULT_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS,
      min: MIN_WINDOW_SECONDS,
      max: MAX_WINDOW_SECONDS,
      envKey: "ZOOTOPIA_VERIFICATION_RESEND_ACCOUNT_WINDOW_SECONDS",
    }),
    ipMaxAttempts: parseBoundedInt({
      raw: process.env.ZOOTOPIA_VERIFICATION_RESEND_IP_MAX_ATTEMPTS,
      fallback: DEFAULT_VERIFICATION_RESEND_IP_MAX_ATTEMPTS,
      min: MIN_ATTEMPTS,
      max: MAX_ATTEMPTS,
      envKey: "ZOOTOPIA_VERIFICATION_RESEND_IP_MAX_ATTEMPTS",
    }),
    ipWindowSeconds: parseBoundedInt({
      raw: process.env.ZOOTOPIA_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
      fallback: DEFAULT_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
      min: MIN_WINDOW_SECONDS,
      max: MAX_WINDOW_SECONDS,
      envKey: "ZOOTOPIA_VERIFICATION_RESEND_IP_WINDOW_SECONDS",
    }),
    hashSalt: readEnv(process.env.ZOOTOPIA_VERIFICATION_RESEND_HASH_SALT),
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

function getRequestIp(request: Request) {
  const ip =
    normalizeIpCandidate(getForwardedIp(request.headers.get("x-forwarded-for")))
    || normalizeIpCandidate(request.headers.get("x-real-ip") ?? "")
    || "unknown-ip";

  return ip.slice(0, 120);
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

function resolveGovernanceBlockingState(input: {
  config: VerificationResendGovernanceConfig;
  accountWindow: MutableScopeWindow;
  ipWindow: MutableScopeWindow;
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
  const ipRemaining = Math.max(0, input.config.ipMaxAttempts - input.ipWindow.attemptCount);

  const cooldownTargetMs = Math.max(
    input.accountWindow.cooldownUntilMs ?? 0,
    input.ipWindow.cooldownUntilMs ?? 0,
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
    input.ipWindow.cooldownUntilMs ?? 0,
  );
  const cooldownRemainingSeconds = Math.max(
    0,
    Math.ceil((cooldownTargetMs - input.nowMs) / 1000),
  );

  const blocking = resolveGovernanceBlockingState({
    config: input.config,
    accountWindow: input.accountWindow,
    ipWindow: input.ipWindow,
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

function buildSubjectKeys(input: {
  request: Request;
  email: string;
  config: VerificationResendGovernanceConfig;
}): GovernanceSubjectKeys {
  const normalizedEmail = normalizeVerificationResendEmail(input.email);
  const ipAddress = getRequestIp(input.request);

  return {
    accountKeyHash: hashGovernanceSubject({
      scope: "account",
      value: normalizedEmail,
      salt: input.config.hashSalt,
    }),
    ipKeyHash: hashGovernanceSubject({
      scope: "ip",
      value: ipAddress,
      salt: input.config.hashSalt,
    }),
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
    select
      key_scope,
      key_hash,
      window_starts_at,
      window_expires_at,
      attempt_count,
      cooldown_until,
      last_provider_accepted_at
    from public.email_verification_resend_governance
    where key_scope = ${input.scope} and key_hash = ${input.keyHash}
    for update
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
    insert into public.email_verification_resend_governance (
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
    values (
      ${input.window.scope},
      ${input.window.keyHash},
      ${startsAtIso},
      ${expiresAtIso},
      ${input.window.attemptCount},
      ${cooldownUntilIso},
      ${input.window.lastProviderAcceptedAt},
      now(),
      now()
    )
    on conflict (key_scope, key_hash)
    do update set
      window_starts_at = excluded.window_starts_at,
      window_expires_at = excluded.window_expires_at,
      attempt_count = excluded.attempt_count,
      cooldown_until = excluded.cooldown_until,
      last_provider_accepted_at = coalesce(
        excluded.last_provider_accepted_at,
        public.email_verification_resend_governance.last_provider_accepted_at
      ),
      updated_at = now()
  `;
}

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

  return sql.begin(async (tx) => {
    const accountWindow = await loadScopeWindowForUpdate({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      scope: "account",
      keyHash: subjectKeys.accountKeyHash,
      nowMs,
      windowMs: config.accountWindowSeconds * 1000,
    });

    const ipWindow = await loadScopeWindowForUpdate({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      scope: "ip",
      keyHash: subjectKeys.ipKeyHash,
      nowMs,
      windowMs: config.ipWindowSeconds * 1000,
    });

    return buildGovernanceSnapshot({
      config,
      accountWindow,
      ipWindow,
      nowMs,
    });
  }) as Promise<VerificationResendGovernanceSnapshot>;
}

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
    const accountWindow = await loadScopeWindowForUpdate({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      scope: "account",
      keyHash: subjectKeys.accountKeyHash,
      nowMs,
      windowMs: config.accountWindowSeconds * 1000,
    });

    const ipWindow = await loadScopeWindowForUpdate({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      scope: "ip",
      keyHash: subjectKeys.ipKeyHash,
      nowMs,
      windowMs: config.ipWindowSeconds * 1000,
    });

    const blocking = resolveGovernanceBlockingState({
      config,
      accountWindow,
      ipWindow,
      nowMs,
    });

    if (!blocking.allowed) {
      return buildGovernanceSnapshot({
        config,
        accountWindow,
        ipWindow,
        nowMs,
      });
    }

    accountWindow.attemptCount += 1;
    accountWindow.cooldownUntilMs = cooldownUntilMs;

    ipWindow.attemptCount += 1;
    ipWindow.cooldownUntilMs = cooldownUntilMs;

    await persistScopeWindow({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      window: accountWindow,
    });
    await persistScopeWindow({
      sql: tx as ReturnType<typeof getZootopiaSql>,
      window: ipWindow,
    });

    return buildGovernanceSnapshot({
      config,
      accountWindow,
      ipWindow,
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

  const accountKeyHash = hashGovernanceSubject({
    scope: "account",
    value: normalizeVerificationResendEmail(input.email),
    salt: config.hashSalt,
  });

  const sql = getZootopiaSql();
  await sql`
    update public.email_verification_resend_governance
    set
      last_provider_accepted_at = now(),
      updated_at = now()
    where key_scope = 'account' and key_hash = ${accountKeyHash}
  `;
}
