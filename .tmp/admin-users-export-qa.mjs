import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import ExcelJS from "exceljs";

const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

const EXPECTED_HEADERS = [
  "UID",
  "Email",
  "Display Name",
  "Full Name",
  "Role",
  "Status",
  "Profile Completed",
  "Profile Completed At",
  "University Code",
  "Phone Number",
  "Phone Verified At",
  "Phone Country ISO2",
  "Phone Country Calling Code",
  "Nationality",
  "Created At",
  "Updated At",
  "Auth Disabled",
  "Last Sign-In Time",
  "Provider Summary",
];

const OPTIONAL_FIELD_COLUMNS = new Set([
  "Display Name",
  "Full Name",
  "University Code",
  "Phone Number",
  "Phone Verified At",
  "Phone Country ISO2",
  "Phone Country Calling Code",
  "Nationality",
  "Last Sign-In Time",
  "Provider Summary",
]);

const FORBIDDEN_HEADER_TOKENS = [
  "token",
  "refresh",
  "password",
  "hash",
  "cookie",
  "private key",
  "secret",
  "salt",
  "custom claims",
];

function parseEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const output = {};
  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    output[key] = value;
  }

  return output;
}

function readEnv(envMap, key) {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }

  const fromFile = envMap[key];
  if (typeof fromFile === "string" && fromFile.trim().length > 0) {
    return fromFile.trim();
  }

  return "";
}

function getFirebaseAdminConfig(envMap) {
  const projectId =
    readEnv(envMap, "FIREBASE_PROJECT_ID")
    || readEnv(envMap, "FIREBASE_ADMIN_PROJECT_ID")
    || readEnv(envMap, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const clientEmail =
    readEnv(envMap, "FIREBASE_CLIENT_EMAIL")
    || readEnv(envMap, "FIREBASE_ADMIN_CLIENT_EMAIL");

  const privateKey = (
    readEnv(envMap, "FIREBASE_PRIVATE_KEY")
    || readEnv(envMap, "FIREBASE_ADMIN_PRIVATE_KEY")
  ).replace(/\\n/g, "\n");

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getAdminEmails(envMap) {
  const configured = readEnv(envMap, "ZOOTOPIA_ADMIN_EMAILS");
  if (!configured) {
    return [...DEFAULT_ADMIN_EMAILS];
  }

  const parsed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? [...new Set(parsed)] : [...DEFAULT_ADMIN_EMAILS];
}

async function selectVerifiedAdminUser(auth, candidateEmails) {
  for (const email of candidateEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      if (user.customClaims?.admin === true && user.disabled !== true) {
        return user;
      }
    } catch {
      // Continue scanning allowlisted candidates.
    }
  }

  return null;
}

async function selectVerifiedNonAdminUser(auth, adminEmailSet) {
  let nextPageToken = undefined;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      const normalizedEmail = String(user.email || "").trim().toLowerCase();
      if (!normalizedEmail || adminEmailSet.has(normalizedEmail)) {
        continue;
      }

      if (user.customClaims?.admin === true || user.disabled === true) {
        continue;
      }

      return user;
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return null;
}

async function exchangeCustomTokenForIdToken(apiKey, customToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.idToken !== "string") {
    throw new Error(`Unable to exchange custom token for ID token (${response.status}).`);
  }

  return payload.idToken;
}

function extractDownloadFileName(contentDisposition, fallback) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return fileNameMatch?.[1] ?? fallback;
}

function normalizeCellValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if ("result" in value) {
      return normalizeCellValue(value.result);
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((entry) => String(entry.text || "")).join("");
    }
  }

  return String(value).trim();
}

async function fetchWithSession(baseUrl, sessionCookie, pathName) {
  const headers = sessionCookie
    ? {
      cookie: `zc_session=${sessionCookie}; zc_theme=light; zc_locale=en`,
    }
    : undefined;

  return fetch(`${baseUrl}${pathName}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });
}

async function main() {
  const workspaceRoot = process.cwd();
  const envMap = parseEnvFile(path.join(workspaceRoot, ".env.local"));

  const apiKey = readEnv(envMap, "NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  }

  const adminConfig = getFirebaseAdminConfig(envMap);
  if (!adminConfig.projectId || !adminConfig.clientEmail || !adminConfig.privateKey) {
    throw new Error("Firebase Admin credentials are missing from local env.");
  }

  const baseUrl = process.env.ADMIN_EXPORT_QA_BASE_URL || "http://127.0.0.1:3025";
  const firebaseApp =
    getApps()[0]
    || initializeApp({
      credential: cert({
        projectId: adminConfig.projectId,
        clientEmail: adminConfig.clientEmail,
        privateKey: adminConfig.privateKey,
      }),
      projectId: adminConfig.projectId,
    });

  const auth = getAuth(firebaseApp);
  const adminEmails = getAdminEmails(envMap);
  const adminEmailSet = new Set(adminEmails.map((value) => value.toLowerCase()));

  const adminUser = await selectVerifiedAdminUser(auth, adminEmails);
  if (!adminUser?.email) {
    throw new Error("No allowlisted admin user with admin: true was found.");
  }

  const nonAdminUser = await selectVerifiedNonAdminUser(auth, adminEmailSet);
  if (!nonAdminUser?.email) {
    throw new Error("No non-admin active user was found for access-block verification.");
  }

  const adminCustomToken = await auth.createCustomToken(adminUser.uid, { admin: true });
  const adminIdToken = await exchangeCustomTokenForIdToken(apiKey, adminCustomToken);
  const adminSessionCookie = await auth.createSessionCookie(adminIdToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const nonAdminCustomToken = await auth.createCustomToken(nonAdminUser.uid);
  const nonAdminIdToken = await exchangeCustomTokenForIdToken(apiKey, nonAdminCustomToken);
  const nonAdminSessionCookie = await auth.createSessionCookie(nonAdminIdToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const unauthResponse = await fetchWithSession(baseUrl, null, "/api/admin/users/export");
  const nonAdminResponse = await fetchWithSession(
    baseUrl,
    nonAdminSessionCookie,
    "/api/admin/users/export",
  );
  const adminResponse = await fetchWithSession(
    baseUrl,
    adminSessionCookie,
    "/api/admin/users/export",
  );

  if (adminResponse.status !== 200) {
    const body = await adminResponse.text();
    throw new Error(`Admin export request failed (${adminResponse.status}): ${body}`);
  }

  const contentType = adminResponse.headers.get("content-type") || "";
  const contentDisposition = adminResponse.headers.get("content-disposition") || "";
  const fileName = extractDownloadFileName(
    contentDisposition,
    "zootopia-users-export.xlsx",
  );
  const fileNameMatchesPattern = /^zootopia-users-export-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.xlsx$/i.test(
    fileName,
  );

  const workbookBuffer = Buffer.from(await adminResponse.arrayBuffer());
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(
    workspaceRoot,
    "output",
    "playwright",
    "admin-users-export",
    runId,
  );
  fs.mkdirSync(outputDir, { recursive: true });
  const workbookPath = path.join(outputDir, fileName);
  fs.writeFileSync(workbookPath, workbookBuffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const usersWorksheet = workbook.getWorksheet("Users");
  if (!usersWorksheet) {
    throw new Error("Users worksheet is missing from workbook.");
  }

  const headerRow = usersWorksheet.getRow(1);
  const actualHeaders = EXPECTED_HEADERS.map((_, index) =>
    normalizeCellValue(headerRow.getCell(index + 1).value),
  );
  const headersMatch =
    actualHeaders.length === EXPECTED_HEADERS.length
    && actualHeaders.every((value, index) => value === EXPECTED_HEADERS[index]);

  const freezeHeaderEnabled = usersWorksheet.views.some(
    (view) => view.state === "frozen" && Number(view.ySplit || 0) >= 1,
  );
  const autoFilterEnabled = Boolean(usersWorksheet.autoFilter);
  const headerStyled =
    Boolean(headerRow.getCell(1).font?.bold)
    && Boolean(headerRow.getCell(1).fill)
    && Boolean(headerRow.getCell(1).alignment);
  const sensibleColumnWidths = EXPECTED_HEADERS.every((_, index) => {
    const width = usersWorksheet.getColumn(index + 1).width;
    return typeof width === "number" && width >= 10;
  });

  const columnIndexByHeader = new Map(
    EXPECTED_HEADERS.map((header, index) => [header, index + 1]),
  );
  const optionalColumnIndexes = [...OPTIONAL_FIELD_COLUMNS]
    .map((header) => columnIndexByHeader.get(header))
    .filter((value) => typeof value === "number");

  let blankOptionalCellCount = 0;
  let hasArabicContent = false;
  let hasEnglishContent = false;
  for (let rowNumber = 2; rowNumber <= usersWorksheet.rowCount; rowNumber += 1) {
    const row = usersWorksheet.getRow(rowNumber);

    for (const columnIndex of optionalColumnIndexes) {
      const value = normalizeCellValue(row.getCell(columnIndex).value);
      if (!value) {
        blankOptionalCellCount += 1;
      }
    }

    for (let columnIndex = 1; columnIndex <= EXPECTED_HEADERS.length; columnIndex += 1) {
      const value = normalizeCellValue(row.getCell(columnIndex).value);
      if (!hasArabicContent && /[\u0600-\u06FF]/.test(value)) {
        hasArabicContent = true;
      }
      if (!hasEnglishContent && /[A-Za-z]/.test(value)) {
        hasEnglishContent = true;
      }
      if (hasArabicContent && hasEnglishContent) {
        break;
      }
    }
  }

  const hasForbiddenHeaders = actualHeaders.some((header) => {
    const normalizedHeader = header.toLowerCase();
    return FORBIDDEN_HEADER_TOKENS.some((token) => normalizedHeader.includes(token));
  });

  const adminUsersPageResponse = await fetchWithSession(baseUrl, adminSessionCookie, "/admin/users");
  const adminUsersPageHtml = await adminUsersPageResponse.text();
  const exportButtonVisibleForAdmin = adminUsersPageHtml.includes(
    "Export All Users (.xlsx)",
  );

  const nonAdminUsersPageResponse = await fetchWithSession(
    baseUrl,
    nonAdminSessionCookie,
    "/admin/users",
  );
  const nonAdminUsersPageStatus = nonAdminUsersPageResponse.status;
  const nonAdminUsersPageLocation = nonAdminUsersPageResponse.headers.get("location") || "";
  const nonAdminUsersPageBlocked =
    nonAdminUsersPageStatus >= 300
    && nonAdminUsersPageStatus < 400
    && !nonAdminUsersPageLocation.includes("/admin/users");

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    selectedAdminEmail: adminUser.email,
    selectedNonAdminEmail: nonAdminUser.email,
    exportRoute: "/api/admin/users/export",
    results: {
      unauthBlocked: unauthResponse.status === 403,
      nonAdminBlocked: nonAdminResponse.status === 403,
      adminSuccess: adminResponse.status === 200,
      adminUsersPageExportButtonVisible: exportButtonVisibleForAdmin,
      nonAdminUsersPageBlocked,
      contentTypeMatches:
        contentType.includes(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      fileName,
      fileNameMatchesPattern,
      worksheetPresent: Boolean(usersWorksheet),
      headersMatch,
      freezeHeaderEnabled,
      autoFilterEnabled,
      headerStyled,
      sensibleColumnWidths,
      hasForbiddenHeaders,
      bilingualContentObserved: {
        hasArabicContent,
        hasEnglishContent,
      },
      blankOptionalCellCount,
    },
    diagnostics: {
      unauthStatus: unauthResponse.status,
      nonAdminStatus: nonAdminResponse.status,
      adminStatus: adminResponse.status,
      nonAdminUsersPageStatus,
      nonAdminUsersPageLocation,
      actualHeaders,
      rowCount: usersWorksheet.rowCount,
      savedWorkbookPath: workbookPath,
    },
  };

  const reportPath = path.join(outputDir, "admin-users-export-qa-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`QA output directory: ${outputDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Unauth blocked: ${report.results.unauthBlocked}`);
  console.log(`Non-admin blocked: ${report.results.nonAdminBlocked}`);
  console.log(`Admin success: ${report.results.adminSuccess}`);
  console.log(`Headers match: ${report.results.headersMatch}`);
  console.log(`Freeze header enabled: ${report.results.freezeHeaderEnabled}`);
  console.log(`Autofilter enabled: ${report.results.autoFilterEnabled}`);
  console.log(`Sensible column widths: ${report.results.sensibleColumnWidths}`);
  console.log(`No forbidden headers: ${!report.results.hasForbiddenHeaders}`);
  console.log(
    `Bilingual content observed (AR/EN): ${report.results.bilingualContentObserved.hasArabicContent}/${report.results.bilingualContentObserved.hasEnglishContent}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
