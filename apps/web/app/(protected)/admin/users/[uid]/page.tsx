import "server-only";

import type {
  AdminAssessmentCreditMutationInput,
  AssessmentPromptEntitlement,
} from "@zootopia/shared-types";
import {
  Activity,
  AlertCircle,
  Clock3,
  Database,
  FileText,
  Gauge,
  HardDrive,
  History,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  User,
  UserCheck,
  UserX,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { AdminCreditManagementWorkspace } from "@/components/admin/admin-credit-management-workspace";
import { Button } from "@/components/ui/button";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import {
  mapAdminAssessmentCreditMutationErrorToQueryCode as mapAdminCreditMutationErrorToQueryCode,
  readPlatformErrorCode,
} from "@/lib/server/assessment-platform-errors";
import {
  getAdminAssessmentCreditStateForUser,
  getUserByUid,
  listAdminActivityLogs,
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { getServerRuntimeBaseUrl } from "@/lib/server/runtime-base-url";
import { getAllRetentionPolicySummaries } from "@/lib/server/storage-retention-config";
import { requireAdminUser } from "@/lib/server/session";
import {
  hasRemoteBlobStorage,
  listZootopiaPrivateObjectDescriptorsByPrefix,
} from "@/lib/server/supabase-blob-storage";
import {
  OWNER_STORAGE_NAMESPACES,
  listOwnerScopedStoragePrefixes,
} from "@/lib/server/owner-scope";

export const runtime = "nodejs";

const USER_STORAGE_NAMESPACES = [...OWNER_STORAGE_NAMESPACES] as const;
const DELETE_USER_CONFIRMATION_PHRASE = "DELETE USER";
/* Admin user-management is a high-signal operational surface.
   These classes intentionally strengthen light-mode contrast and remove lift-style motion on
   buttons/cards here only, so credit mutations stay easy to read without altering dark mode. */
const ADMIN_USER_DETAIL_DISABLED_BUTTON_CLASS =
  "disabled:pointer-events-none disabled:opacity-100 disabled:cursor-not-allowed disabled:shadow-none disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-900/60 dark:disabled:text-zinc-500";
const ADMIN_USER_DETAIL_FIELD_CONTROL_CLASS =
  "field-control border-zinc-300/90 bg-white text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-400 focus:bg-white disabled:pointer-events-none disabled:opacity-100 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400 dark:focus:bg-zinc-900 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-900/60 dark:disabled:text-zinc-500 dark:disabled:placeholder:text-zinc-600";
const ADMIN_USER_DETAIL_PANEL_CLASS =
  "rounded-[2rem] border border-zinc-200/80 bg-white/82 backdrop-blur-2xl p-6 shadow-[0_16px_38px_rgba(148,163,184,0.14)] dark:border-white/5 dark:bg-zinc-950/40 dark:shadow-sm";
const ADMIN_USER_DETAIL_SUBSECTION_CLASS =
  "rounded-2xl border border-zinc-200/80 bg-white/84 p-4 shadow-[0_12px_28px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/40 dark:shadow-none";
const ADMIN_USER_DETAIL_CARD_CLASS =
  "rounded-xl border border-zinc-200/80 bg-white/90 px-4 py-3 shadow-[0_8px_22px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none";
const ADMIN_USER_DETAIL_MUTATION_CARD_CLASS =
  "rounded-xl border border-zinc-200/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none";
const ADMIN_USER_DETAIL_PRIMARY_BUTTON_CLASS =
  `hover:translate-y-0 border border-emerald-500/70 bg-emerald-600 text-white shadow-[0_10px_24px_rgba(16,185,129,0.20)] transition-colors hover:border-emerald-700 hover:bg-emerald-700 dark:border-accent/40 dark:bg-accent dark:text-white dark:shadow-sm dark:hover:bg-accent/90 ${ADMIN_USER_DETAIL_DISABLED_BUTTON_CLASS}`;
const ADMIN_USER_DETAIL_OUTLINE_BUTTON_CLASS =
  `border-zinc-400 bg-white text-zinc-900 shadow-sm shadow-zinc-200/70 transition-colors hover:translate-y-0 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-900 dark:border-border-strong dark:bg-transparent dark:text-foreground dark:shadow-none dark:hover:bg-accent/5 dark:hover:text-accent ${ADMIN_USER_DETAIL_DISABLED_BUTTON_CLASS}`;
const ADMIN_USER_DETAIL_DANGER_BUTTON_CLASS =
  `hover:translate-y-0 border border-red-500/80 bg-red-600 text-white shadow-[0_10px_22px_rgba(239,68,68,0.18)] transition-colors hover:border-red-700 hover:bg-red-700 dark:border-red-500/40 dark:bg-danger dark:text-white dark:shadow-sm dark:hover:bg-danger/90 ${ADMIN_USER_DETAIL_DISABLED_BUTTON_CLASS}`;
const ADMIN_USER_DETAIL_DANGER_OUTLINE_BUTTON_CLASS =
  `border-red-400 bg-red-50 text-red-800 shadow-sm shadow-red-100/70 transition-colors hover:translate-y-0 hover:border-red-500 hover:bg-red-100 hover:text-red-900 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:shadow-none dark:hover:bg-red-950/30 ${ADMIN_USER_DETAIL_DISABLED_BUTTON_CLASS}`;

type SearchParamValue = string | string[] | undefined;

function getFirstSearchParamValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function toEpochMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(dateFormatter: Intl.DateTimeFormat, value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  return dateFormatter.format(new Date(timestamp));
}

function formatBytes(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = sizeBytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDeviceLabelConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  const normalized = Math.min(1, Math.max(0, value));
  return `${Math.round(normalized * 100)}%`;
}

function formatMetadataValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "Unavailable";
}

function formatMetadataStringArray(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return "Unavailable";
  }

  return values.join(" | ");
}

function formatStoredGender(value: string | null | undefined) {
  if (value === "male") {
    return "Male";
  }

  if (value === "female") {
    return "Female";
  }

  if (value === "prefer_not_to_say") {
    return "Prefer not to say";
  }

  return "Not set";
}

function formatServerObservedGeo(value: {
  source: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
} | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const parts = [
    value.source ? `source=${value.source}` : null,
    value.countryCode ? `country=${value.countryCode}` : null,
    value.region ? `region=${value.region}` : null,
    value.city ? `city=${value.city}` : null,
    typeof value.latitude === "number" ? `lat=${value.latitude}` : null,
    typeof value.longitude === "number" ? `lon=${value.longitude}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : "Unavailable";
}

function formatClientUserAgentDataHints(value: {
  brands: string[] | null;
  mobile: boolean | null;
  platform: string | null;
  architecture: string | null;
  bitness: string | null;
  model: string | null;
  platformVersion: string | null;
  uaFullVersion: string | null;
  wow64: boolean | null;
  fullVersionList: string[] | null;
} | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const parts = [
    value.platform ? `platform=${value.platform}` : null,
    typeof value.mobile === "boolean" ? `mobile=${value.mobile ? "yes" : "no"}` : null,
    value.brands ? `brands=${value.brands.join(", ")}` : null,
    value.architecture ? `arch=${value.architecture}` : null,
    value.bitness ? `bitness=${value.bitness}` : null,
    value.model ? `model=${value.model}` : null,
    value.platformVersion ? `platformVersion=${value.platformVersion}` : null,
    value.uaFullVersion ? `uaFullVersion=${value.uaFullVersion}` : null,
    typeof value.wow64 === "boolean" ? `wow64=${value.wow64 ? "yes" : "no"}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : "Unavailable";
}

function formatClientScreenViewport(value: {
  screen: {
    width: number | null;
    height: number | null;
    pixelRatio: number | null;
    colorDepth: number | null;
  } | null;
  viewport: {
    width: number | null;
    height: number | null;
  } | null;
} | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const screenPart = value.screen
    ? `screen=${typeof value.screen.width === "number" ? value.screen.width : "?"}x${typeof value.screen.height === "number" ? value.screen.height : "?"}`
    : null;
  const viewportPart = value.viewport
    ? `viewport=${typeof value.viewport.width === "number" ? value.viewport.width : "?"}x${typeof value.viewport.height === "number" ? value.viewport.height : "?"}`
    : null;
  const pixelRatioPart = value.screen && typeof value.screen.pixelRatio === "number"
    ? `pixelRatio=${value.screen.pixelRatio}`
    : null;
  const colorDepthPart = value.screen && typeof value.screen.colorDepth === "number"
    ? `colorDepth=${value.screen.colorDepth}`
    : null;

  const parts = [screenPart, viewportPart, pixelRatioPart, colorDepthPart]
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : "Unavailable";
}

function formatClientTouchHardware(value: {
  maxTouchPoints: number | null;
  touchCapable: boolean | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
} | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const parts = [
    typeof value.maxTouchPoints === "number" ? `maxTouchPoints=${value.maxTouchPoints}` : null,
    typeof value.touchCapable === "boolean" ? `touchCapable=${value.touchCapable ? "yes" : "no"}` : null,
    typeof value.deviceMemoryGb === "number" ? `deviceMemoryGb=${value.deviceMemoryGb}` : null,
    typeof value.hardwareConcurrency === "number" ? `hardwareConcurrency=${value.hardwareConcurrency}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : "Unavailable";
}

function formatClientNetworkHints(value: {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
} | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const parts = [
    value.effectiveType ? `effectiveType=${value.effectiveType}` : null,
    typeof value.downlinkMbps === "number" ? `downlinkMbps=${value.downlinkMbps}` : null,
    typeof value.rttMs === "number" ? `rttMs=${value.rttMs}` : null,
    typeof value.saveData === "boolean" ? `saveData=${value.saveData ? "yes" : "no"}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : "Unavailable";
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.name || "Error";
  }

  return "UNKNOWN";
}

function buildAdminUserDetailPath(
  targetUid: string,
  params: Record<string, string | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const normalized = value?.trim();
    if (normalized) {
      searchParams.set(key, normalized);
    }
  }

  const encodedUid = encodeURIComponent(targetUid);
  return searchParams.size > 0
    ? `/admin/users/${encodedUid}?${searchParams.toString()}`
    : `/admin/users/${encodedUid}`;
}

function mapCreditMutationErrorToQueryCode(error: unknown) {
  return mapAdminCreditMutationErrorToQueryCode(error);
}

function mapPromptEntitlementMutationErrorToQueryCode(error: unknown) {
  const code = error instanceof Error
    ? error.message
    : "ASSESSMENT_PROMPT_ENTITLEMENT_UPDATE_FAILED";

  switch (code) {
    case "USER_NOT_FOUND":
      return "prompt_user_not_found";
    case "ASSESSMENT_PROMPT_ENTITLEMENT_SELF_MUTATION_FORBIDDEN":
      return "prompt_self_mutation_forbidden";
    case "ASSESSMENT_PROMPT_ENTITLEMENT_INVALID":
      return "prompt_invalid_request";
    default:
      return "prompt_update_failed";
  }
}

function parsePositiveIntegerFromForm(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function parseNonNegativeIntegerFromForm(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
}

function parseOptionalMutationText(value: FormDataEntryValue | null, maxLength = 320) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function parseOptionalMutationExpiry(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    return "INVALID";
  }

  return new Date(parsedMs).toISOString();
}

function formatAdminCreditMutationAction(action: AdminAssessmentCreditMutationInput["action"]) {
  switch (action) {
    case "set_access":
      return "Access updated";
    case "set_daily_override":
      return "Daily override set";
    case "clear_daily_override":
      return "Daily override cleared";
    case "add_manual_credits":
      return "Manual credits added";
    case "subtract_manual_credits":
      return "Manual credits removed";
    case "set_manual_credits":
      return "Manual credits set";
    case "grant_credits":
      return "Credit grant created";
    case "revoke_grant":
      return "Credit grant revoked";
    default:
      return "Credit mutation";
  }
}

async function runAdminCreditMutationFromDetailPage(input: {
  targetUid: string;
  mutation: AdminAssessmentCreditMutationInput;
}) {
  const { appendAdminLog, applyAdminAssessmentCreditMutation, getUserByUid } = await import(
    "@/lib/server/repository"
  );
  const { publishAssessmentCreditLiveUpdate } = await import(
    "@/lib/server/assessment-credit-live-updates"
  );
  const { requireAdminUser } = await import("@/lib/server/session");

  const admin = await requireAdminUser();
  const creditTraceId = createAssessmentCreditTraceId();
  let targetUser: Awaited<ReturnType<typeof getUserByUid>> = null;

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_detail_requested",
    traceId: creditTraceId,
    details: {
      route: "/admin/users/[uid]",
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: input.targetUid,
      action: input.mutation.action,
    },
  });

  /* Credit mutations must never crash the admin route on transient lookup failures.
     Keep this pre-mutation owner read fail-closed and redirect-based so operators get
     an explicit error state instead of the global application error boundary. */
  try {
    targetUser = await getUserByUid(input.targetUid);
  } catch {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: "credits_update_failed",
      }),
    );
  }

  if (!targetUser) {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: "credits_user_not_found",
      }),
    );
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_detail_target_resolved",
    traceId: creditTraceId,
    details: {
      route: "/admin/users/[uid]",
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: input.targetUid,
      targetRole: targetUser.role,
    },
  });

  let state: Awaited<ReturnType<typeof applyAdminAssessmentCreditMutation>>;
  try {
    state = await applyAdminAssessmentCreditMutation({
      ownerUid: input.targetUid,
      admin: {
        uid: admin.uid,
        role: admin.role,
      },
      mutation: input.mutation,
      diagnostics: {
        traceId: creditTraceId,
        source: "admin-user-detail",
      },
    });
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_detail_failed",
      level: "error",
      traceId: creditTraceId,
      details: {
        route: "/admin/users/[uid]",
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: input.targetUid,
        action: input.mutation.action,
      },
      error,
    });
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: mapCreditMutationErrorToQueryCode(error),
      }),
    );
  }

  let adminLogStatus = "succeeded";
  let adminLogErrorCode: string | null = null;

  /* The admin detail page is a server-action shell over the same repository mutation lane as
     the API route. Keep appendAdminLog best-effort here so a committed balance change never
     redirects back as a false failure just because audit logging degraded afterwards. */
  try {
    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      targetUid: input.targetUid,
      ownerUid: input.targetUid,
      ownerRole: targetUser.role,
      action: `assessment-credits:${input.mutation.action}`,
      resourceType: "assessment-credits",
      resourceId: input.targetUid,
      route: "/admin/users/[uid]",
      metadata: {
        action: input.mutation.action,
        amount: typeof input.mutation.amount === "number" ? input.mutation.amount : null,
        access: input.mutation.access ?? null,
        dailyLimitOverride:
          typeof input.mutation.dailyLimitOverride === "number"
            ? input.mutation.dailyLimitOverride
            : null,
        grantId: input.mutation.grantId ?? null,
        expiresAt: input.mutation.expiresAt ?? null,
        reason: input.mutation.reason ?? null,
        remainingCount:
          typeof state.credits.remainingCount === "number"
            ? state.credits.remainingCount
            : null,
      },
    });
  } catch (error) {
    adminLogStatus = "failed";
    adminLogErrorCode = readPlatformErrorCode(error);
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_detail_admin_log_failed",
      level: "warn",
      traceId: creditTraceId,
      details: {
        route: "/admin/users/[uid]",
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: input.targetUid,
        action: input.mutation.action,
        adminLogErrorCode,
      },
      error,
    });
    console.warn("[admin-user-detail] admin audit log failed after committed mutation", {
      targetUid: input.targetUid,
      actingAdminUid: admin.uid,
      action: input.mutation.action,
      adminLogErrorCode,
    });
  }

  let broadcastStatus: string | null = null;
  let broadcastErrorCode: string | null = null;

  /* Live credit delivery must publish the repository-returned post-commit summary for this
     exact owner UID. Keep the detail page on the same server truth object so header/studio
     listeners never receive guessed balances or cross-user payloads. */
  try {
    const liveUpdate = await publishAssessmentCreditLiveUpdate({
      ownerUid: input.targetUid,
      credits: state.credits,
      reason: `admin-user-detail:${input.mutation.action}`,
      traceId: creditTraceId,
    });
    broadcastStatus = liveUpdate.broadcast.status;
    broadcastErrorCode = liveUpdate.broadcast.errorCode;

    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_detail_publish_result",
      traceId: creditTraceId,
      details: {
        route: "/admin/users/[uid]",
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: input.targetUid,
        action: input.mutation.action,
        broadcastStatus,
        broadcastErrorCode,
        eventId: liveUpdate.eventId,
      },
    });

    console.info("[admin-user-detail] published assessment credit live update", {
      targetUid: input.targetUid,
      actingAdminUid: admin.uid,
      action: input.mutation.action,
      broadcastStatus,
      broadcastErrorCode,
      remainingCount: state.credits.remainingCount,
    });
  } catch (error) {
    broadcastStatus = "error";
    broadcastErrorCode = readPlatformErrorCode(error);
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_detail_publish_failed",
      level: "warn",
      traceId: creditTraceId,
      details: {
        route: "/admin/users/[uid]",
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: input.targetUid,
        action: input.mutation.action,
        broadcastErrorCode,
      },
      error,
    });
    console.warn("[admin-user-detail] failed to publish assessment credit live update", {
      targetUid: input.targetUid,
      actingAdminUid: admin.uid,
      action: input.mutation.action,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_detail_succeeded",
    traceId: creditTraceId,
    details: {
      route: "/admin/users/[uid]",
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: input.targetUid,
      action: input.mutation.action,
      adminLogStatus,
      adminLogErrorCode,
      broadcastStatus,
      broadcastErrorCode,
      remainingCount: state.credits.remainingCount,
    },
  });

  redirect(
    buildAdminUserDetailPath(input.targetUid, {
      credits_updated: input.mutation.action,
    }),
  );
}

async function runAdminPromptEntitlementMutationFromDetailPage(input: {
  targetUid: string;
  entitlement: AssessmentPromptEntitlement;
}) {
  const {
    appendAdminLog,
    getUserByUid,
    setAssessmentPromptEntitlementForUser,
  } = await import("@/lib/server/repository");
  const { requireAdminUser } = await import("@/lib/server/session");

  const admin = await requireAdminUser();

  if (input.targetUid === admin.uid) {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: "prompt_self_mutation_forbidden",
      }),
    );
  }

  const targetUser = await getUserByUid(input.targetUid);
  if (!targetUser) {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: "prompt_user_not_found",
      }),
    );
  }

  if (input.entitlement !== "enabled" && input.entitlement !== "disabled") {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: "prompt_invalid_request",
      }),
    );
  }

  try {
    const account = await setAssessmentPromptEntitlementForUser({
      ownerUid: input.targetUid,
      entitlement: input.entitlement,
    });

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      targetUid: input.targetUid,
      ownerUid: input.targetUid,
      ownerRole: targetUser.role,
      action: `assessment-prompt-entitlement:${account.assessmentPromptEntitlement}`,
      resourceType: "assessment-prompt-entitlement",
      resourceId: input.targetUid,
      route: "/admin/users/[uid]",
      metadata: {
        entitlement: account.assessmentPromptEntitlement,
      },
    });
  } catch (error) {
    redirect(
      buildAdminUserDetailPath(input.targetUid, {
        error: mapPromptEntitlementMutationErrorToQueryCode(error),
      }),
    );
  }

  redirect(
    buildAdminUserDetailPath(input.targetUid, {
      prompt_access_updated: input.entitlement,
    }),
  );
}

async function loadAdminDetailOptionalSection<T>(input: {
  section: string;
  load: () => Promise<T>;
  fallback: T;
}) {
  try {
    return await input.load();
  } catch (error) {
    console.warn("[admin-user-detail] optional section load failed", {
      section: input.section,
      errorCode: getErrorCode(error),
    });
    return input.fallback;
  }
}

/**
 * Dedicated admin user detail page.
 *
 * Server-rendered, admin-only. Shows full user identity, credits, content,
 * storage summary, and admin controls including per-user storage cleanup.
 *
 * Access guard: requireAdminUser() in the parent layout ensures only admins
 * can reach any /admin/* route. This page additionally verifies the target
 * user exists and returns 404 if not found.
 */
export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const [adminUser, resolvedParams, resolvedSearchParams] = await Promise.all([
    requireAdminUser(),
    params,
    searchParams,
  ]);

  const targetUid = resolvedParams.uid?.trim();
  if (!targetUid) {
    redirect("/admin/users");
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    notFound();
  }

  /* Keep identity resolution strict (target user must exist) while loading the surrounding
     analytics/activity widgets in best-effort mode so a transient backend issue does not take
     down the full admin detail route for this user. */
  const [
    creditState,
    userDocuments,
    userAssessments,
    userInfographics,
    adminActivityLogs,
  ] = await Promise.all([
    loadAdminDetailOptionalSection({
      section: "assessment-credits",
      load: () =>
        getAdminAssessmentCreditStateForUser(targetUid, {
          ownerRole: targetUser.role,
        }),
      fallback: null,
    }),
    loadAdminDetailOptionalSection({
      section: "documents",
      load: () => listDocumentsForUser(targetUid, 500),
      fallback: [],
    }),
    loadAdminDetailOptionalSection({
      section: "assessment-generations",
      load: () => listAssessmentGenerationsForUser(targetUid, 500),
      fallback: [],
    }),
    loadAdminDetailOptionalSection({
      section: "infographic-generations",
      load: () => listInfographicGenerationsForUser(targetUid, 500),
      fallback: [],
    }),
    loadAdminDetailOptionalSection({
      section: "admin-activity",
      load: () => listAdminActivityLogs(120),
      fallback: [],
    }),
  ]);

  const storageAvailable = hasRemoteBlobStorage();
  const fallbackStorageNamespaceSummaries = USER_STORAGE_NAMESPACES.map((namespace) => {
    const prefixes = listOwnerScopedStoragePrefixes({
      ownerUid: targetUid,
      namespace,
    });

    return {
      namespace,
      prefix: prefixes.join(" | "),
      objectCount: 0,
      totalSizeBytes: 0,
    };
  });

  let storageNamespaceSummaries = fallbackStorageNamespaceSummaries;
  let storageSummaryDegraded = false;

  if (storageAvailable) {
    try {
      storageNamespaceSummaries = await Promise.all(
        USER_STORAGE_NAMESPACES.map(async (namespace) => {
          const prefixes = listOwnerScopedStoragePrefixes({
            ownerUid: targetUid,
            namespace,
          });
          const descriptorsByPath = new Map<string, { sizeBytes: number | null }>();

          for (const prefix of prefixes) {
            const descriptors = await listZootopiaPrivateObjectDescriptorsByPrefix(prefix);
            for (const descriptor of descriptors) {
              descriptorsByPath.set(descriptor.path, {
                sizeBytes: descriptor.sizeBytes,
              });
            }
          }

          const totalSizeBytes = [...descriptorsByPath.values()].reduce(
            (sum, descriptor) => sum + (descriptor.sizeBytes ?? 0),
            0,
          );

          return {
            namespace,
            prefix: prefixes.join(" | "),
            objectCount: descriptorsByPath.size,
            totalSizeBytes,
          };
        }),
      );
    } catch (error) {
      storageSummaryDegraded = true;
      storageNamespaceSummaries = fallbackStorageNamespaceSummaries;
      console.warn("[admin-user-detail] storage namespace summary load failed", {
        targetUid,
        errorCode: getErrorCode(error),
      });
    }
  }

  const storageObjectCount = storageNamespaceSummaries.reduce(
    (sum, item) => sum + item.objectCount,
    0,
  );
  const storageTotalSizeBytes = storageNamespaceSummaries.reduce(
    (sum, item) => sum + item.totalSizeBytes,
    0,
  );

  const retentionSummaries = getAllRetentionPolicySummaries();
  const creditsSummary = creditState?.credits ?? null;
  const creditsAccount = creditState?.account ?? null;

  const documentActiveCount = userDocuments.filter((record) => record.isActive !== false).length;
  const documentSupersededCount = userDocuments.filter((record) => record.isActive === false).length;

  const recentActivity = [
    ...userDocuments.map((record) => ({
      kind: "document",
      id: record.id,
      label: record.fileName,
      status: record.status,
      at: record.updatedAt || record.createdAt,
    })),
    ...userAssessments.map((record) => ({
      kind: "assessment",
      id: record.id,
      label: record.title,
      status: record.status,
      at: record.updatedAt || record.createdAt,
    })),
    ...userInfographics.map((record) => ({
      kind: "infographic",
      id: record.id,
      label: record.topic,
      status: record.status,
      at: record.updatedAt || record.createdAt,
    })),
  ]
    .sort((left, right) => toEpochMs(right.at) - toEpochMs(left.at))
    .slice(0, 8);

  const recentAdminActionsForTarget = adminActivityLogs
    .filter((entry) => entry.targetUid === targetUid || entry.ownerUid === targetUid)
    .slice(0, 8);

  const errorCode = getFirstSearchParamValue(resolvedSearchParams.error).trim();
  const creditsUpdatedAction = getFirstSearchParamValue(resolvedSearchParams.credits_updated).trim();
  const promptAccessUpdated = getFirstSearchParamValue(resolvedSearchParams.prompt_access_updated).trim();
  const storageCleaned = getFirstSearchParamValue(resolvedSearchParams.storage_cleaned) === "true";
  const creditMutationSuccessMessages: Record<string, string> = {
    set_access: "Assessment access was updated successfully.",
    set_daily_override: "Daily credit override was saved successfully.",
    clear_daily_override: "Daily credit override was cleared successfully.",
    add_manual_credits: "Manual credits were added successfully.",
    subtract_manual_credits: "Manual credits were deducted successfully.",
    set_manual_credits: "Manual credits were set successfully.",
    grant_credits: "Credit grant was created successfully.",
    revoke_grant: "Credit grant was revoked successfully.",
  };
  const promptMutationSuccessMessages: Record<string, string> = {
    enabled: "Assessment prompt entitlement is now enabled for this user.",
    disabled: "Assessment prompt entitlement is now disabled for this user.",
  };
  const errorMessages: Record<string, string> = {
    confirmation_required: "Confirmation is required before deleting a user account. Type DELETE USER exactly.",
    confirmation_mismatch: "Confirmation must match the exact phrase \"DELETE USER\".",
    delete_failed: "User deletion failed. Review server logs and retry.",
    storage_confirmation_mismatch: "Storage cleanup confirmation must match the target user UID.",
    storage_cleanup_failed: "Storage cleanup failed. Review API/admin logs and retry.",
    credits_user_not_found: "The selected user no longer exists.",
    credits_self_mutation_forbidden: "Admins cannot mutate their own assessment credit balances.",
    credits_amount_invalid: "Enter a valid credit amount.",
    credits_daily_override_invalid: "Daily override must be a positive whole number.",
    credits_grant_expiry_invalid: "Grant expiration must be a valid future date and time.",
    credits_grant_id_required: "A grant identifier is required for this operation.",
    credits_grant_not_found: "The selected grant could not be found.",
    credits_grant_owner_mismatch: "The selected grant does not belong to this user.",
    credits_grant_already_revoked: "This grant was already revoked.",
    credits_invalid_request: "The credit mutation request is invalid.",
    credits_update_failed: "Unable to update credits right now. Try again shortly.",
    prompt_user_not_found: "The selected user no longer exists.",
    prompt_self_mutation_forbidden: "Admins cannot mutate their own prompt entitlement from this page.",
    prompt_invalid_request: "Prompt entitlement request is invalid.",
    prompt_update_failed: "Unable to update prompt entitlement right now. Try again shortly.",
  };
  const creditMutationSuccess = creditsUpdatedAction
    ? creditMutationSuccessMessages[creditsUpdatedAction] ?? "Assessment credits updated successfully."
    : null;
  const promptMutationSuccess = promptAccessUpdated
    ? promptMutationSuccessMessages[promptAccessUpdated] ?? "Assessment prompt entitlement updated successfully."
    : null;
  const feedbackError = errorCode ? (errorMessages[errorCode] ?? "The requested admin action failed.") : null;

  /* Keep redirected action feedback inside the owning section so operators can immediately
     correlate success/failure with the controls they just used, without scanning the full page. */
  const creditFeedbackCodes = new Set([
    "credits_user_not_found",
    "credits_self_mutation_forbidden",
    "credits_amount_invalid",
    "credits_daily_override_invalid",
    "credits_grant_expiry_invalid",
    "credits_grant_id_required",
    "credits_grant_not_found",
    "credits_grant_owner_mismatch",
    "credits_grant_already_revoked",
    "credits_invalid_request",
    "credits_update_failed",
    "prompt_user_not_found",
    "prompt_self_mutation_forbidden",
    "prompt_invalid_request",
    "prompt_update_failed",
  ]);
  const adminControlsFeedbackCodes = new Set([
    "confirmation_required",
    "confirmation_mismatch",
    "delete_failed",
    "storage_confirmation_mismatch",
    "storage_cleanup_failed",
  ]);
  const creditSectionFeedbackError =
    errorCode && creditFeedbackCodes.has(errorCode) ? feedbackError : null;
  const adminControlsFeedbackError =
    errorCode && adminControlsFeedbackCodes.has(errorCode) ? feedbackError : null;
  const globalFeedbackError =
    errorCode && !creditSectionFeedbackError && !adminControlsFeedbackError
      ? feedbackError
      : null;

  const isAdmin = targetUser.role === "admin";
  const isActive = targetUser.status === "active";
  const isCurrentUser = targetUser.uid === adminUser.uid;

  const userInitial = (targetUser.fullName || targetUser.displayName || targetUser.email || targetUser.uid || "U")
    .charAt(0)
    .toUpperCase();

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const numberFormatter = new Intl.NumberFormat("en-US");
  const activeGrantCount = creditState?.grants.filter((grant) => grant.effectiveStatus === "active").length ?? 0;
  const recentCreditHistory = creditState?.history.slice(0, 12) ?? [];
  const latestCreditMutation = recentCreditHistory[0] ?? null;
  const creditControlsDisabled = isCurrentUser || !creditState;
  const creditControlsDisabledReason = !creditState
    ? "Credit state is temporarily unavailable for this user. Retry after the credit summary reloads."
    : isCurrentUser
      ? "Credit controls are intentionally disabled for your current admin account. Open another user record to add, subtract, set, or grant credits."
      : null;
  const rawObservabilityMetadata = JSON.stringify(
    {
      metadataTrust: "Best-effort/non-authoritative (observability only)",
      serverObservedSignInMetadata: targetUser.serverObservedSignInMetadata ?? null,
      clientBestEffortSignInMetadata: targetUser.clientBestEffortSignInMetadata ?? null,
      deviceLabel: targetUser.deviceLabel ?? null,
      deviceLabelSource: targetUser.deviceLabelSource ?? null,
      deviceLabelConfidence: targetUser.deviceLabelConfidence ?? null,
    },
    null,
    2,
  );

  async function runUnifiedCreditWorkspaceMutation(formData: FormData) {
    "use server";

    const targetUidFromForm = String(formData.get("targetUid") || "").trim();
    if (!targetUidFromForm || targetUidFromForm !== targetUid) {
      redirect(
        buildAdminUserDetailPath(targetUid, {
          error: "credits_invalid_request",
        }),
      );
    }

    if (targetUidFromForm === adminUser.uid) {
      redirect(
        buildAdminUserDetailPath(targetUid, {
          error: "credits_self_mutation_forbidden",
        }),
      );
    }

    const workspaceAction = String(formData.get("workspaceAction") || "").trim();
    const reason = parseOptionalMutationText(formData.get("reason"));

    switch (workspaceAction) {
      case "add": {
        const amount = parsePositiveIntegerFromForm(formData.get("amount"));
        if (!amount) {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_amount_invalid",
            }),
          );
        }

        await runAdminCreditMutationFromDetailPage({
          targetUid: targetUidFromForm,
          mutation: {
            action: "add_manual_credits",
            amount,
            reason,
          },
        });
        return;
      }

      case "subtract": {
        const amount = parsePositiveIntegerFromForm(formData.get("amount"));
        if (!amount) {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_amount_invalid",
            }),
          );
        }

        await runAdminCreditMutationFromDetailPage({
          targetUid: targetUidFromForm,
          mutation: {
            action: "subtract_manual_credits",
            amount,
            reason,
          },
        });
        return;
      }

      case "set": {
        const amount = parseNonNegativeIntegerFromForm(formData.get("amount"));
        if (amount === null) {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_amount_invalid",
            }),
          );
        }

        await runAdminCreditMutationFromDetailPage({
          targetUid: targetUidFromForm,
          mutation: {
            action: "set_manual_credits",
            amount,
            reason,
          },
        });
        return;
      }

      case "grant": {
        const amount = parsePositiveIntegerFromForm(formData.get("amount"));
        if (!amount) {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_amount_invalid",
            }),
          );
        }

        const parsedExpiry = parseOptionalMutationExpiry(formData.get("expiresAt"));
        if (parsedExpiry === "INVALID") {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_grant_expiry_invalid",
            }),
          );
        }

        await runAdminCreditMutationFromDetailPage({
          targetUid: targetUidFromForm,
          mutation: {
            action: "grant_credits",
            amount,
            expiresAt: parsedExpiry,
            reason,
            note: parseOptionalMutationText(formData.get("note"), 1000),
          },
        });
        return;
      }

      case "override": {
        const overrideMode = String(formData.get("overrideMode") || "set").trim();

        if (overrideMode === "clear") {
          await runAdminCreditMutationFromDetailPage({
            targetUid: targetUidFromForm,
            mutation: {
              action: "clear_daily_override",
              reason,
            },
          });
          return;
        }

        const dailyLimitOverride = parsePositiveIntegerFromForm(
          formData.get("dailyLimitOverride"),
        );
        if (!dailyLimitOverride) {
          redirect(
            buildAdminUserDetailPath(targetUid, {
              error: "credits_daily_override_invalid",
            }),
          );
        }

        await runAdminCreditMutationFromDetailPage({
          targetUid: targetUidFromForm,
          mutation: {
            action: "set_daily_override",
            dailyLimitOverride,
            reason,
          },
        });
        return;
      }

      default:
        redirect(
          buildAdminUserDetailPath(targetUid, {
            error: "credits_invalid_request",
          }),
        );
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-zinc-200/80 bg-white/78 dark:border-white/10 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-[0_20px_48px_rgba(148,163,184,0.16)] dark:shadow-2xl dark:shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-2xl font-bold text-accent shadow-sm">
              {userInitial}
            </div>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black tracking-tight text-zinc-900 dark:text-white truncate">
                {targetUser.fullName || targetUser.displayName || targetUser.email || targetUser.uid}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono truncate">
                {targetUser.uid}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                isAdmin
                  ? "bg-gold/15 text-[#b48d3c] dark:bg-yellow-500/15 dark:text-yellow-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
              {isAdmin ? "Admin" : "User"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                isActive
                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
              }`}
            >
              {isActive ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
              {isActive ? "Active" : "Suspended"}
            </span>

            {targetUser.profileCompleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Profile Complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Profile Incomplete
              </span>
            )}

            {isCurrentUser && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                Current User
              </span>
            )}
          </div>
        </div>
      </section>

      {globalFeedbackError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{globalFeedbackError}</p>
        </div>
      )}

      {/* Identity / Account Section */}
      <section className={ADMIN_USER_DETAIL_PANEL_CLASS}>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Identity & Account Summary
        </h2>

        <div className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            High-signal profile and account fields for fast operator scanning.
          </p>
          <dl className="mt-3 divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
            <AdminDefinitionRow label="UID" value={targetUser.uid} mono />
            <AdminDefinitionRow label="Email" value={targetUser.email || "Not set"} />
            <AdminDefinitionRow label="Display Name" value={targetUser.displayName || "Not set"} />
            <AdminDefinitionRow label="Full Name" value={targetUser.fullName || "Not set"} />
            <AdminDefinitionRow label="University Code" value={targetUser.universityCode || "Not set"} />
            <AdminDefinitionRow label="Phone" value={targetUser.phoneNumber || "Not set"} />
            <AdminDefinitionRow label="Gender" value={formatStoredGender(targetUser.gender)} />
            <AdminDefinitionRow label="Nationality" value={targetUser.nationality || "Not set"} />
            <AdminDefinitionRow label="Created" value={formatDateTime(dateFormatter, targetUser.createdAt)} />
            <AdminDefinitionRow
              label="Last Updated"
              value={formatDateTime(dateFormatter, targetUser.updatedAt)}
            />
          </dl>
        </div>

        <div className={`mt-5 ${ADMIN_USER_DETAIL_SUBSECTION_CLASS}`}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Access / Role / Status Flags</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailCard
              label="Role"
              value={targetUser.role}
              badge={targetUser.role === "admin" ? "accent" : "default"}
            />
            <DetailCard
              label="Status"
              value={targetUser.status}
              badge={targetUser.status === "active" ? "success" : "danger"}
            />
            <DetailCard
              label="Profile Completed"
              value={targetUser.profileCompleted ? "Yes" : "No"}
              badge={targetUser.profileCompleted ? "success" : "warning"}
            />
            <DetailCard
              label="Metadata Trust"
              value="Best-effort/non-authoritative"
              subtitle="Observability only"
            />
          </div>
        </div>

        {/* Keep high-noise observability payloads collapsed by default so operators can
            prioritize account-critical decisions before drilling into diagnostics. */}
        <div className="mt-5 space-y-3">
          <AdminMetadataDisclosure
            title="Server IP / Geo / Header Metadata"
            description="Edge-observed request context and trust signals."
          >
            <dl className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
              <AdminDefinitionRow
                label="Server Observed At"
                value={formatDateTime(dateFormatter, targetUser.serverObservedSignInMetadata?.observedAt)}
              />
              <AdminDefinitionRow
                label="Server Public IP"
                value={formatMetadataValue(targetUser.serverObservedSignInMetadata?.publicIp)}
              />
              <AdminDefinitionRow
                label="Server Forwarded IP Chain"
                value={formatMetadataStringArray(targetUser.serverObservedSignInMetadata?.forwardedIpChain)}
              />
              <AdminDefinitionRow
                label="Server Geo (CDN/Edge)"
                value={formatServerObservedGeo(targetUser.serverObservedSignInMetadata?.requestGeo)}
              />
              <AdminDefinitionRow
                label="Server Accept-Language"
                value={formatMetadataValue(targetUser.serverObservedSignInMetadata?.acceptLanguage)}
              />
            </dl>
          </AdminMetadataDisclosure>

          <AdminMetadataDisclosure
            title="Client / Browser Details"
            description="Best-effort browser and locale metadata captured at sign-in."
          >
            <dl className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
              <AdminDefinitionRow
                label="Client Captured At"
                value={formatDateTime(dateFormatter, targetUser.clientBestEffortSignInMetadata?.capturedAt)}
              />
              <AdminDefinitionRow
                label="Client Browser / OS / Platform"
                value={[
                  targetUser.clientBestEffortSignInMetadata?.browser,
                  targetUser.clientBestEffortSignInMetadata?.operatingSystem,
                  targetUser.clientBestEffortSignInMetadata?.platform,
                ].filter((entry): entry is string => Boolean(entry)).join(" / ") || "Unavailable"}
              />
              <AdminDefinitionRow
                label="Client Timezone / Language"
                value={[
                  targetUser.clientBestEffortSignInMetadata?.timezone
                    ? `tz=${targetUser.clientBestEffortSignInMetadata.timezone}`
                    : null,
                  targetUser.clientBestEffortSignInMetadata?.language
                    ? `lang=${targetUser.clientBestEffortSignInMetadata.language}`
                    : null,
                  targetUser.clientBestEffortSignInMetadata?.languages
                    ? `langs=${targetUser.clientBestEffortSignInMetadata.languages.join(",")}`
                    : null,
                ].filter((entry): entry is string => Boolean(entry)).join("; ") || "Unavailable"}
              />
              <AdminDefinitionRow
                label="Approx Device Label (Best-effort)"
                value={targetUser.deviceLabel || "Unavailable"}
              />
              <AdminDefinitionRow
                label="Approx Device Label Source"
                value={targetUser.deviceLabelSource || "Unavailable"}
              />
              <AdminDefinitionRow
                label="Approx Device Label Confidence"
                value={formatDeviceLabelConfidence(targetUser.deviceLabelConfidence)}
              />
            </dl>
          </AdminMetadataDisclosure>

          <AdminMetadataDisclosure
            title="Viewport / Touch / Device Capability"
            description="Device hints used only for observability and support diagnostics."
          >
            <dl className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
              <AdminDefinitionRow
                label="Client UAData Hints"
                value={formatClientUserAgentDataHints(targetUser.clientBestEffortSignInMetadata?.userAgentData)}
              />
              <AdminDefinitionRow
                label="Client Screen / Viewport"
                value={formatClientScreenViewport({
                  screen: targetUser.clientBestEffortSignInMetadata?.screen ?? null,
                  viewport: targetUser.clientBestEffortSignInMetadata?.viewport ?? null,
                })}
              />
              <AdminDefinitionRow
                label="Client Touch / Hardware"
                value={formatClientTouchHardware({
                  maxTouchPoints: targetUser.clientBestEffortSignInMetadata?.maxTouchPoints ?? null,
                  touchCapable: targetUser.clientBestEffortSignInMetadata?.touchCapable ?? null,
                  deviceMemoryGb: targetUser.clientBestEffortSignInMetadata?.deviceMemoryGb ?? null,
                  hardwareConcurrency: targetUser.clientBestEffortSignInMetadata?.hardwareConcurrency ?? null,
                })}
              />
              <AdminDefinitionRow
                label="Client Network Hints"
                value={formatClientNetworkHints(targetUser.clientBestEffortSignInMetadata?.network)}
              />
            </dl>
          </AdminMetadataDisclosure>

          <AdminMetadataDisclosure
            title="Raw Observability Snapshot (Verbose)"
            description="Unformatted metadata payload for deep troubleshooting."
          >
            <pre className="max-h-72 overflow-auto rounded-xl border border-zinc-200/80 bg-white/92 p-3 text-xs text-zinc-700 shadow-[0_8px_20px_rgba(148,163,184,0.08)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:shadow-none">
              {rawObservabilityMetadata}
            </pre>
          </AdminMetadataDisclosure>
        </div>
      </section>

      {/* Credits / Usage Section */}
      <section className={ADMIN_USER_DETAIL_PANEL_CLASS}>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Credits & Usage
        </h2>

        {/* Credit and prompt controls submit server actions then redirect with query params.
            Keep feedback next to this section's controls so context remains local and unambiguous. */}
        {creditMutationSuccess ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200 shadow-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{creditMutationSuccess}</p>
          </div>
        ) : null}

        {creditsUpdatedAction && latestCreditMutation ? (
          <div className="mb-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-emerald-900 dark:text-emerald-200 shadow-sm">
            <p className="text-sm font-semibold">Resolved Credit Snapshot (Server Truth)</p>
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">
              {formatAdminCreditMutationAction(latestCreditMutation.action)} at {formatDateTime(dateFormatter, latestCreditMutation.createdAt)} by {latestCreditMutation.adminUid}
            </p>
            <p className="mt-2 text-xs text-emerald-800/90 dark:text-emerald-200/90">
              Manual {numberFormatter.format(latestCreditMutation.before.manualCredits)} to {numberFormatter.format(latestCreditMutation.after.manualCredits)} | Remaining {latestCreditMutation.before.remainingCount === null ? "No limit" : numberFormatter.format(latestCreditMutation.before.remainingCount)} to {latestCreditMutation.after.remainingCount === null ? "No limit" : numberFormatter.format(latestCreditMutation.after.remainingCount)}
            </p>
          </div>
        ) : null}

        {promptMutationSuccess ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200 shadow-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{promptMutationSuccess}</p>
          </div>
        ) : null}

        {creditSectionFeedbackError ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{creditSectionFeedbackError}</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            label="Assessment Access"
            value={creditsAccount?.assessmentAccess ?? "unavailable"}
            badge={creditsAccount?.assessmentAccess === "enabled" ? "success" : "danger"}
          />
          <DetailCard
            label="Prompt Entitlement"
            value={creditsAccount?.assessmentPromptEntitlement ?? "disabled"}
            badge={creditsAccount?.assessmentPromptEntitlement === "enabled" ? "success" : "warning"}
          />
          <DetailCard
            label="Daily Limit"
            value={
              creditsSummary
                ? numberFormatter.format(creditsSummary.dailyLimit)
                : "Unavailable"
            }
            subtitle={
              creditsSummary
                ? `Source: ${creditsSummary.dailyLimitSource}`
                : "No credit summary"
            }
          />
          <DetailCard
            label="Used Today"
            value={
              creditsSummary
                ? numberFormatter.format(creditsSummary.usedCount)
                : "Unavailable"
            }
          />
          <DetailCard
            label="Remaining Today"
            value={
              creditsSummary
                ? creditsSummary.remainingCount === null
                  ? "No limit"
                  : numberFormatter.format(creditsSummary.remainingCount)
                : "Unavailable"
            }
          />
          <DetailCard
            label="Manual Credits"
            value={
              creditsAccount
                ? numberFormatter.format(creditsAccount.manualCredits)
                : "Unavailable"
            }
          />
          <DetailCard
            label="Grant Credits"
            value={
              creditsSummary
                ? numberFormatter.format(creditsSummary.grantCreditsAvailable)
                : "Unavailable"
            }
          />
          <DetailCard
            label="Active Grants"
            value={numberFormatter.format(activeGrantCount)}
          />
          <DetailCard
            label="Credits Reset At"
            value={
              creditsSummary
                ? formatDateTime(dateFormatter, creditsSummary.resetsAt)
                : "Unavailable"
            }
            icon={<Clock3 className="h-4 w-4" />}
          />
        </div>

        {/*
          Credit mutations stay server-authoritative: these controls only submit server actions
          that call repository mutations and append admin logs. Keep browser logic display-only.
        */}
        <div className="mt-5 space-y-4">
          <div className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Credit Management Workspace</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              One structured operator workspace for manual balance updates, temporary grants, and daily overrides.
            </p>
            {creditsAccount?.assessmentAccess === "disabled" ? (
              <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 shadow-sm shadow-amber-100/80 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200 dark:shadow-none">
                Credit grants can persist while this user still shows no usable balance if Assessment Access is disabled. Re-enable access first if the user should consume the granted credits immediately.
              </div>
            ) : null}

            {/*
              Access and prompt-entitlement controls stay server-authoritative and separate from
              numeric credit mutations. They remain available as secondary governance toggles.
            */}
            <div className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3">
              <CreditAccessToggleForm
                targetUid={targetUser.uid}
                currentAccess={creditsAccount?.assessmentAccess ?? "enabled"}
                disabled={creditControlsDisabled}
              />
              <PromptEntitlementToggleForm
                targetUid={targetUser.uid}
                currentEntitlement={creditsAccount?.assessmentPromptEntitlement ?? "disabled"}
                disabled={creditControlsDisabled}
              />
            </div>

            <div className="mt-3">
              <AdminCreditManagementWorkspace
                targetUid={targetUser.uid}
                currentCredits={creditsSummary}
                currentAccount={creditsAccount}
                latestMutation={latestCreditMutation}
                disabled={creditControlsDisabled}
                disabledReason={creditControlsDisabledReason}
                mutationAction={runUnifiedCreditWorkspaceMutation}
              />
            </div>
          </div>

          <div className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Credit Grants</h3>
            {creditState?.grants.length ? (
              <div className="mt-3 space-y-2">
                {creditState.grants.map((grant) => {
                  const canRevoke = grant.effectiveStatus === "active";
                  return (
                    <div
                      key={grant.id}
                      className={ADMIN_USER_DETAIL_MUTATION_CARD_CLASS}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {numberFormatter.format(grant.available)} / {numberFormatter.format(grant.credits)} available
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                            grant.effectiveStatus === "active"
                              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {grant.effectiveStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono break-all">
                        grant: {grant.id}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        expires: {grant.expiresAt ? formatDateTime(dateFormatter, grant.expiresAt) : "No expiry"}
                      </p>
                      {grant.reason ? (
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                          reason: {grant.reason}
                        </p>
                      ) : null}
                      {!canRevoke ? (
                        <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Only active grants can be revoked from this panel.
                        </p>
                      ) : null}

                      <div className="mt-2">
                        <RevokeCreditGrantForm
                          targetUid={targetUser.uid}
                          grantId={grant.id}
                          disabled={isCurrentUser || !canRevoke}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                No credit grants found for this user.
              </p>
            )}
          </div>
        </div>

        <div className={`mt-5 ${ADMIN_USER_DETAIL_SUBSECTION_CLASS}`}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Credit Mutation History</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Durable per-user ledger showing before/after balance snapshots for every admin mutation.
          </p>
          {recentCreditHistory.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No credit mutation history is recorded for this user yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentCreditHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={ADMIN_USER_DETAIL_MUTATION_CARD_CLASS}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {formatAdminCreditMutationAction(entry.action)}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      {entry.action}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {formatDateTime(dateFormatter, entry.createdAt)} | admin: {entry.adminUid}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Manual {numberFormatter.format(entry.before.manualCredits)} to {numberFormatter.format(entry.after.manualCredits)} | Remaining {entry.before.remainingCount === null ? "No limit" : numberFormatter.format(entry.before.remainingCount)} to {entry.after.remainingCount === null ? "No limit" : numberFormatter.format(entry.after.remainingCount)}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Access {entry.before.assessmentAccess} to {entry.after.assessmentAccess}
                  </p>
                  {entry.reason ? (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                      reason: {entry.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Admin Controls Section */}
      <section className={ADMIN_USER_DETAIL_PANEL_CLASS}>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Controls
        </h2>

        {isCurrentUser && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You cannot perform destructive actions on your own account from this page.
          </div>
        )}

        {storageCleaned ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200 shadow-sm">
            <HardDrive className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Per-user storage cleanup completed. User-owned objects were removed from canonical
              {" "}
              <span className="font-mono">{`users/${targetUser.uid}/...`}</span>
              {" "}
              namespaces and legacy uploads/temp, documents, assessment-results,
              and assessment-exports paths.
            </p>
          </div>
        ) : null}

        {adminControlsFeedbackError ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{adminControlsFeedbackError}</p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Role toggle */}
          <RoleToggleForm
            targetUid={targetUser.uid}
            currentRole={targetUser.role}
            disabled={isCurrentUser}
          />

          {/* Status toggle */}
          <StatusToggleForm
            targetUid={targetUser.uid}
            currentStatus={targetUser.status}
            disabled={isCurrentUser}
          />
        </div>

        {/*
          This dedicated destructive row isolates irreversible actions on /admin/users/[uid]
          so routine role/status management stays visually and cognitively separate.
        */}
        <div className="mt-5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
            Destructive Actions
          </h3>
          <p className="mt-1 text-xs text-red-700/90 dark:text-red-300/90">
            These actions are irreversible. Confirm carefully before submitting.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* Delete user account */}
            <DeleteUserForm
              targetUid={targetUser.uid}
              disabled={isCurrentUser}
            />

            {/* Delete all files for this user */}
            <DeleteUserStorageForm
              targetUid={targetUser.uid}
              disabled={isCurrentUser}
            />
          </div>
        </div>
      </section>

      {/* Storage / Content Section */}
      <section className={ADMIN_USER_DETAIL_PANEL_CLASS}>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage & Content
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            label="Documents"
            value={numberFormatter.format(userDocuments.length)}
            subtitle={`Active: ${numberFormatter.format(documentActiveCount)} | Superseded: ${numberFormatter.format(documentSupersededCount)}`}
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Assessments"
            value={numberFormatter.format(userAssessments.length)}
            subtitle="Assessment generations"
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Infographics"
            value={numberFormatter.format(userInfographics.length)}
            subtitle="Infographic generations"
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Storage Objects"
            value={numberFormatter.format(storageObjectCount)}
            subtitle={`Total size: ${formatBytes(storageTotalSizeBytes)}`}
            icon={<HardDrive className="h-4 w-4" />}
          />
        </div>

        <div className={`mt-5 ${ADMIN_USER_DETAIL_SUBSECTION_CLASS}`}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Database className="h-4 w-4" />
            Namespace Breakdown
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {storageNamespaceSummaries.map((summary) => (
              <div
                key={summary.namespace}
                className={ADMIN_USER_DETAIL_MUTATION_CARD_CLASS}
              >
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{summary.prefix}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                  {numberFormatter.format(summary.objectCount)} object(s)
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Size: {formatBytes(summary.totalSizeBytes)}
                </p>
              </div>
            ))}
          </div>
          {storageSummaryDegraded ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Storage namespace details are temporarily unavailable. Counts are shown in fallback mode.
            </p>
          ) : null}

          {!storageAvailable && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Remote storage is not available in this runtime, so object counts and sizes are not loaded.
            </p>
          )}
        </div>

        <div className={`mt-5 ${ADMIN_USER_DETAIL_SUBSECTION_CLASS}`}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Active Retention Policies
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <DetailCard
              label="Uploads"
              value={retentionSummaries.uploads}
              subtitle="users/*/documents/*, users/*/uploads/temp/*, and legacy paths"
            />
            <DetailCard
              label="Results"
              value={retentionSummaries.results}
              subtitle="users/*/assessment-results/* and legacy paths"
            />
            <DetailCard
              label="Exports"
              value={retentionSummaries.exports}
              subtitle="users/*/assessment-exports/* and legacy paths"
            />
          </div>
        </div>
      </section>

      {/* Activity Section */}
      <section className={ADMIN_USER_DETAIL_PANEL_CLASS}>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">Content Timeline</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No content activity found for this user.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="rounded-xl border border-zinc-200/80 bg-white/92 px-3 py-2 shadow-[0_8px_20px_rgba(148,163,184,0.08)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
                  >
                    <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {item.kind} · {item.status}
                    </p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{item.label || item.id}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(dateFormatter, item.at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <History className="h-4 w-4" />
              Admin Action Timeline
            </h3>
            {recentAdminActionsForTarget.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No recent admin actions found for this user.</p>
            ) : (
              <div className="space-y-2">
                {recentAdminActionsForTarget.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-zinc-200/80 bg-white/92 px-3 py-2 shadow-[0_8px_20px_rgba(148,163,184,0.08)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
                  >
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{entry.action}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Route: {entry.route || "unknown"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(dateFormatter, entry.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Back to users list */}
      <div className="flex justify-start">
        <a
          href="/admin/users"
          className="inline-flex items-center rounded-lg border border-zinc-300/80 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm shadow-zinc-200/70 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60 dark:hover:text-white"
        >
          &larr; Back to Users List
        </a>
      </div>
    </div>
  );
}

function AdminDefinitionRow({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[minmax(10.5rem,12.75rem)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="min-w-0">
        <p className={`text-sm font-medium text-zinc-900 dark:text-white ${mono ? "font-mono text-xs break-all" : "break-words"}`}>
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        ) : null}
      </dd>
    </div>
  );
}

function AdminMetadataDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className={ADMIN_USER_DETAIL_SUBSECTION_CLASS}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
        <span className="inline-flex shrink-0 rounded-full border border-zinc-300/80 bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Toggle
        </span>
      </summary>
      <div className="mt-3 border-t border-zinc-200/75 pt-3 dark:border-zinc-800/80">
        {children}
      </div>
    </details>
  );
}

/**
 * Reusable detail card for the admin user detail page.
 */
function DetailCard({
  label,
  value,
  subtitle,
  mono,
  icon,
  badge,
}: {
  label: string;
  value: string;
  subtitle?: string;
  mono?: boolean;
  icon?: React.ReactNode;
  badge?: "accent" | "success" | "danger" | "warning" | "default";
}) {
  const badgeClasses: Record<string, string> = {
    accent: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    success: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    danger: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    warning: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    default: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
  };

  return (
    <div className={ADMIN_USER_DETAIL_CARD_CLASS}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        {label}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {icon && <span className="text-zinc-400">{icon}</span>}
        <p className={`text-sm font-medium text-zinc-900 dark:text-white ${mono ? "font-mono text-xs break-all" : ""}`}>
          {value}
        </p>
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      )}
      {badge && (
        <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${badgeClasses[badge] || badgeClasses.default}`}>
          {value}
        </span>
      )}
    </div>
  );
}

/**
 * Client-side role toggle form.
 */
function RoleToggleForm({
  targetUid,
  currentRole,
  disabled,
}: {
  targetUid: string;
  currentRole: string;
  disabled: boolean;
}) {
  const isAdmin = currentRole === "admin";
  const actionLabel = isAdmin ? "Demote to User" : "Promote to Admin";

  return (
    <form
      action={async () => {
        "use server";
        const { setUserRole } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        await setUserRole(targetUid, isAdmin ? "user" : "admin");
        redirect(`/admin/users/${targetUid}`);
      }}
    >
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={`w-full h-10 justify-center gap-2 ${ADMIN_USER_DETAIL_OUTLINE_BUTTON_CLASS}`}
      >
        {isAdmin ? <ShieldX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Client-side status toggle form.
 */
function StatusToggleForm({
  targetUid,
  currentStatus,
  disabled,
}: {
  targetUid: string;
  currentStatus: string;
  disabled: boolean;
}) {
  const isActive = currentStatus === "active";
  const actionLabel = isActive ? "Suspend User" : "Activate User";

  return (
    <form
      action={async () => {
        "use server";
        const { setUserStatus } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        await setUserStatus(targetUid, isActive ? "suspended" : "active");
        redirect(`/admin/users/${targetUid}`);
      }}
    >
      <Button
        type="submit"
        variant={isActive ? "outline" : "default"}
        size="sm"
        disabled={disabled}
        className={`w-full h-10 justify-center gap-2 ${
          isActive
            ? ADMIN_USER_DETAIL_DANGER_OUTLINE_BUTTON_CLASS
            : ADMIN_USER_DETAIL_PRIMARY_BUTTON_CLASS
        }`}
      >
        {isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Prompt entitlement toggle controls persistent assessment-prompt eligibility per user.
 * This admin-owned toggle is intentionally separate from password/account flows.
 */
function PromptEntitlementToggleForm({
  targetUid,
  currentEntitlement,
  disabled,
}: {
  targetUid: string;
  currentEntitlement: AssessmentPromptEntitlement;
  disabled: boolean;
}) {
  const nextEntitlement = currentEntitlement === "enabled" ? "disabled" : "enabled";
  const actionLabel = nextEntitlement === "enabled"
    ? "Enable Prompt Entitlement"
    : "Disable Prompt Entitlement";

  return (
    <form
      action={async () => {
        "use server";
        await runAdminPromptEntitlementMutationFromDetailPage({
          targetUid,
          entitlement: nextEntitlement,
        });
      }}
    >
      <Button
        type="submit"
        variant={nextEntitlement === "enabled" ? "default" : "outline"}
        size="sm"
        disabled={disabled}
        className={`w-full min-h-10 h-auto justify-center gap-2 px-3 py-2 text-center leading-tight whitespace-normal ${
          nextEntitlement === "enabled"
            ? ADMIN_USER_DETAIL_PRIMARY_BUTTON_CLASS
            : ADMIN_USER_DETAIL_OUTLINE_BUTTON_CLASS
        }`}
      >
        {nextEntitlement === "enabled" ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <ShieldX className="h-4 w-4" />
        )}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Credit access toggle stays backend-owned through repository mutations.
 */
function CreditAccessToggleForm({
  targetUid,
  currentAccess,
  disabled,
}: {
  targetUid: string;
  currentAccess: "enabled" | "disabled";
  disabled: boolean;
}) {
  const nextAccess = currentAccess === "enabled" ? "disabled" : "enabled";
  const actionLabel = nextAccess === "enabled" ? "Enable Assessment Access" : "Disable Assessment Access";

  return (
    <form
      action={async () => {
        "use server";
        await runAdminCreditMutationFromDetailPage({
          targetUid,
          mutation: {
            action: "set_access",
            access: nextAccess,
            reason: `Admin set assessment access to ${nextAccess}.`,
          },
        });
      }}
    >
      <Button
        type="submit"
        variant={nextAccess === "enabled" ? "default" : "outline"}
        size="sm"
        disabled={disabled}
        className={`w-full min-h-10 h-auto justify-center gap-2 px-3 py-2 text-center leading-tight whitespace-normal ${
          nextAccess === "enabled"
            ? ADMIN_USER_DETAIL_PRIMARY_BUTTON_CLASS
            : ADMIN_USER_DETAIL_OUTLINE_BUTTON_CLASS
        }`}
      >
        {actionLabel}
      </Button>
    </form>
  );
}

function RevokeCreditGrantForm({
  targetUid,
  grantId,
  disabled,
}: {
  targetUid: string;
  grantId: string;
  disabled: boolean;
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        await runAdminCreditMutationFromDetailPage({
          targetUid,
          mutation: {
            action: "revoke_grant",
            grantId,
            reason: parseOptionalMutationText(formData.get("reason")),
          },
        });
      }}
    >
      <div className="space-y-2">
        <input
          type="text"
          name="reason"
          placeholder="Revocation reason (optional)"
          className={`${ADMIN_USER_DETAIL_FIELD_CONTROL_CLASS} h-9 w-full text-xs`}
          disabled={disabled}
          maxLength={320}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`h-8 w-full ${ADMIN_USER_DETAIL_DANGER_OUTLINE_BUTTON_CLASS}`}
        >
          Revoke Grant
        </Button>
      </div>
    </form>
  );
}

/**
 * Delete user account form with confirmation.
 */
function DeleteUserForm({
  targetUid,
  disabled,
}: {
  targetUid: string;
  disabled: boolean;
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const { deleteUserAccountAsAdmin } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        const admin = await requireAdminUser();
        const confirmation = String(formData.get("confirmation") || "").trim();

        if (!confirmation) {
          redirect(`/admin/users/${targetUid}?error=confirmation_required`);
        }

        if (confirmation !== DELETE_USER_CONFIRMATION_PHRASE) {
          redirect(`/admin/users/${targetUid}?error=confirmation_mismatch`);
        }

        try {
          await deleteUserAccountAsAdmin({
            targetUid,
            actingAdmin: { uid: admin.uid, role: admin.role },
            route: "/admin/users/[uid]",
          });
          redirect("/admin/users?deleted=true");
        } catch {
          redirect(`/admin/users/${targetUid}?error=delete_failed`);
        }
      }}
    >
      <input type="hidden" name="uid" value={targetUid} />
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
          Type {DELETE_USER_CONFIRMATION_PHRASE} exactly
        </p>
        <input
          type="text"
          name="confirmation"
          placeholder={`Type "${DELETE_USER_CONFIRMATION_PHRASE}" to confirm`}
          className={`${ADMIN_USER_DETAIL_FIELD_CONTROL_CLASS} h-10 w-full text-xs`}
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className={`w-full h-10 justify-center gap-2 ${ADMIN_USER_DETAIL_DANGER_BUTTON_CLASS}`}
        >
          <Trash2 className="h-4 w-4" />
          Delete User
        </Button>
      </div>
    </form>
  );
}

/**
 * Delete all storage files for this user form with confirmation.
 */
function DeleteUserStorageForm({
  targetUid,
  disabled,
}: {
  targetUid: string;
  disabled: boolean;
}) {
  const confirmationTarget = targetUid;

  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        const confirmation = String(formData.get("confirmation") || "").trim();

        if (confirmation !== targetUid) {
          redirect(`/admin/users/${targetUid}?error=storage_confirmation_mismatch`);
        }

        try {
          const adminApiBaseUrl = getServerRuntimeBaseUrl();
          const response = await fetch(`${adminApiBaseUrl}/api/admin/storage/cleanup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "user",
              targetUid,
              confirmation,
            }),
          });

          if (!response.ok) {
            redirect(`/admin/users/${targetUid}?error=storage_cleanup_failed`);
          }

          redirect(`/admin/users/${targetUid}?storage_cleaned=true`);
        } catch {
          redirect(`/admin/users/${targetUid}?error=storage_cleanup_failed`);
        }
      }}
    >
      <input type="hidden" name="uid" value={targetUid} />
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
          Type the target UID exactly
        </p>
        <input
          type="text"
          name="confirmation"
          placeholder={`Type "${confirmationTarget}" to confirm`}
          className={`${ADMIN_USER_DETAIL_FIELD_CONTROL_CLASS} h-10 w-full text-xs`}
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className={`w-full h-10 justify-center gap-2 ${ADMIN_USER_DETAIL_DANGER_BUTTON_CLASS}`}
        >
          <HardDrive className="h-4 w-4" />
          Delete All Files
        </Button>
      </div>
    </form>
  );
}
