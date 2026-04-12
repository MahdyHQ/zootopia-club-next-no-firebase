import "server-only";

import type { AdminAssessmentCreditState, UserDocument } from "@zootopia/shared-types";
import ExcelJS from "exceljs";

import type { AuthUserInfo } from "@/lib/server/auth-types";
import { getServerAuthAdmin } from "@/lib/server/server-auth";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

type AdminUserAuthExportMetadata = {
  authDisabled: boolean | null;
  lastSignInTime: string | null;
  providerSummary: string | null;
};

type AdminUsersExportRow = {
  uid: string;
  email: string;
  displayName: string;
  fullName: string;
  role: string;
  status: string;
  metadataAuthority: string;
  serverObservedAt: string;
  serverObservedPublicIp: string;
  serverObservedForwardedIpChain: string;
  serverObservedGeo: string;
  serverObservedAcceptLanguage: string;
  clientCapturedAt: string;
  clientBrowserOsPlatform: string;
  clientUserAgentDataHints: string;
  clientScreenViewport: string;
  clientTimezoneLanguage: string;
  clientTouchHardware: string;
  clientNetworkHints: string;
  deviceLabel: string;
  deviceLabelSource: string;
  deviceLabelConfidence: string;
  assessmentAccess: string;
  assessmentDailyLimit: string;
  assessmentUsedToday: string;
  assessmentDailyRemaining: string;
  assessmentManualCredits: string;
  assessmentGrantCredits: string;
  assessmentExtraCreditsAvailable: string;
  assessmentTotalRemaining: string;
  profileCompleted: string;
  profileCompletedAt: string;
  universityCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
  phoneCountryCallingCode: string;
  nationality: string;
  createdAt: string;
  updatedAt: string;
  authDisabled: string;
  lastSignInTime: string;
  providerSummary: string;
};

const USERS_WORKSHEET_NAME = "Users";
const USERS_EXPORT_COLUMN_DEFINITIONS: Array<{
  header: string;
  key: keyof AdminUsersExportRow;
  width: number;
}> = [
  { header: "UID", key: "uid", width: 34 },
  { header: "Email", key: "email", width: 34 },
  { header: "Display Name", key: "displayName", width: 24 },
  { header: "Full Name", key: "fullName", width: 30 },
  { header: "Role", key: "role", width: 12 },
  { header: "Status", key: "status", width: 14 },
  {
    header: "Metadata Authority",
    key: "metadataAuthority",
    width: 36,
  },
  { header: "Server Observed At", key: "serverObservedAt", width: 24 },
  { header: "Server Public IP", key: "serverObservedPublicIp", width: 24 },
  {
    header: "Server Forwarded IP Chain",
    key: "serverObservedForwardedIpChain",
    width: 40,
  },
  { header: "Server Geo (CDN/Edge)", key: "serverObservedGeo", width: 34 },
  {
    header: "Server Accept-Language",
    key: "serverObservedAcceptLanguage",
    width: 28,
  },
  { header: "Client Captured At", key: "clientCapturedAt", width: 24 },
  {
    header: "Client Browser/OS/Platform",
    key: "clientBrowserOsPlatform",
    width: 34,
  },
  {
    header: "Client UAData Hints",
    key: "clientUserAgentDataHints",
    width: 44,
  },
  {
    header: "Client Screen/Viewport",
    key: "clientScreenViewport",
    width: 34,
  },
  {
    header: "Client Timezone/Language",
    key: "clientTimezoneLanguage",
    width: 32,
  },
  {
    header: "Client Touch/Hardware",
    key: "clientTouchHardware",
    width: 34,
  },
  {
    header: "Client Network Hints",
    key: "clientNetworkHints",
    width: 30,
  },
  {
    header: "Approx Device Label (Best-effort)",
    key: "deviceLabel",
    width: 32,
  },
  {
    header: "Approx Device Label Source",
    key: "deviceLabelSource",
    width: 30,
  },
  {
    header: "Approx Device Label Confidence",
    key: "deviceLabelConfidence",
    width: 30,
  },
  { header: "Assessment Access", key: "assessmentAccess", width: 18 },
  { header: "Assessment Daily Limit", key: "assessmentDailyLimit", width: 20 },
  { header: "Assessment Used Today", key: "assessmentUsedToday", width: 20 },
  {
    header: "Assessment Daily Remaining",
    key: "assessmentDailyRemaining",
    width: 24,
  },
  {
    header: "Assessment Manual Credits",
    key: "assessmentManualCredits",
    width: 24,
  },
  {
    header: "Assessment Grant Credits",
    key: "assessmentGrantCredits",
    width: 22,
  },
  {
    header: "Assessment Extra Credits",
    key: "assessmentExtraCreditsAvailable",
    width: 22,
  },
  {
    header: "Assessment Total Remaining",
    key: "assessmentTotalRemaining",
    width: 24,
  },
  { header: "Profile Completed", key: "profileCompleted", width: 18 },
  { header: "Profile Completed At", key: "profileCompletedAt", width: 24 },
  { header: "University Code", key: "universityCode", width: 18 },
  { header: "Phone Number", key: "phoneNumber", width: 20 },
  { header: "Phone Country ISO2", key: "phoneCountryIso2", width: 18 },
  {
    header: "Phone Country Calling Code",
    key: "phoneCountryCallingCode",
    width: 28,
  },
  { header: "Nationality", key: "nationality", width: 18 },
  { header: "Created At", key: "createdAt", width: 24 },
  { header: "Updated At", key: "updatedAt", width: 24 },
  { header: "Auth Disabled", key: "authDisabled", width: 16 },
  { header: "Last Sign-In Time", key: "lastSignInTime", width: 24 },
  { header: "Provider Summary", key: "providerSummary", width: 28 },
];

const AUTH_PROVIDER_LABELS: Record<string, string> = {
  "google.com": "Google",
  password: "Email/Password",
  phone: "Phone",
  "apple.com": "Apple",
  "github.com": "GitHub",
  "facebook.com": "Facebook",
  "twitter.com": "Twitter/X",
  "microsoft.com": "Microsoft",
  "yahoo.com": "Yahoo",
};
const DEVICE_METADATA_UNAVAILABLE = "Unavailable";
const NON_AUTHORITATIVE_METADATA_NOTE = "Best-effort/non-authoritative (observability only)";

function padTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function formatExportTimestamp(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "";
  }

  const date = new Date(parsed);
  return `${date.getUTCFullYear()}-${padTwoDigits(date.getUTCMonth() + 1)}-${padTwoDigits(
    date.getUTCDate(),
  )} ${padTwoDigits(date.getUTCHours())}:${padTwoDigits(
    date.getUTCMinutes(),
  )}:${padTwoDigits(date.getUTCSeconds())} UTC`;
}

function formatYesNo(value: boolean | null | undefined) {
  if (typeof value !== "boolean") {
    return "";
  }

  return value ? "Yes" : "No";
}

function formatOptionalWholeNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return String(Math.trunc(value));
}

function formatDeviceConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const normalized = Math.min(1, Math.max(0, value));
  return `${Math.round(normalized * 100)}%`;
}

function formatStringArray(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  return values.join(" | ");
}

function formatServerObservedGeo(user: UserDocument) {
  const geo = user.serverObservedSignInMetadata?.requestGeo;
  if (!geo) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [
    geo.source ? `source=${geo.source}` : null,
    geo.countryCode ? `country=${geo.countryCode}` : null,
    geo.region ? `region=${geo.region}` : null,
    geo.city ? `city=${geo.city}` : null,
    typeof geo.latitude === "number" ? `lat=${geo.latitude}` : null,
    typeof geo.longitude === "number" ? `lon=${geo.longitude}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatClientBrowserOsPlatform(user: UserDocument) {
  const metadata = user.clientBestEffortSignInMetadata;
  if (!metadata) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [metadata.browser, metadata.operatingSystem, metadata.platform]
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join(" / ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatClientUaDataHints(user: UserDocument) {
  const uaData = user.clientBestEffortSignInMetadata?.userAgentData;
  if (!uaData) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [
    uaData.platform ? `platform=${uaData.platform}` : null,
    typeof uaData.mobile === "boolean" ? `mobile=${uaData.mobile ? "yes" : "no"}` : null,
    uaData.brands ? `brands=${uaData.brands.join(", ")}` : null,
    uaData.architecture ? `arch=${uaData.architecture}` : null,
    uaData.bitness ? `bitness=${uaData.bitness}` : null,
    uaData.model ? `model=${uaData.model}` : null,
    uaData.platformVersion ? `platformVersion=${uaData.platformVersion}` : null,
    uaData.uaFullVersion ? `uaFullVersion=${uaData.uaFullVersion}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatClientScreenViewport(user: UserDocument) {
  const metadata = user.clientBestEffortSignInMetadata;
  if (!metadata) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const screen = metadata.screen;
  const viewport = metadata.viewport;

  const screenValue = screen
    ? [
      typeof screen.width === "number" ? screen.width : "?",
      typeof screen.height === "number" ? screen.height : "?",
    ].join("x")
    : null;
  const viewportValue = viewport
    ? [
      typeof viewport.width === "number" ? viewport.width : "?",
      typeof viewport.height === "number" ? viewport.height : "?",
    ].join("x")
    : null;

  if (!screenValue && !viewportValue) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  return `screen=${screenValue ?? "?"}; viewport=${viewportValue ?? "?"}`;
}

function formatClientTimezoneLanguage(user: UserDocument) {
  const metadata = user.clientBestEffortSignInMetadata;
  if (!metadata) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [
    metadata.timezone ? `tz=${metadata.timezone}` : null,
    metadata.language ? `lang=${metadata.language}` : null,
    metadata.languages ? `langs=${metadata.languages.join(",")}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatClientTouchHardware(user: UserDocument) {
  const metadata = user.clientBestEffortSignInMetadata;
  if (!metadata) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [
    typeof metadata.maxTouchPoints === "number" ? `maxTouchPoints=${metadata.maxTouchPoints}` : null,
    typeof metadata.touchCapable === "boolean" ? `touchCapable=${metadata.touchCapable ? "yes" : "no"}` : null,
    typeof metadata.deviceMemoryGb === "number" ? `deviceMemoryGb=${metadata.deviceMemoryGb}` : null,
    typeof metadata.hardwareConcurrency === "number" ? `hardwareConcurrency=${metadata.hardwareConcurrency}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatClientNetworkHints(user: UserDocument) {
  const network = user.clientBestEffortSignInMetadata?.network;
  if (!network) {
    return DEVICE_METADATA_UNAVAILABLE;
  }

  const parts = [
    network.effectiveType ? `effectiveType=${network.effectiveType}` : null,
    typeof network.downlinkMbps === "number" ? `downlinkMbps=${network.downlinkMbps}` : null,
    typeof network.rttMs === "number" ? `rttMs=${network.rttMs}` : null,
    typeof network.saveData === "boolean" ? `saveData=${network.saveData ? "yes" : "no"}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join("; ") : DEVICE_METADATA_UNAVAILABLE;
}

function formatRole(role: UserDocument["role"]) {
  return role === "admin" ? "Admin" : "User";
}

function formatStatus(status: UserDocument["status"]) {
  return status === "active" ? "Active" : "Suspended";
}

function summarizeProviders(providerData: AuthUserInfo[]) {
  const labels = providerData
    .map((provider) => AUTH_PROVIDER_LABELS[provider.providerId] ?? provider.providerId)
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return null;
  }

  return [...new Set(labels)].join(", ");
}

function normalizeAuthTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export async function listAdminUserAuthMetadataByUid() {
  const metadataByUid = new Map<string, AdminUserAuthExportMetadata>();
  if (!hasSupabaseAdminRuntime()) {
    return metadataByUid;
  }

  const auth = getServerAuthAdmin();
  let nextPageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const authUser of page.users) {
      metadataByUid.set(authUser.uid, {
        authDisabled: authUser.disabled,
        lastSignInTime: normalizeAuthTimestamp(authUser.metadata.lastSignInTime),
        providerSummary: summarizeProviders(authUser.providerData),
      });
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return metadataByUid;
}

function applyWorksheetHeaderStyle(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      name: "Calibri",
      size: 11,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF115E59" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
}

function applyWorksheetBodyStyle(worksheet: ExcelJS.Worksheet) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });

    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }
  });
}

function mapUserToExportRow(input: {
  user: UserDocument;
  authMetadata: AdminUserAuthExportMetadata | undefined;
  creditState: AdminAssessmentCreditState | undefined;
}): AdminUsersExportRow {
  const { user, authMetadata, creditState } = input;
  const assessmentAccess =
    creditState?.account.assessmentAccess === "enabled"
      ? "Enabled"
      : creditState?.account.assessmentAccess === "disabled"
        ? "Disabled"
        : "";

  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    fullName: user.fullName ?? "",
    role: formatRole(user.role),
    status: formatStatus(user.status),
    metadataAuthority: NON_AUTHORITATIVE_METADATA_NOTE,
    serverObservedAt: formatExportTimestamp(user.serverObservedSignInMetadata?.observedAt ?? null),
    serverObservedPublicIp:
      user.serverObservedSignInMetadata?.publicIp ?? DEVICE_METADATA_UNAVAILABLE,
    serverObservedForwardedIpChain: formatStringArray(
      user.serverObservedSignInMetadata?.forwardedIpChain,
    ),
    serverObservedGeo: formatServerObservedGeo(user),
    serverObservedAcceptLanguage:
      user.serverObservedSignInMetadata?.acceptLanguage ?? DEVICE_METADATA_UNAVAILABLE,
    clientCapturedAt: formatExportTimestamp(user.clientBestEffortSignInMetadata?.capturedAt ?? null),
    clientBrowserOsPlatform: formatClientBrowserOsPlatform(user),
    clientUserAgentDataHints: formatClientUaDataHints(user),
    clientScreenViewport: formatClientScreenViewport(user),
    clientTimezoneLanguage: formatClientTimezoneLanguage(user),
    clientTouchHardware: formatClientTouchHardware(user),
    clientNetworkHints: formatClientNetworkHints(user),
    deviceLabel: user.deviceLabel ?? DEVICE_METADATA_UNAVAILABLE,
    deviceLabelSource: user.deviceLabelSource ?? DEVICE_METADATA_UNAVAILABLE,
    deviceLabelConfidence: formatDeviceConfidence(user.deviceLabelConfidence),
    assessmentAccess,
    assessmentDailyLimit: formatOptionalWholeNumber(creditState?.credits.dailyLimit),
    assessmentUsedToday: formatOptionalWholeNumber(creditState?.credits.usedCount),
    assessmentDailyRemaining: formatOptionalWholeNumber(creditState?.credits.dailyRemainingCount),
    assessmentManualCredits: formatOptionalWholeNumber(creditState?.account.manualCredits),
    assessmentGrantCredits: formatOptionalWholeNumber(creditState?.credits.grantCreditsAvailable),
    assessmentExtraCreditsAvailable: formatOptionalWholeNumber(
      creditState?.credits.extraCreditsAvailable,
    ),
    assessmentTotalRemaining: formatOptionalWholeNumber(creditState?.credits.remainingCount),
    profileCompleted: formatYesNo(user.profileCompleted),
    profileCompletedAt: formatExportTimestamp(user.profileCompletedAt),
    universityCode: user.universityCode ?? "",
    phoneNumber: user.phoneNumber ?? "",
    phoneCountryIso2: user.phoneCountryIso2 ?? "",
    phoneCountryCallingCode: user.phoneCountryCallingCode ?? "",
    nationality: user.nationality ?? "",
    createdAt: formatExportTimestamp(user.createdAt),
    updatedAt: formatExportTimestamp(user.updatedAt),
    authDisabled: formatYesNo(authMetadata?.authDisabled),
    lastSignInTime: formatExportTimestamp(authMetadata?.lastSignInTime ?? null),
    providerSummary: authMetadata?.providerSummary ?? "",
  };
}

export async function buildAdminUsersWorkbookBuffer(input: {
  users: UserDocument[];
  authMetadataByUid: Map<string, AdminUserAuthExportMetadata>;
  creditStateByUid: Map<string, AdminAssessmentCreditState>;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zootopia Club";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(USERS_WORKSHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });

  worksheet.columns = USERS_EXPORT_COLUMN_DEFINITIONS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  applyWorksheetHeaderStyle(worksheet);

  /* Export only user metadata that already exists in the real admin aggregation path plus
     narrow auth-account indicators (disabled/last sign-in/providers). Keep secrets and token
     material out of this workbook by design. */
  for (const user of input.users) {
    worksheet.addRow(
      mapUserToExportRow({
        user,
        authMetadata: input.authMetadataByUid.get(user.uid),
        creditState: input.creditStateByUid.get(user.uid),
      }),
    );
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: {
      row: 1,
      column: USERS_EXPORT_COLUMN_DEFINITIONS.length,
    },
  };

  applyWorksheetBodyStyle(worksheet);

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  if (workbookBuffer instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(workbookBuffer));
  }

  return Buffer.from(workbookBuffer as Buffer | Uint8Array);
}

export function buildAdminUsersExportFileName(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = padTwoDigits(now.getUTCMonth() + 1);
  const day = padTwoDigits(now.getUTCDate());
  const hour = padTwoDigits(now.getUTCHours());
  const minute = padTwoDigits(now.getUTCMinutes());

  return `zootopia-users-export-${year}-${month}-${day}-${hour}-${minute}.xlsx`;
}
