import "server-only";

import type {
  AssessmentCreditAccountAccess,
  AssessmentDailyCreditsSummary,
  PlatformDailyUsageSummary,
  UserRole,
} from "@zootopia/shared-types";

import {
  buildPlatformDailyUsageSummary as buildSharedPlatformDailyUsageSummary,
  getPlatformGlobalDailyCreditLimit,
  PLATFORM_GLOBAL_DAILY_USAGE_LIMIT_ENV_KEY,
} from "@/lib/server/platform-usage-aggregation";

export const ASSESSMENT_DAILY_SUCCESS_LIMIT_FALLBACK = 3;
export const ASSESSMENT_DAILY_SUCCESS_LIMIT = ASSESSMENT_DAILY_SUCCESS_LIMIT_FALLBACK;
export const ASSESSMENT_DAILY_CREDIT_TIME_ZONE = "UTC";
export const ASSESSMENT_DAILY_RESERVATION_TTL_MS = 30 * 60 * 1000;
export const ASSESSMENT_DAILY_SUCCESS_LIMIT_ENV_KEY =
  "ZOOTOPIA_DEFAULT_DAILY_ASSESSMENT_CREDITS";
export const ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_ENV_KEY =
  "ZOOTOPIA_ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS";
/* Compatibility export for older assessment imports. The env key now belongs to the shared
   platform aggregation layer; assessment only consumes the resulting global lock snapshot. */
export const ASSESSMENT_PLATFORM_DAILY_USAGE_LIMIT_ENV_KEY =
  PLATFORM_GLOBAL_DAILY_USAGE_LIMIT_ENV_KEY;
export { getPlatformGlobalDailyCreditLimit };
const ASSESSMENT_DAILY_SUCCESS_LIMIT_MIN = 1;
const ASSESSMENT_DAILY_SUCCESS_LIMIT_MAX = 1000;
const ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_FALLBACK = 24;
const ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MIN = 1;
const ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MAX = 168;
const ASSESSMENT_RENEWAL_WINDOW_KEY_PREFIX = "utc";
const ONE_HOUR_MS = 60 * 60 * 1000;

export type AssessmentDailyCreditReservationSource = "daily" | "extra";

function parsePositiveInteger(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  /* Credit/runtime env keys must reject partial numeric strings such as `33abc` or `33.7`.
     This parser feeds platform daily-capacity, per-user daily-limit, and renewal-window
     governance, so accepting truncated values would make `.env` drift harder to spot. */
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getDefaultDailyAssessmentCreditsLimit() {
  const parsed = parsePositiveInteger(
    process.env[ASSESSMENT_DAILY_SUCCESS_LIMIT_ENV_KEY],
  );
  if (parsed) {
    return Math.min(
      ASSESSMENT_DAILY_SUCCESS_LIMIT_MAX,
      Math.max(ASSESSMENT_DAILY_SUCCESS_LIMIT_MIN, parsed),
    );
  }

  return ASSESSMENT_DAILY_SUCCESS_LIMIT_FALLBACK;
}

export function getAssessmentCreditRenewalWindowHours() {
  const parsed = parsePositiveInteger(
    process.env[ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_ENV_KEY],
  );
  if (!parsed) {
    return ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_FALLBACK;
  }

  return Math.min(
    ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MAX,
    Math.max(ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MIN, parsed),
  );
}

export function normalizeAssessmentDailyLimitOverride(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < ASSESSMENT_DAILY_SUCCESS_LIMIT_MIN) {
    return null;
  }

  return Math.min(ASSESSMENT_DAILY_SUCCESS_LIMIT_MAX, rounded);
}

export function resolveAssessmentDailyCreditsLimit(input: {
  override?: unknown;
  fallback?: number;
}) {
  const normalizedOverride = normalizeAssessmentDailyLimitOverride(input.override);
  if (normalizedOverride) {
    return normalizedOverride;
  }

  return normalizeAssessmentDailyLimitOverride(input.fallback)
    ?? getDefaultDailyAssessmentCreditsLimit();
}

export type AssessmentDailyCreditReservation = {
  id: string;
  dayKey: string;
  reservedAt: string;
  source: AssessmentDailyCreditReservationSource;
};

export type AssessmentDailyCreditLedgerDocument = {
  id: string;
  ownerUid: string;
  dayKey: string;
  dailyLimit: number;
  successfulGenerationIds: string[];
  /* Platform-wide usage lock must count successful generations from both daily and extra credit
     sources. Keep this separate from `successfulGenerationIds` so per-user daily quota math stays
     tied to daily-backed consumption only. */
  platformSuccessfulGenerationIds: string[];
  pendingReservations: AssessmentDailyCreditReservation[];
  createdAt: string;
  updatedAt: string;
};

function padUtcDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function buildLegacyDailyWindow(now: Date) {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();
  const windowStartsAt = new Date(Date.UTC(year, monthIndex, dayOfMonth, 0, 0, 0, 0));
  const resetsAt = new Date(Date.UTC(year, monthIndex, dayOfMonth + 1, 0, 0, 0, 0));

  return {
    dayKey: `${year}-${padUtcDatePart(monthIndex + 1)}-${padUtcDatePart(dayOfMonth)}`,
    windowStartsAt: windowStartsAt.toISOString(),
    resetsAt: resetsAt.toISOString(),
  };
}

function buildRenewalWindowKey(input: {
  renewalWindowHours: number;
  windowStartsAtMs: number;
}) {
  return `${ASSESSMENT_RENEWAL_WINDOW_KEY_PREFIX}-${input.renewalWindowHours}h-${input.windowStartsAtMs}`;
}

function parseRenewalWindowKey(dayKey: string) {
  const normalized = dayKey.trim();
  const match = /^utc-(\d{1,3})h-(\d+)$/.exec(normalized);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] || "", 10);
  const windowStartMs = Number.parseInt(match[2] || "", 10);
  if (
    !Number.isFinite(hours)
    || !Number.isFinite(windowStartMs)
    || hours < ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MIN
    || hours > ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_MAX
    || windowStartMs < 0
  ) {
    return null;
  }

  return {
    hours,
    windowStartMs,
  };
}

/* Assessment credits intentionally resolve against canonical UTC renewal windows.
  Keep this timezone fixed so Vercel/server runtime instances, local development, and repository
  writes agree on the same reset boundary instead of drifting by browser locale or region. */
export function resolveAssessmentDailyCreditWindow(now = new Date()) {
  const renewalWindowHours = getAssessmentCreditRenewalWindowHours();
  if (renewalWindowHours === ASSESSMENT_CREDIT_RENEWAL_WINDOW_HOURS_FALLBACK) {
    return buildLegacyDailyWindow(now);
  }

  const renewalWindowMs = renewalWindowHours * ONE_HOUR_MS;
  const nowMs = now.getTime();
  const windowStartsAtMs = Math.floor(nowMs / renewalWindowMs) * renewalWindowMs;
  const resetsAtMs = windowStartsAtMs + renewalWindowMs;

  return {
    dayKey: buildRenewalWindowKey({
      renewalWindowHours,
      windowStartsAtMs,
    }),
    windowStartsAt: new Date(windowStartsAtMs).toISOString(),
    resetsAt: new Date(resetsAtMs).toISOString(),
  };
}

export function getAssessmentDailyCreditResetAt(dayKey: string) {
  const parsedRenewalWindowKey = parseRenewalWindowKey(dayKey);
  if (parsedRenewalWindowKey) {
    return new Date(
      parsedRenewalWindowKey.windowStartMs + parsedRenewalWindowKey.hours * ONE_HOUR_MS,
    ).toISOString();
  }

  const [yearRaw, monthRaw, dayRaw] = dayKey.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const month = Number.parseInt(monthRaw || "", 10);
  const day = Number.parseInt(dayRaw || "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return resolveAssessmentDailyCreditWindow(new Date()).resetsAt;
  }

  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0)).toISOString();
}

export function buildAssessmentDailyCreditDocumentId(ownerUid: string, dayKey: string) {
  return `${ownerUid}__${dayKey}`;
}

/* Admin sessions remain intentionally exempt from the student-style daily assessment cap.
   Keep the exemption server-side so route guessing or client state can never decide who is
   charged and who is allowed to bypass the normal-user limit. */
export function isAssessmentDailyCreditsExempt(role: UserRole) {
  return role === "admin";
}

export function createEmptyAssessmentDailyCreditLedger(input: {
  ownerUid: string;
  dayKey: string;
  nowIso: string;
}) {
  return {
    id: buildAssessmentDailyCreditDocumentId(input.ownerUid, input.dayKey),
    ownerUid: input.ownerUid,
    dayKey: input.dayKey,
    dailyLimit: getDefaultDailyAssessmentCreditsLimit(),
    successfulGenerationIds: [],
    platformSuccessfulGenerationIds: [],
    pendingReservations: [],
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  } satisfies AssessmentDailyCreditLedgerDocument;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeAssessmentDailyCreditLedger(input: {
  ownerUid: string;
  dayKey: string;
  record: Partial<AssessmentDailyCreditLedgerDocument> | null | undefined;
  nowIso: string;
}) {
  const fallback = createEmptyAssessmentDailyCreditLedger({
    ownerUid: input.ownerUid,
    dayKey: input.dayKey,
    nowIso: input.nowIso,
  });
  const successfulGenerationIds = Array.isArray(input.record?.successfulGenerationIds)
    ? uniqueStrings(
        input.record.successfulGenerationIds.map((value) => String(value || "").trim()),
      )
    : fallback.successfulGenerationIds;
  const platformSuccessfulGenerationIds = Array.isArray(input.record?.platformSuccessfulGenerationIds)
    ? uniqueStrings(
        input.record.platformSuccessfulGenerationIds.map((value) => String(value || "").trim()),
      )
    : successfulGenerationIds;
  const pendingReservations = Array.isArray(input.record?.pendingReservations)
    ? input.record.pendingReservations
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const reservation = entry as Partial<AssessmentDailyCreditReservation>;
          const id = String(reservation.id || "").trim();
          const reservedAt = String(reservation.reservedAt || "").trim();
          const source = reservation.source === "extra" ? "extra" : "daily";

          if (!id || !reservedAt) {
            return null;
          }

          return {
            id,
            dayKey: input.dayKey,
            reservedAt,
            source,
          } satisfies AssessmentDailyCreditReservation;
        })
        .filter((entry): entry is AssessmentDailyCreditReservation => Boolean(entry))
    : fallback.pendingReservations;

  return {
    id: fallback.id,
    ownerUid: input.ownerUid,
    dayKey: input.dayKey,
    dailyLimit:
      typeof input.record?.dailyLimit === "number" && Number.isFinite(input.record.dailyLimit)
        ? input.record.dailyLimit
        : fallback.dailyLimit,
    successfulGenerationIds,
    platformSuccessfulGenerationIds,
    pendingReservations,
    createdAt: String(input.record?.createdAt || fallback.createdAt),
    updatedAt: String(input.record?.updatedAt || fallback.updatedAt),
  } satisfies AssessmentDailyCreditLedgerDocument;
}

/* Pending reservations exist only to stop realistic double-click or duplicate-request races from
   oversubscribing the same daily quota before the durable success write happens. Keep stale
   reservation pruning here so abandoned requests recover automatically without background jobs. */
export function filterActiveAssessmentDailyCreditReservations(
  reservations: AssessmentDailyCreditReservation[],
  nowMs = Date.now(),
) {
  const cutoff = nowMs - ASSESSMENT_DAILY_RESERVATION_TTL_MS;

  return reservations.filter((reservation) => {
    const reservedAtMs = Date.parse(reservation.reservedAt);
    return Number.isFinite(reservedAtMs) && reservedAtMs >= cutoff;
  });
}

/* Backward-compatible assessment export for older imports. The implementation now lives in the
   shared platform aggregation module so platform-cap math is not hidden in the assessment credit
   engine. Future code should import buildPlatformDailyUsageSummary from platform-usage-aggregation. */
export const buildAssessmentPlatformDailyUsageSummary = buildSharedPlatformDailyUsageSummary;

export function buildAssessmentDailyCreditsSummary(input: {
  role: UserRole;
  dayKey: string;
  usedCount: number;
  resetsAt: string;
  assessmentAccess?: AssessmentCreditAccountAccess;
  dailyDefaultLimit?: number;
  dailyLimit?: number;
  dailyLimitSource?: "default" | "override";
  dailyReservationCount?: number;
  manualCreditsAvailable?: number;
  grantCreditsAvailable?: number;
  extraReservationCount?: number;
  activeGrantCount?: number;
  platformDailyUsage: PlatformDailyUsageSummary;
}) {
  const dailyDefaultLimit =
    normalizeAssessmentDailyLimitOverride(input.dailyDefaultLimit)
    ?? getDefaultDailyAssessmentCreditsLimit();
  const dailyLimit =
    normalizeAssessmentDailyLimitOverride(input.dailyLimit)
    ?? dailyDefaultLimit;
  const dailyReservationCount = Math.max(0, input.dailyReservationCount ?? 0);
  const manualCreditsAvailable = Math.max(0, Math.round(input.manualCreditsAvailable ?? 0));
  const grantCreditsAvailable = Math.max(0, Math.round(input.grantCreditsAvailable ?? 0));
  const extraReservationCount = Math.max(0, input.extraReservationCount ?? 0);
  const activeGrantCount = Math.max(0, input.activeGrantCount ?? 0);
  const extraCreditsAvailable = Math.max(
    manualCreditsAvailable + grantCreditsAvailable - extraReservationCount,
    0,
  );
  const safeUsedCount = Math.max(0, Math.min(input.usedCount, dailyLimit));
  const dailyRemainingCount = Math.max(dailyLimit - safeUsedCount - dailyReservationCount, 0);
  const assessmentAccess = input.assessmentAccess ?? "enabled";
  const totalRemainingCount =
    assessmentAccess === "disabled"
      ? 0
      : dailyRemainingCount + extraCreditsAvailable;

  if (isAssessmentDailyCreditsExempt(input.role)) {
    return {
      applies: false,
      isAdminExempt: true,
      assessmentAccess,
      dayKey: input.dayKey,
      dailyDefaultLimit,
      dailyLimit,
      dailyLimitSource: input.dailyLimitSource ?? "default",
      usedCount: 0,
      dailyRemainingCount: null,
      manualCreditsAvailable,
      grantCreditsAvailable,
      extraCreditsAvailable,
      activeGrantCount,
      totalRemainingCount: null,
      remainingCount: null,
      resetsAt: input.resetsAt,
      platformDailyUsage: input.platformDailyUsage,
    } satisfies AssessmentDailyCreditsSummary;
  }

  return {
    applies: true,
    isAdminExempt: false,
    assessmentAccess,
    dayKey: input.dayKey,
    dailyDefaultLimit,
    dailyLimit,
    dailyLimitSource: input.dailyLimitSource ?? "default",
    usedCount: safeUsedCount,
    dailyRemainingCount,
    manualCreditsAvailable,
    grantCreditsAvailable,
    extraCreditsAvailable,
    activeGrantCount,
    totalRemainingCount,
    remainingCount: totalRemainingCount,
    resetsAt: input.resetsAt,
    platformDailyUsage: input.platformDailyUsage,
  } satisfies AssessmentDailyCreditsSummary;
}

export const buildPlatformDailyUsageSummary = buildSharedPlatformDailyUsageSummary;
