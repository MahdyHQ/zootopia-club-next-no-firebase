import "server-only";

import type { PlatformDailyUsageSummary, ToolId, UserRole } from "@zootopia/shared-types";

import { isActiveNormalUserExemptEmail } from "@/lib/server/active-normal-user-session-governance";
import {
  getZootopiaDatabase,
} from "@/lib/server/zootopia-postgres-adapter";
import { hasZootopiaPostgresPersistence } from "@/lib/server/zootopia-entity-store";
import { readToolAccountingMemoryAggregationSnapshot } from "@/lib/server/tool-accounting";

export const PLATFORM_GLOBAL_DAILY_USAGE_LIMIT_ENV_KEY =
  "ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT";

const PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_FALLBACK = 33;
const PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MIN = 1;
const PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MAX = 10_000;

function parsePositiveInteger(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parsePositiveIntegerEnv(input: {
  raw: string | undefined;
  fallback: number;
  min: number;
  max: number;
  envKey: string;
  logPrefix: string;
}) {
  const value = String(input.raw ?? "").trim();
  if (!value) {
    return input.fallback;
  }

  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    console.warn(
      `[${input.logPrefix}] Invalid ${input.envKey} value "${value}", using ${input.fallback}.`,
    );
    return input.fallback;
  }

  if (parsed < input.min || parsed > input.max) {
    console.warn(
      `[${input.logPrefix}] ${input.envKey}=${parsed} is outside ${input.min}-${input.max}, clamping.`,
    );
  }

  return Math.min(input.max, Math.max(input.min, parsed));
}

function normalizePlatformOwnerRole(role: UserRole | string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "user";
}

function isPlatformDailyUsageExemptIdentity(input: {
  role: UserRole | string | null | undefined;
  email: string | null;
}) {
  const role = normalizePlatformOwnerRole(input.role);
  if (role === "admin") {
    return true;
  }

  return isActiveNormalUserExemptEmail(input.email);
}

export function getPlatformGlobalDailyCreditLimit() {
  return parsePositiveIntegerEnv({
    raw: process.env[PLATFORM_GLOBAL_DAILY_USAGE_LIMIT_ENV_KEY],
    fallback: PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_FALLBACK,
    min: PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MIN,
    max: PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MAX,
    envKey: PLATFORM_GLOBAL_DAILY_USAGE_LIMIT_ENV_KEY,
    logPrefix: "platform-usage-aggregation",
  });
}

export function buildPlatformDailyUsageSummary(input: {
  dayKey: string;
  usedCount: number;
  resetsAt: string;
  limit?: number;
  isAdminExempt?: boolean;
  isEmailExempt?: boolean;
}) {
  const limit = Math.min(
    PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MAX,
    Math.max(
      PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT_MIN,
      Math.round(input.limit ?? getPlatformGlobalDailyCreditLimit()),
    ),
  );
  const usedCount = Math.max(0, Math.round(input.usedCount));
  const isAdminExempt = input.isAdminExempt === true;
  const isEmailExempt = !isAdminExempt && input.isEmailExempt === true;
  const applies = !isAdminExempt && !isEmailExempt;
  const remainingCount = Math.max(limit - usedCount, 0);
  const reached = usedCount >= limit;

  return {
    applies,
    isAdminExempt,
    isEmailExempt,
    dayKey: input.dayKey,
    limit,
    usedCount,
    remainingCount,
    reached,
    locked: applies && reached,
    resetsAt: input.resetsAt,
  } satisfies PlatformDailyUsageSummary;
}

function countMemoryPlatformGenerationUsageForDay(input: {
  dayKey: string;
  toolId?: ToolId;
}) {
  const snapshot = readToolAccountingMemoryAggregationSnapshot();
  const usageByOwner = new Map<string, Set<string>>();

  const addUsage = (entry: {
    ownerUid: string;
    toolId: ToolId;
    id: string;
    generationId: string | null;
  }) => {
    if (input.toolId && entry.toolId !== input.toolId) {
      return;
    }

    const account = snapshot.accounts.get(entry.ownerUid);
    if (
      isPlatformDailyUsageExemptIdentity({
        role: account?.ownerRole ?? "user",
        email: account?.ownerEmail ?? null,
      })
    ) {
      return;
    }

    const usageKey = `${entry.toolId}:${entry.generationId ?? entry.id}`;
    const ownerUsage = usageByOwner.get(entry.ownerUid) ?? new Set<string>();
    ownerUsage.add(usageKey);
    usageByOwner.set(entry.ownerUid, ownerUsage);
  };

  for (const entry of snapshot.entries) {
    if (
      entry.dayKey === input.dayKey
      && entry.entryKind === "deduction"
      && entry.eventKind === "generation"
    ) {
      addUsage(entry);
    }
  }

  for (const event of snapshot.usageEvents) {
    if (event.dayKey === input.dayKey && event.eventKind === "generation") {
      addUsage(event);
    }
  }

  return [...usageByOwner.values()].reduce((total, ownerUsage) => total + ownerUsage.size, 0);
}

export async function countPlatformGenerationUsageForDay(input: {
  dayKey: string;
  toolId?: ToolId;
}) {
  if (!hasZootopiaPostgresPersistence()) {
    return countMemoryPlatformGenerationUsageForDay(input);
  }

  type PlatformGenerationUsageAggregationRow = {
    owner_uid: string;
    owner_email: string | null;
    owner_role: UserRole | null;
    used_count: string;
  };

  const toolFilter = input.toolId ? input.toolId : null;
  const rows =
    await getZootopiaDatabase().sql<PlatformGenerationUsageAggregationRow[]>`
      WITH generation_usage AS (
        SELECT
          owner_uid,
          tool_id,
          COALESCE(NULLIF(trim(generation_id), ''), id) AS usage_key
        FROM public.tool_accounting_entries
        WHERE day_key = ${input.dayKey}
          AND entry_kind = 'deduction'
          AND event_kind = 'generation'
          AND (${toolFilter}::text IS NULL OR tool_id = ${toolFilter})

        UNION

        SELECT
          owner_uid,
          tool_id,
          COALESCE(NULLIF(trim(generation_id), ''), id) AS usage_key
        FROM public.tool_usage_events
        WHERE day_key = ${input.dayKey}
          AND event_kind = 'generation'
          AND (${toolFilter}::text IS NULL OR tool_id = ${toolFilter})
      )
      SELECT
        gu.owner_uid,
        taa.owner_email,
        taa.owner_role,
        COUNT(DISTINCT gu.tool_id || ':' || gu.usage_key) AS used_count
      FROM generation_usage AS gu
      LEFT JOIN public.tool_accounting_accounts AS taa
        ON taa.owner_uid = gu.owner_uid
      GROUP BY gu.owner_uid, taa.owner_email, taa.owner_role
    `;

  let usedCount = 0;
  for (const row of rows) {
    const ownerUsedCount = Number(row.used_count ?? 0);
    if (ownerUsedCount <= 0) {
      continue;
    }

    if (
      isPlatformDailyUsageExemptIdentity({
        role: row.owner_role ?? "user",
        email: row.owner_email,
      })
    ) {
      continue;
    }

    /* Missing structured account rows are counted conservatively as normal users. Tool-specific
       writers sync accounts before writing events/entries, but the global cap must fail safe if
       older rows predate that identity sync. */
    usedCount += ownerUsedCount;
  }

  return usedCount;
}

export async function buildPlatformDailyUsageForUser(input: {
  user: {
    uid: string;
    role: UserRole;
    email?: string | null;
  };
  dayKey: string;
  resetsAt: string;
}) {
  const resolvedEmail = input.user.email ?? null;
  const isAdminExempt = input.user.role === "admin";
  const usedCount = await countPlatformGenerationUsageForDay({
    dayKey: input.dayKey,
  });

  return buildPlatformDailyUsageSummary({
    dayKey: input.dayKey,
    usedCount,
    resetsAt: input.resetsAt,
    limit: getPlatformGlobalDailyCreditLimit(),
    isAdminExempt,
    isEmailExempt: !isAdminExempt && isActiveNormalUserExemptEmail(resolvedEmail),
  });
}
