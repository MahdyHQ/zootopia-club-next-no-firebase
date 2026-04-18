import "server-only";

import type { UserRole } from "@zootopia/shared-types";

import {
  getAllowlistedAdminEmails,
  isAllowlistedAdminEmail,
} from "@/lib/server/admin-auth";
import { getZootopiaSql } from "@/lib/server/zootopia-postgres-adapter";

export type ActiveNormalUserAdmissionReason =
  | "EXEMPT"
  | "CAPACITY_AVAILABLE"
  | "CAPACITY_FULL";

export type ActiveNormalUserCapacitySnapshot = {
  activeNormalUsers: number;
  maxActiveNormalUsers: number;
  sessionMinutes: number;
  availableSlots: number;
  isFull: boolean;
};

export type ActiveNormalUserAdmissionDecision = {
  allowed: boolean;
  exempt: boolean;
  reason: ActiveNormalUserAdmissionReason;
  snapshot: ActiveNormalUserCapacitySnapshot;
};

export type ActiveNormalUserAdmissionConfig = {
  maxActiveNormalUsers: number;
  sessionMinutes: number;
  exemptEmails: string[];
};

const DEFAULT_MAX_ACTIVE_NORMAL_USERS = 3;
const DEFAULT_ACTIVE_NORMAL_USER_SESSION_MINUTES = 15;
const MIN_ACTIVE_NORMAL_USER_LIMIT = 1;
const MAX_ACTIVE_NORMAL_USER_LIMIT = 100;
const MIN_ACTIVE_NORMAL_USER_SESSION_MINUTES = 1;
const MAX_ACTIVE_NORMAL_USER_SESSION_MINUTES = 24 * 60;
const REQUIRED_EXEMPT_EMAIL = "elmahdyabdulla208@gmail.com";

/* Capacity lease minutes govern only active_normal_user_sessions occupancy expiry.
  They do not alter Auth.js session TTL, which stays controlled by
  ZOOTOPIA_SESSION_TTL_SECONDS in session-config.ts. */

/**
 * This advisory lock serializes capacity decisions across concurrent requests/instances.
 * It prevents race over-admission when multiple normal-user logins hit the server at once.
 */
const ACTIVE_NORMAL_USER_CAPACITY_ADVISORY_LOCK_KEY = 381_104_202;

function readEnv(value: string | undefined) {
  return String(value ?? "").trim();
}

function unwrapSingleQuotedEnvValue(value: string) {
  const normalized = value.trim();
  if (normalized.length < 2) {
    return normalized;
  }

  const startsWithDoubleQuote = normalized.startsWith("\"");
  const endsWithDoubleQuote = normalized.endsWith("\"");
  if (startsWithDoubleQuote && endsWithDoubleQuote) {
    return normalized.slice(1, -1).trim();
  }

  const startsWithSingleQuote = normalized.startsWith("'");
  const endsWithSingleQuote = normalized.endsWith("'");
  if (startsWithSingleQuote && endsWithSingleQuote) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseBoundedInteger(input: {
  raw: string | undefined;
  fallback: number;
  min: number;
  max: number;
  envKey: string;
}) {
  const value = readEnv(input.raw);
  if (!value) {
    return input.fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(
      `[active-normal-user-session-governance] Invalid ${input.envKey} value "${value}", using ${input.fallback}.`,
    );
    return input.fallback;
  }

  if (parsed < input.min || parsed > input.max) {
    console.warn(
      `[active-normal-user-session-governance] ${input.envKey}=${parsed} is outside ${input.min}-${input.max}, clamping.`,
    );
  }

  return Math.min(input.max, Math.max(input.min, parsed));
}

function readConfiguredExemptEmails(raw: string | undefined) {
  const normalizedEnvValue = unwrapSingleQuotedEnvValue(readEnv(raw));
  const fromEnv = normalizedEnvValue
    /* Exempt-email env parsing must tolerate accidental quote wrapping and common delimiter
       variants so one malformed separator doesn't silently disable intended exemptions. Keep
       normalization here (server-side only) because active-user and platform-daily governance
       both consume this exact list as their authority source. */
    .split(/[,\n;]+/g)
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      const normalized = normalizeEmail(value);
      if (!normalized) {
        return [];
      }

      if (!isValidEmailAddress(normalized)) {
        console.warn(
          `[active-normal-user-session-governance] Ignoring malformed ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS entry "${value}".`,
        );
        return [];
      }

      return [normalized];
    });

  return Array.from(new Set([REQUIRED_EXEMPT_EMAIL, ...fromEnv]));
}

function getCapacityExcludedEmails(config: ActiveNormalUserAdmissionConfig) {
  return Array.from(
    new Set([...config.exemptEmails, ...getAllowlistedAdminEmails()]),
  );
}

function buildSnapshot(input: {
  activeNormalUsers: number;
  maxActiveNormalUsers: number;
  sessionMinutes: number;
}) {
  const activeNormalUsers = Math.max(0, input.activeNormalUsers);
  const maxActiveNormalUsers = Math.max(1, input.maxActiveNormalUsers);
  const availableSlots = Math.max(0, maxActiveNormalUsers - activeNormalUsers);

  return {
    activeNormalUsers,
    maxActiveNormalUsers,
    sessionMinutes: input.sessionMinutes,
    availableSlots,
    isFull: availableSlots <= 0,
  } satisfies ActiveNormalUserCapacitySnapshot;
}

async function readSnapshotBestEffort(config: ActiveNormalUserAdmissionConfig) {
  try {
    return await readActiveNormalUserCapacitySnapshot();
  } catch {
    return buildSnapshot({
      activeNormalUsers: 0,
      maxActiveNormalUsers: config.maxActiveNormalUsers,
      sessionMinutes: config.sessionMinutes,
    });
  }
}

function sanitizePositiveCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "bigint") {
    return Number(value > 0n ? value : 0n);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}

function normalizeUid(uid: string) {
  return uid.trim();
}

function isExemptEmail(email: string | null | undefined, config: ActiveNormalUserAdmissionConfig) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  if (isAllowlistedAdminEmail(normalizedEmail)) {
    return true;
  }

  return config.exemptEmails.includes(normalizedEmail);
}

function isExemptIdentity(input: {
  role: UserRole;
  email: string | null;
  config: ActiveNormalUserAdmissionConfig;
}) {
  if (input.role === "admin") {
    return true;
  }

  return isExemptEmail(input.email, input.config);
}

async function acquireCapacityLock(sql: ReturnType<typeof getZootopiaSql>) {
  await sql`SELECT pg_advisory_xact_lock(${ACTIVE_NORMAL_USER_CAPACITY_ADVISORY_LOCK_KEY})`;
}

async function purgeExpiredLeases(sql: ReturnType<typeof getZootopiaSql>) {
  await sql`
    DELETE FROM public.active_normal_user_sessions
    WHERE lease_expires_at <= NOW()
  `;
}

async function readActiveNormalUserCount(
  sql: ReturnType<typeof getZootopiaSql>,
  config: ActiveNormalUserAdmissionConfig,
) {
  const excludedEmails = getCapacityExcludedEmails(config);
  /* Live occupancy must exclude exempt/admin emails at read time as well as admission time.
     This protects the /login capacity snapshot from stale exempt leases that would otherwise
     crowd out real normal-user seats after a role change or env-based exemption update. */
  const rows = excludedEmails.length > 0
    ? await sql`
        SELECT COUNT(*)::int AS count
        FROM public.active_normal_user_sessions
        WHERE lease_expires_at > NOW()
          AND (email IS NULL OR email != ALL(${excludedEmails}))
      `
    : await sql`
        SELECT COUNT(*)::int AS count
        FROM public.active_normal_user_sessions
        WHERE lease_expires_at > NOW()
      `;

  const row = rows[0] as { count?: unknown } | undefined;
  return sanitizePositiveCount(row?.count ?? 0);
}

async function readHasEmailLease(sql: ReturnType<typeof getZootopiaSql>, email: string) {
  const rows = await sql`
    SELECT uid
    FROM public.active_normal_user_sessions
    WHERE email = ${email}
      AND lease_expires_at > NOW()
    LIMIT 1
  `;

  return rows.length > 0;
}

async function deleteLeaseByUid(sql: ReturnType<typeof getZootopiaSql>, uid: string) {
  await sql`
    DELETE FROM public.active_normal_user_sessions
    WHERE uid = ${uid}
  `;
}

export function getActiveNormalUserAdmissionConfig(): ActiveNormalUserAdmissionConfig {
  return {
    maxActiveNormalUsers: parseBoundedInteger({
      raw: process.env.ZOOTOPIA_ACTIVE_NORMAL_USER_LIMIT,
      fallback: DEFAULT_MAX_ACTIVE_NORMAL_USERS,
      min: MIN_ACTIVE_NORMAL_USER_LIMIT,
      max: MAX_ACTIVE_NORMAL_USER_LIMIT,
      envKey: "ZOOTOPIA_ACTIVE_NORMAL_USER_LIMIT",
    }),
    sessionMinutes: parseBoundedInteger({
      raw: process.env.ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES,
      fallback: DEFAULT_ACTIVE_NORMAL_USER_SESSION_MINUTES,
      min: MIN_ACTIVE_NORMAL_USER_SESSION_MINUTES,
      max: MAX_ACTIVE_NORMAL_USER_SESSION_MINUTES,
      envKey: "ZOOTOPIA_ACTIVE_NORMAL_USER_SESSION_MINUTES",
    }),
    exemptEmails: readConfiguredExemptEmails(
      process.env.ZOOTOPIA_ACTIVE_NORMAL_USER_EXEMPT_EMAILS,
    ),
  };
}

export function isActiveNormalUserExemptEmail(email: string | null | undefined) {
  const config = getActiveNormalUserAdmissionConfig();
  return isExemptEmail(email, config);
}

export function buildActiveNormalUserCapacityFullMessage(snapshot: ActiveNormalUserCapacitySnapshot) {
  return (
    `There are currently ${snapshot.activeNormalUsers} active users working on the platform `
    + `(maximum ${snapshot.maxActiveNormalUsers}). Please wait until a slot becomes available.`
  );
}

export async function readActiveNormalUserCapacitySnapshot() {
  const config = getActiveNormalUserAdmissionConfig();
  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    await acquireCapacityLock(txSql);
    await purgeExpiredLeases(txSql);

    const activeNormalUsers = await readActiveNormalUserCount(txSql, config);
    return buildSnapshot({
      activeNormalUsers,
      maxActiveNormalUsers: config.maxActiveNormalUsers,
      sessionMinutes: config.sessionMinutes,
    });
  }) as Promise<ActiveNormalUserCapacitySnapshot>;
}

/**
 * Public-login preflight check by email.
 * This does NOT reserve a slot; the decisive reserve happens inside Auth.js authorize.
 */
export async function evaluateActiveNormalUserAdmissionByEmail(input: {
  email: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    throw new Error("ACTIVE_NORMAL_USER_EMAIL_REQUIRED");
  }

  const config = getActiveNormalUserAdmissionConfig();

  if (isExemptEmail(normalizedEmail, config)) {
    const snapshot = await readSnapshotBestEffort(config);
    return {
      allowed: true,
      exempt: true,
      reason: "EXEMPT",
      snapshot,
    } satisfies ActiveNormalUserAdmissionDecision;
  }

  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    await acquireCapacityLock(txSql);
    await purgeExpiredLeases(txSql);

    const activeNormalUsers = await readActiveNormalUserCount(txSql, config);
    const snapshot = buildSnapshot({
      activeNormalUsers,
      maxActiveNormalUsers: config.maxActiveNormalUsers,
      sessionMinutes: config.sessionMinutes,
    });

    const hasExistingLease = await readHasEmailLease(txSql, normalizedEmail);
    if (hasExistingLease || !snapshot.isFull) {
      return {
        allowed: true,
        exempt: false,
        reason: "CAPACITY_AVAILABLE",
        snapshot,
      } satisfies ActiveNormalUserAdmissionDecision;
    }

    return {
      allowed: false,
      exempt: false,
      reason: "CAPACITY_FULL",
      snapshot,
    } satisfies ActiveNormalUserAdmissionDecision;
  }) as Promise<ActiveNormalUserAdmissionDecision>;
}

/**
 * Decisive server-authoritative reserve/renew operation.
 * This function is called from trusted server flows only (Auth.js authorize / session rehydration).
 */
export async function reserveOrRenewActiveNormalUserSessionLease(input: {
  uid: string;
  email: string | null;
  role: UserRole;
}) {
  const uid = normalizeUid(input.uid);
  if (!uid) {
    throw new Error("ACTIVE_NORMAL_USER_UID_REQUIRED");
  }

  const config = getActiveNormalUserAdmissionConfig();

  if (isExemptIdentity({ role: input.role, email: input.email, config })) {
    /* Exempt identities stay allowed even when lease persistence is degraded.
       Lease cleanup remains best-effort and never becomes a login blocker here. */
    void releaseActiveNormalUserSessionLease({ uid }).catch(() => undefined);

    const snapshot = await readSnapshotBestEffort(config);
    return {
      allowed: true,
      exempt: true,
      reason: "EXEMPT",
      snapshot,
    } satisfies ActiveNormalUserAdmissionDecision;
  }

  const sql = getZootopiaSql();

  return sql.begin(async (tx) => {
    const txSql = tx as unknown as ReturnType<typeof getZootopiaSql>;

    await acquireCapacityLock(txSql);
    await purgeExpiredLeases(txSql);

    const normalizedEmail = normalizeEmail(input.email);
    if (!normalizedEmail) {
      throw new Error("ACTIVE_NORMAL_USER_EMAIL_REQUIRED");
    }

    const existingRows = await txSql`
      SELECT uid
      FROM public.active_normal_user_sessions
      WHERE uid = ${uid}
        AND lease_expires_at > NOW()
      FOR UPDATE
    `;

    if (existingRows.length > 0) {
      await txSql`
        UPDATE public.active_normal_user_sessions
        SET
          email = ${normalizedEmail},
          last_seen_at = NOW(),
          lease_expires_at = NOW() + (${config.sessionMinutes} * INTERVAL '1 minute'),
          updated_at = NOW()
        WHERE uid = ${uid}
      `;

      const activeNormalUsers = await readActiveNormalUserCount(txSql, config);
      return {
        allowed: true,
        exempt: false,
        reason: "CAPACITY_AVAILABLE",
        snapshot: buildSnapshot({
          activeNormalUsers,
          maxActiveNormalUsers: config.maxActiveNormalUsers,
          sessionMinutes: config.sessionMinutes,
        }),
      } satisfies ActiveNormalUserAdmissionDecision;
    }

    const activeNormalUsers = await readActiveNormalUserCount(txSql, config);
    if (activeNormalUsers >= config.maxActiveNormalUsers) {
      return {
        allowed: false,
        exempt: false,
        reason: "CAPACITY_FULL",
        snapshot: buildSnapshot({
          activeNormalUsers,
          maxActiveNormalUsers: config.maxActiveNormalUsers,
          sessionMinutes: config.sessionMinutes,
        }),
      } satisfies ActiveNormalUserAdmissionDecision;
    }

    await txSql`
      INSERT INTO public.active_normal_user_sessions (
        uid,
        email,
        lease_started_at,
        last_seen_at,
        lease_expires_at,
        created_at,
        updated_at
      )
      VALUES (
        ${uid},
        ${normalizedEmail},
        NOW(),
        NOW(),
        NOW() + (${config.sessionMinutes} * INTERVAL '1 minute'),
        NOW(),
        NOW()
      )
      ON CONFLICT (uid)
      DO UPDATE SET
        email = EXCLUDED.email,
        lease_started_at = EXCLUDED.lease_started_at,
        last_seen_at = EXCLUDED.last_seen_at,
        lease_expires_at = EXCLUDED.lease_expires_at,
        updated_at = NOW()
    `;

    return {
      allowed: true,
      exempt: false,
      reason: "CAPACITY_AVAILABLE",
      snapshot: buildSnapshot({
        activeNormalUsers: activeNormalUsers + 1,
        maxActiveNormalUsers: config.maxActiveNormalUsers,
        sessionMinutes: config.sessionMinutes,
      }),
    } satisfies ActiveNormalUserAdmissionDecision;
  }) as Promise<ActiveNormalUserAdmissionDecision>;
}

export async function releaseActiveNormalUserSessionLease(input: {
  uid: string;
}) {
  const uid = normalizeUid(input.uid);
  if (!uid) {
    return;
  }

  const sql = getZootopiaSql();
  await deleteLeaseByUid(sql, uid);
}
