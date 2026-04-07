import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import puppeteer from "puppeteer-core";

const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
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
    readEnv(envMap, "FIREBASE_PROJECT_ID") ||
    readEnv(envMap, "FIREBASE_ADMIN_PROJECT_ID") ||
    readEnv(envMap, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const clientEmail =
    readEnv(envMap, "FIREBASE_CLIENT_EMAIL") ||
    readEnv(envMap, "FIREBASE_ADMIN_CLIENT_EMAIL");

  const privateKey = (
    readEnv(envMap, "FIREBASE_PRIVATE_KEY") ||
    readEnv(envMap, "FIREBASE_ADMIN_PRIVATE_KEY")
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

function getBrowserExecutablePath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function selectVerifiedAdminUser(auth, candidateEmails) {
  for (const email of candidateEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      if (user.customClaims?.admin === true) {
        return user;
      }
    } catch {
      // Continue scanning allowlisted candidates.
    }
  }

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

async function waitForVisibleText(page, text, timeout = 30000) {
  await page.waitForFunction(
    (needle) => {
      return document.body?.innerText?.includes(needle) ?? false;
    },
    { timeout },
    text,
  );
}

async function main() {
  const workspaceRoot = process.cwd();
  const envMap = parseEnvFile(path.join(workspaceRoot, ".env.local"));

  const apiKey = readEnv(envMap, "NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  }

  const adminConfig = getFirebaseAdminConfig(envMap);
  if (!adminConfig.projectId) {
    throw new Error("FIREBASE_PROJECT_ID (or alias) is missing.");
  }

  if (!adminConfig.clientEmail || !adminConfig.privateKey) {
    throw new Error("Firebase Admin credentials are missing from local env.");
  }

  const baseUrl = process.env.UPLOAD_QA_BASE_URL || "http://127.0.0.1:3020";
  const browserExecutablePath = getBrowserExecutablePath();
  if (!browserExecutablePath) {
    throw new Error("No local Chrome/Edge executable was found.");
  }

  const firebaseApp =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: adminConfig.projectId,
        clientEmail: adminConfig.clientEmail,
        privateKey: adminConfig.privateKey,
      }),
      projectId: adminConfig.projectId,
    });

  const auth = getAuth(firebaseApp);
  const adminEmails = getAdminEmails(envMap);
  const selectedAdmin = await selectVerifiedAdminUser(auth, adminEmails);

  if (!selectedAdmin?.email) {
    throw new Error("No allowlisted admin user with admin: true was found.");
  }

  const customToken = await auth.createCustomToken(selectedAdmin.uid, { admin: true });
  const idToken = await exchangeCustomTokenForIdToken(apiKey, customToken);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(workspaceRoot, "output", "playwright", "upload-post-success", runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const uploadFilePath = path.join(outputDir, "qa-upload.txt");
  fs.writeFileSync(uploadFilePath, "upload post-success reset qa\n", "utf8");

  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    selectedAdminEmail: selectedAdmin.email,
    checks: {
      uploadApi201: false,
      noResetNullErrorMessage: false,
      recentUploadVisible: false,
      activeDocumentVisible: false,
      removeActiveWorks: false,
      browsePathExecuted: false,
      dragDropPathSupported: false,
      dragDropPathExecuted: false,
    },
    notes: [],
    screenshotPath: null,
  };

  try {
    const page = await browser.newPage();
    try {
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      await page.setViewport({ width: 1366, height: 900 });
      await page.setCookie(
        {
          name: "zc_session",
          value: sessionCookie,
          url: baseUrl,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
        {
          name: "zc_theme",
          value: "light",
          url: baseUrl,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      );

      await page.goto(`${baseUrl}/upload`, { waitUntil: "networkidle0", timeout: 90000 });

      const fileInput = await page.$("#file-upload");
      if (!fileInput) {
        throw new Error("Upload input #file-upload was not found.");
      }

      const uploadResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/uploads") && response.request().method() === "POST",
        { timeout: 90000 },
      );

      await fileInput.uploadFile(uploadFilePath);
      report.checks.browsePathExecuted = true;

      const uploadResponse = await uploadResponsePromise;
      report.checks.uploadApi201 = uploadResponse.status() === 201;
      report.notes.push(`POST /api/uploads status: ${uploadResponse.status()}`);

      await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });

      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      report.checks.noResetNullErrorMessage = !bodyText.includes("Cannot read properties of null (reading 'reset')");

      report.checks.recentUploadVisible = bodyText.includes("qa-upload.txt");

      const assessmentActionVisible = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        return links.some((link) => {
          const href = link.getAttribute("href") || "";
          return href.includes("/assessment");
        });
      });
      report.checks.activeDocumentVisible = assessmentActionVisible;

      const removeButton = await page.$("button svg.lucide-trash2");
      if (removeButton) {
        const button = await removeButton.evaluateHandle((node) => node.closest("button"));
        if (button) {
          await button.click();
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });
          report.checks.removeActiveWorks = true;
        }
      } else {
        report.notes.push("Remove active button was not found after upload.");
      }

      // Current upload UI has no explicit drag/drop handler implementation; keep this truthful.
      report.checks.dragDropPathSupported = false;
      report.checks.dragDropPathExecuted = false;
      report.notes.push("Drag/drop explicit handler not found in current upload workspace; browse path is the active supported flow.");

      const screenshotPath = path.join(outputDir, "upload-post-success.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      report.screenshotPath = screenshotPath;
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, "upload-post-success-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Upload QA output directory: ${outputDir}`);
  console.log(`Upload QA report: ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
