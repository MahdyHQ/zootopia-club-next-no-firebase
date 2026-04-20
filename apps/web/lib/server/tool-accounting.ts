/**
 * tool-accounting.ts
 *
 * Central cross-tool usage-accounting foundation.
 *
 * Purpose:
 *   Provides the server-side abstraction for:
 *   - syncing canonical per-owner accounting identities
 *   - recording shared accounting entries (grants / adjustments / deductions)
 *   - recording per-user, per-tool usage events
 *
 * Scope / domain boundaries:
 *   - This module is tool-agnostic; it does not import assessment or infographic
 *     domain logic. It owns the cross-tool contract.
 *   - Assessment-specific quota (daily limit, grants, reservations) stays in
 *     assessment-daily-credits.ts and repository.ts. This module is the extensibility
 *     point that future tools plug into.
 *   - Never flatten tool boundaries: tool_id must always identify which tool produced
 *     the event so per-tool usage remains distinguishable.
 *
 * Future agents: keep this module thin. It owns shared accounting identity + ledger/event
 * writes, but it must not duplicate assessment credit logic or become a second quota engine.
 */

import "server-only";

import { randomUUID } from "crypto";

import type {
  ToolAccountingAccount,
  ToolAccountingEntry,
  ToolAccountingEntryKind,
  ToolId,
  ToolUsageEvent,
  ToolUsageEventKind,
  UserRole,
} from "@zootopia/shared-types";

import { getZootopiaDatabase } from "@/lib/server/zootopia-postgres-adapter";
import { hasZootopiaPostgresPersistence } from "@/lib/server/zootopia-entity-store";

type ToolAccountingSqlExecutor = ReturnType<typeof getZootopiaDatabase>["sql"];

// ---------------------------------------------------------------------------
// In-memory fallback (non-production / dev without DB)
// ---------------------------------------------------------------------------

const memoryToolAccountingAccounts = new Map<string, ToolAccountingAccount>();
const memoryToolAccountingEntries = new Map<string, ToolAccountingEntry>();
const memoryToolUsageEvents = new Map<string, ToolUsageEvent>();

function normalizeToolAccountingRole(role: UserRole | null | undefined): UserRole {
  return role === "admin" ? "admin" : "user";
}

function normalizeToolAccountingEmail(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function syncToolAccountingAccount(input: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole?: UserRole | null;
  nowIso?: string;
  sql?: ToolAccountingSqlExecutor;
}): Promise<ToolAccountingAccount> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const ownerEmail = normalizeToolAccountingEmail(input.ownerEmail);
  const ownerRole = input.ownerRole ? normalizeToolAccountingRole(input.ownerRole) : null;

  if (!hasZootopiaPostgresPersistence()) {
    const existing = memoryToolAccountingAccounts.get(input.ownerUid);
    const account: ToolAccountingAccount = {
      ownerUid: input.ownerUid,
      ownerEmail: ownerEmail ?? existing?.ownerEmail ?? null,
      ownerRole: ownerRole ?? existing?.ownerRole ?? "user",
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    memoryToolAccountingAccounts.set(input.ownerUid, account);
    return account;
  }

  const sql = input.sql ?? getZootopiaDatabase().sql;
  if (ownerRole) {
    await sql`
      INSERT INTO public.tool_accounting_accounts (
        owner_uid,
        owner_email,
        owner_role,
        created_at,
        updated_at
      )
      VALUES (
        ${input.ownerUid},
        ${ownerEmail},
        ${ownerRole},
        ${nowIso},
        ${nowIso}
      )
      ON CONFLICT (owner_uid)
      DO UPDATE SET
        owner_email = COALESCE(EXCLUDED.owner_email, public.tool_accounting_accounts.owner_email),
        owner_role = EXCLUDED.owner_role,
        updated_at = EXCLUDED.updated_at
    `;
  } else {
    await sql`
      INSERT INTO public.tool_accounting_accounts (
        owner_uid,
        owner_email,
        owner_role,
        created_at,
        updated_at
      )
      VALUES (
        ${input.ownerUid},
        ${ownerEmail},
        ${"user"},
        ${nowIso},
        ${nowIso}
      )
      ON CONFLICT (owner_uid)
      DO UPDATE SET
        owner_email = COALESCE(EXCLUDED.owner_email, public.tool_accounting_accounts.owner_email),
        updated_at = EXCLUDED.updated_at
    `;
  }

  return {
    ownerUid: input.ownerUid,
    ownerEmail,
    ownerRole: ownerRole ?? "user",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function recordToolAccountingEntry(input: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole?: UserRole | null;
  toolId: ToolId;
  entryKind: ToolAccountingEntryKind;
  amount: number;
  eventKind?: ToolUsageEventKind | null;
  usageEventId?: string | null;
  generationId?: string | null;
  dayKey?: string | null;
  actorUid?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
  sql?: ToolAccountingSqlExecutor;
}): Promise<ToolAccountingEntry> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await syncToolAccountingAccount({
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    ownerRole: input.ownerRole,
    nowIso: createdAt,
    sql: input.sql,
  });

  const entry: ToolAccountingEntry = {
    id,
    ownerUid: input.ownerUid,
    toolId: input.toolId,
    entryKind: input.entryKind,
    amount: Math.trunc(input.amount),
    eventKind: input.eventKind ?? null,
    usageEventId: input.usageEventId ?? null,
    generationId: input.generationId ?? null,
    dayKey: input.dayKey ?? null,
    actorUid: input.actorUid ?? null,
    actorEmail: normalizeToolAccountingEmail(input.actorEmail),
    actorRole: input.actorRole ? normalizeToolAccountingRole(input.actorRole) : null,
    correlationId: input.correlationId ?? null,
    metadata: input.metadata ?? null,
    createdAt,
  };

  if (!hasZootopiaPostgresPersistence()) {
    memoryToolAccountingEntries.set(id, entry);
    return entry;
  }

  const sql = input.sql ?? getZootopiaDatabase().sql;
  await sql`
    INSERT INTO public.tool_accounting_entries (
      id,
      owner_uid,
      tool_id,
      entry_kind,
      amount,
      event_kind,
      usage_event_id,
      generation_id,
      day_key,
      actor_uid,
      actor_email,
      actor_role,
      correlation_id,
      metadata,
      created_at
    )
    VALUES (
      ${entry.id},
      ${entry.ownerUid},
      ${entry.toolId},
      ${entry.entryKind},
      ${entry.amount},
      ${entry.eventKind},
      ${entry.usageEventId},
      ${entry.generationId},
      ${entry.dayKey},
      ${entry.actorUid},
      ${entry.actorEmail},
      ${entry.actorRole},
      ${entry.correlationId},
      ${entry.metadata ? sql.json(entry.metadata as never) : null},
      ${entry.createdAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  return entry;
}

// ---------------------------------------------------------------------------
// Write: record a tool usage event
// ---------------------------------------------------------------------------

export async function recordToolUsageEvent(input: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole?: UserRole | null;
  toolId: ToolId;
  eventKind: ToolUsageEventKind;
  dayKey: string;
  generationId?: string | null;
  metadata?: Record<string, unknown> | null;
  sql?: ToolAccountingSqlExecutor;
}): Promise<ToolUsageEvent> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await syncToolAccountingAccount({
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail,
    ownerRole: input.ownerRole,
    nowIso: createdAt,
    sql: input.sql,
  });

  const event: ToolUsageEvent = {
    id,
    ownerUid: input.ownerUid,
    toolId: input.toolId,
    eventKind: input.eventKind,
    dayKey: input.dayKey,
    generationId: input.generationId ?? null,
    metadata: input.metadata ?? null,
    createdAt,
  };

  if (!hasZootopiaPostgresPersistence()) {
    memoryToolUsageEvents.set(id, event);
    return event;
  }

  const sql = input.sql ?? getZootopiaDatabase().sql;
  await sql`
    INSERT INTO public.tool_usage_events (
      id, owner_uid, tool_id, event_kind, day_key, generation_id, metadata, created_at
    )
    VALUES (
      ${id},
      ${input.ownerUid},
      ${input.toolId},
      ${input.eventKind},
      ${input.dayKey},
      ${input.generationId ?? null},
      ${input.metadata ? JSON.stringify(input.metadata) : null},
      ${createdAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  return event;
}

// ---------------------------------------------------------------------------
// Read: per-owner, per-tool event count for a day window
// ---------------------------------------------------------------------------

export async function countOwnerToolUsageForDay(input: {
  ownerUid: string;
  toolId: ToolId;
  eventKind?: ToolUsageEventKind;
  dayKey: string;
}): Promise<number> {
  if (!hasZootopiaPostgresPersistence()) {
    return [...memoryToolUsageEvents.values()].filter(
      (e) =>
        e.ownerUid === input.ownerUid
        && e.toolId === input.toolId
        && e.dayKey === input.dayKey
        && (!input.eventKind || e.eventKind === input.eventKind),
    ).length;
  }

  const sql = getZootopiaDatabase().sql;

  if (input.eventKind) {
    type Row = { count: string };
    const rows = await sql<Row[]>`
      SELECT COUNT(*) AS count
      FROM public.tool_usage_events
      WHERE owner_uid = ${input.ownerUid}
        AND tool_id   = ${input.toolId}
        AND event_kind = ${input.eventKind}
        AND day_key   = ${input.dayKey}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  type Row = { count: string };
  const rows = await sql<Row[]>`
    SELECT COUNT(*) AS count
    FROM public.tool_usage_events
    WHERE owner_uid = ${input.ownerUid}
      AND tool_id   = ${input.toolId}
      AND day_key   = ${input.dayKey}
  `;
  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Read: platform-wide tool usage totals for a day (admin/aggregation use only)
// ---------------------------------------------------------------------------

export async function countPlatformToolUsageForDay(input: {
  toolId: ToolId;
  eventKind?: ToolUsageEventKind;
  dayKey: string;
}): Promise<number> {
  if (!hasZootopiaPostgresPersistence()) {
    return [...memoryToolUsageEvents.values()].filter(
      (e) =>
        e.toolId === input.toolId
        && e.dayKey === input.dayKey
        && (!input.eventKind || e.eventKind === input.eventKind),
    ).length;
  }

  const sql = getZootopiaDatabase().sql;

  if (input.eventKind) {
    type Row = { count: string };
    const rows = await sql<Row[]>`
      SELECT COUNT(*) AS count
      FROM public.tool_usage_events
      WHERE tool_id    = ${input.toolId}
        AND event_kind = ${input.eventKind}
        AND day_key    = ${input.dayKey}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  type Row = { count: string };
  const rows = await sql<Row[]>`
    SELECT COUNT(*) AS count
    FROM public.tool_usage_events
    WHERE tool_id  = ${input.toolId}
      AND day_key  = ${input.dayKey}
  `;
  return Number(rows[0]?.count ?? 0);
}
