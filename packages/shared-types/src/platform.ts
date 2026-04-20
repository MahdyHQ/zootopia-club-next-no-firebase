import type { UserRole } from "./auth";

/**
 * Platform-level cross-tool type contracts.
 *
 * This module owns types that are genuinely platform-wide or cross-tool in scope.
 * Types specific to a single tool (assessment questions, infographic SVG, etc.)
 * belong in their own domain modules.
 *
 * Domain boundary rules enforced here:
 *   - ToolId       → tool-specific; never use a catch-all / generic value
 *   - ToolAccountingAccount → canonical per-owner shared accounting identity
 *   - ToolAccountingEntry   → shared grants / adjustments / deductions ledger
 *   - ToolUsageEvent → per-user, per-tool event record from tool_usage_events table
 *   - PlatformDailyUsageSummary → the canonical cross-tool platform-wide cap summary
 *
 * The `AssessmentPlatformDailyUsageSummary` name in assessment.ts is a deprecated alias
 * for PlatformDailyUsageSummary. New code should import from here.
 */

/**
 * Known tool identifiers. Keep explicit: never collapse tools into a generic string.
 * Extend this union when a new tool goes live; do not use 'any' or 'unknown' values.
 */
export type ToolId = "assessment" | "infographic";

/**
 * Action kinds within a tool that produce a usage event record.
 *   - 'generation' → a new artifact was produced (consumes quota)
 *   - 'export'     → an existing artifact was re-rendered (may or may not consume quota)
 *   - 'view'       → a result page was accessed (observability / audit, non-billable)
 */
export type ToolUsageEventKind = "generation" | "export" | "view";

/**
 * Quantitative accounting entry kinds shared across tools.
 * Keep value semantics explicit so grants, adjustments, and deductions remain distinguishable.
 */
export type ToolAccountingEntryKind = "grant" | "adjustment" | "deduction";

/**
 * Canonical per-owner accounting identity.
 *
 * This is intentionally broader than any one tool's quota tables. It exists so shared
 * platform/accounting services can resolve owner email/role without reaching back into
 * assessment-specific or legacy compatibility stores.
 */
export interface ToolAccountingAccount {
  ownerUid: string;
  ownerEmail: string | null;
  ownerRole: UserRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * A single row from the tool_usage_events Postgres table.
 * Represents one concrete action taken by a user with a specific tool.
 */
export interface ToolUsageEvent {
  id: string;
  ownerUid: string;
  /** Which tool produced this event. Never generic. */
  toolId: ToolId;
  /** What kind of action was performed. */
  eventKind: ToolUsageEventKind;
  /** UTC credit-accounting window key aligned with assessment_daily_credits.day_key. */
  dayKey: string;
  /** Back-reference to the tool-specific generation record (nullable). */
  generationId: string | null;
  /** Optional structured metadata for observability. */
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Canonical cross-tool accounting ledger entry.
 *
 * One row represents a single accounting mutation for one owner and one tool. Tool usage
 * remains distinguishable through toolId + eventKind, while value movement remains explicit
 * through entryKind + amount.
 */
export interface ToolAccountingEntry {
  id: string;
  ownerUid: string;
  toolId: ToolId;
  entryKind: ToolAccountingEntryKind;
  amount: number;
  eventKind: ToolUsageEventKind | null;
  usageEventId: string | null;
  generationId: string | null;
  dayKey: string | null;
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  correlationId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Platform-wide daily usage summary.
 *
 * This is the canonical cross-tool name for what was previously called
 * AssessmentPlatformDailyUsageSummary in assessment.ts. Both types have identical
 * shapes; the platform type is authoritative for new code.
 *
 * `applies`  → false when the viewer is exempt (admin or configured email);
 *              non-exempt users always have applies === true.
 * `locked`   → applies && reached; the decisive server-side gate condition.
 *              Server code must block actions when locked === true.
 */
export interface PlatformDailyUsageSummary {
  /** Whether the platform cap applies to this user identity. */
  applies: boolean;
  /** True when the user's role is admin (admin cap is not enforced). */
  isAdminExempt: boolean;
  /** True when the user's email is in the configured exempt list. */
  isEmailExempt: boolean;
  /** UTC credit-accounting window key. */
  dayKey: string;
  /** Platform-wide daily cap (from ZOOTOPIA_PLATFORM_GLOBAL_DAILY_CREDIT_LIMIT env). */
  limit: number;
  /** Total successful platform-wide generations consumed today. */
  usedCount: number;
  /** Remaining platform capacity: max(limit - usedCount, 0). */
  remainingCount: number;
  /** True when usedCount >= limit. */
  reached: boolean;
  /**
   * True when the platform is both applicable AND exhausted.
   * This is the decisive gate: server code must block tool execution when locked === true.
   */
  locked: boolean;
  /** ISO timestamp when the platform window resets. */
  resetsAt: string;
}
