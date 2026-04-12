import "server-only";

import {
  Activity,
  AlertCircle,
  Calendar,
  Clock3,
  Database,
  FileText,
  Gauge,
  HardDrive,
  History,
  Mail,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  User,
  UserCheck,
  UserX,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
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

export const runtime = "nodejs";

const USER_STORAGE_NAMESPACES = [
  "uploads/temp",
  "documents",
  "assessment-results",
  "assessment-exports",
] as const;
const DELETE_USER_CONFIRMATION_PHRASE = "DELETE USER";

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

  const [
    targetUser,
    creditState,
    userDocuments,
    userAssessments,
    userInfographics,
    adminActivityLogs,
  ] = await Promise.all([
    getUserByUid(targetUid),
    getAdminAssessmentCreditStateForUser(targetUid),
    listDocumentsForUser(targetUid, 500),
    listAssessmentGenerationsForUser(targetUid, 500),
    listInfographicGenerationsForUser(targetUid, 500),
    listAdminActivityLogs(120),
  ]);

  if (!targetUser) {
    notFound();
  }

  const storageAvailable = hasRemoteBlobStorage();
  const storageNamespaceSummaries = storageAvailable
    ? await Promise.all(
      USER_STORAGE_NAMESPACES.map(async (namespace) => {
        const prefix = `${namespace}/${targetUid}`;
        const descriptors = await listZootopiaPrivateObjectDescriptorsByPrefix(prefix);
        const totalSizeBytes = descriptors.reduce(
          (sum, descriptor) => sum + (descriptor.sizeBytes ?? 0),
          0,
        );

        return {
          namespace,
          prefix,
          objectCount: descriptors.length,
          totalSizeBytes,
        };
      }),
    )
    : USER_STORAGE_NAMESPACES.map((namespace) => ({
      namespace,
      prefix: `${namespace}/${targetUid}`,
      objectCount: 0,
      totalSizeBytes: 0,
    }));

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
  const storageCleaned = getFirstSearchParamValue(resolvedSearchParams.storage_cleaned) === "true";
  const errorMessages: Record<string, string> = {
    confirmation_required: "Confirmation is required before deleting a user account. Type DELETE USER exactly.",
    confirmation_mismatch: "Confirmation must match the exact phrase \"DELETE USER\".",
    delete_failed: "User deletion failed. Review server logs and retry.",
    storage_confirmation_mismatch: "Storage cleanup confirmation must match the target user UID.",
    storage_cleanup_failed: "Storage cleanup failed. Review API/admin logs and retry.",
  };
  const feedbackError = errorCode ? (errorMessages[errorCode] ?? "The requested admin action failed.") : null;

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

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
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

      {storageCleaned && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200 shadow-sm">
          <HardDrive className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            Per-user storage cleanup completed. User-owned objects were removed from uploads/temp,
            documents, assessment-results, and assessment-exports.
          </p>
        </div>
      )}

      {feedbackError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{feedbackError}</p>
        </div>
      )}

      {/* Identity / Account Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Identity & Account
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailCard label="UID" value={targetUser.uid} mono />
          <DetailCard label="Email" value={targetUser.email || "Not set"} icon={<Mail className="h-4 w-4" />} />
          <DetailCard label="Display Name" value={targetUser.displayName || "Not set"} />
          <DetailCard
            label="Metadata Trust"
            value="Best-effort/non-authoritative (observability only)"
          />
          <DetailCard
            label="Server Observed At"
            value={formatDateTime(dateFormatter, targetUser.serverObservedSignInMetadata?.observedAt)}
          />
          <DetailCard
            label="Server Public IP"
            value={formatMetadataValue(targetUser.serverObservedSignInMetadata?.publicIp)}
          />
          <DetailCard
            label="Server Forwarded IP Chain"
            value={formatMetadataStringArray(targetUser.serverObservedSignInMetadata?.forwardedIpChain)}
          />
          <DetailCard
            label="Server Geo (CDN/Edge)"
            value={formatServerObservedGeo(targetUser.serverObservedSignInMetadata?.requestGeo)}
          />
          <DetailCard
            label="Server Accept-Language"
            value={formatMetadataValue(targetUser.serverObservedSignInMetadata?.acceptLanguage)}
          />
          <DetailCard
            label="Client Captured At"
            value={formatDateTime(dateFormatter, targetUser.clientBestEffortSignInMetadata?.capturedAt)}
          />
          <DetailCard
            label="Client Browser / OS / Platform"
            value={[
              targetUser.clientBestEffortSignInMetadata?.browser,
              targetUser.clientBestEffortSignInMetadata?.operatingSystem,
              targetUser.clientBestEffortSignInMetadata?.platform,
            ].filter((entry): entry is string => Boolean(entry)).join(" / ") || "Unavailable"}
          />
          <DetailCard
            label="Client UAData Hints"
            value={formatClientUserAgentDataHints(targetUser.clientBestEffortSignInMetadata?.userAgentData)}
          />
          <DetailCard
            label="Client Screen / Viewport"
            value={formatClientScreenViewport({
              screen: targetUser.clientBestEffortSignInMetadata?.screen ?? null,
              viewport: targetUser.clientBestEffortSignInMetadata?.viewport ?? null,
            })}
          />
          <DetailCard
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
          <DetailCard
            label="Client Touch / Hardware"
            value={formatClientTouchHardware({
              maxTouchPoints: targetUser.clientBestEffortSignInMetadata?.maxTouchPoints ?? null,
              touchCapable: targetUser.clientBestEffortSignInMetadata?.touchCapable ?? null,
              deviceMemoryGb: targetUser.clientBestEffortSignInMetadata?.deviceMemoryGb ?? null,
              hardwareConcurrency: targetUser.clientBestEffortSignInMetadata?.hardwareConcurrency ?? null,
            })}
          />
          <DetailCard
            label="Client Network Hints"
            value={formatClientNetworkHints(targetUser.clientBestEffortSignInMetadata?.network)}
          />
          <DetailCard
            label="Approx Device Label (Best-effort)"
            value={targetUser.deviceLabel || "Unavailable"}
          />
          <DetailCard
            label="Approx Device Label Source"
            value={targetUser.deviceLabelSource || "Unavailable"}
          />
          <DetailCard
            label="Approx Device Label Confidence"
            value={formatDeviceLabelConfidence(targetUser.deviceLabelConfidence)}
          />
          <DetailCard label="Full Name" value={targetUser.fullName || "Not set"} />
          <DetailCard label="University Code" value={targetUser.universityCode || "Not set"} />
          <DetailCard label="Phone" value={targetUser.phoneNumber || "Not set"} />
          <DetailCard label="Nationality" value={targetUser.nationality || "Not set"} />
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
            label="Created"
            value={formatDateTime(dateFormatter, targetUser.createdAt)}
            icon={<Calendar className="h-4 w-4" />}
          />
          <DetailCard
            label="Last Updated"
            value={formatDateTime(dateFormatter, targetUser.updatedAt)}
            icon={<Calendar className="h-4 w-4" />}
          />
          <DetailCard
            label="Profile Completed"
            value={targetUser.profileCompleted ? "Yes" : "No"}
            badge={targetUser.profileCompleted ? "success" : "warning"}
          />
        </div>
      </section>

      {/* Credits / Usage Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Credits & Usage
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            label="Assessment Access"
            value={creditsAccount?.assessmentAccess ?? "unavailable"}
            badge={creditsAccount?.assessmentAccess === "enabled" ? "success" : "danger"}
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
      </section>

      {/* Admin Controls Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
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
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
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

        <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Database className="h-4 w-4" />
            Namespace Breakdown
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {storageNamespaceSummaries.map((summary) => (
              <div
                key={summary.namespace}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-3"
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
          {!storageAvailable && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Remote storage is not available in this runtime, so object counts and sizes are not loaded.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Active Retention Policies
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <DetailCard
              label="Uploads"
              value={retentionSummaries.uploads}
              subtitle="documents/* and uploads/temp/*"
            />
            <DetailCard
              label="Results"
              value={retentionSummaries.results}
              subtitle="assessment-results/*"
            />
            <DetailCard
              label="Exports"
              value={retentionSummaries.exports}
              subtitle="assessment-exports/*"
            />
          </div>
        </div>
      </section>

      {/* Activity Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">Content Timeline</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No content activity found for this user.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 px-3 py-2"
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

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 p-4">
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
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 px-3 py-2"
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
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Users List
        </a>
      </div>
    </div>
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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 px-4 py-3">
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
        className="w-full h-10 justify-center gap-2"
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
            ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            : ""
        }`}
      >
        {isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        {actionLabel}
      </Button>
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
          className="field-control h-10 w-full text-xs"
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="w-full h-10 justify-center gap-2"
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
          className="field-control h-10 w-full text-xs"
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="w-full h-10 justify-center gap-2"
        >
          <HardDrive className="h-4 w-4" />
          Delete All Files
        </Button>
      </div>
    </form>
  );
}