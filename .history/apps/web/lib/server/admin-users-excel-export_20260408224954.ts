import "server-only";

import type { UserDocument } from "@zootopia/shared-types";
import type { UserInfo } from "firebase-admin/auth";
import ExcelJS from "exceljs";

import {
  getFirebaseAdminAuth,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";

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
  profileCompleted: string;
  profileCompletedAt: string;
  universityCode: string;
  phoneNumber: string;
  phoneVerifiedAt: string;
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
  { header: "Profile Completed", key: "profileCompleted", width: 18 },
  { header: "Profile Completed At", key: "profileCompletedAt", width: 24 },
  { header: "University Code", key: "universityCode", width: 18 },
  { header: "Phone Number", key: "phoneNumber", width: 20 },
  { header: "Phone Verified At", key: "phoneVerifiedAt", width: 24 },
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

function formatRole(role: UserDocument["role"]) {
  return role === "admin" ? "Admin" : "User";
}

function formatStatus(status: UserDocument["status"]) {
  return status === "active" ? "Active" : "Suspended";
}

function summarizeProviders(providerData: UserInfo[]) {
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
  if (!hasFirebaseAdminRuntime()) {
    return metadataByUid;
  }

  const auth = getFirebaseAdminAuth();
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
}): AdminUsersExportRow {
  const { user, authMetadata } = input;

  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    fullName: user.fullName ?? "",
    role: formatRole(user.role),
    status: formatStatus(user.status),
    profileCompleted: formatYesNo(user.profileCompleted),
    profileCompletedAt: formatExportTimestamp(user.profileCompletedAt),
    universityCode: user.universityCode ?? "",
    phoneNumber: user.phoneNumber ?? "",
    phoneVerifiedAt: formatExportTimestamp(user.phoneVerifiedAt),
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
  return Buffer.from(workbookBuffer as Buffer | Uint8Array | ArrayBuffer);
}

export function buildAdminUsersExportFileName(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = padTwoDigits(now.getUTCMonth() + 1);
  const day = padTwoDigits(now.getUTCDate());
  const hour = padTwoDigits(now.getUTCHours());
  const minute = padTwoDigits(now.getUTCMinutes());

  return `zootopia-users-export-${year}-${month}-${day}-${hour}-${minute}.xlsx`;
}
