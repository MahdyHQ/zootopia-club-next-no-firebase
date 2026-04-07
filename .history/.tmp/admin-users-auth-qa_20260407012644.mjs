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

const VIEWPORTS = [
  { name: "small-mobile", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
  { name: "ultrawide", width: 2560, height: 1440 },
];

const THEMES = ["light", "dark"];

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

function collectLayoutMetrics() {
  const doc = document.documentElement;
  const body = document.body;
  const docScrollWidth = doc?.scrollWidth ?? 0;
  const bodyScrollWidth = body?.scrollWidth ?? 0;
  const maxScrollWidth = Math.max(docScrollWidth, bodyScrollWidth);
  const horizontalOverflow = maxScrollWidth > window.innerWidth + 1;

  const overflowingNodes = Array.from(document.querySelectorAll("body *"))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > window.innerWidth + 1 || rect.left < -1;
    })
    .slice(0, 12)
    .map((node) => ({
      tag: node.tagName.toLowerCase(),
      className: node.className,
      text: node.textContent?.trim().slice(0, 80) ?? "",
    }));

  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    maxScrollWidth,
    scrollHeight: Math.max(doc?.scrollHeight ?? 0, body?.scrollHeight ?? 0),
    horizontalOverflow,
    overflowingNodes,
  };
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

  const baseUrl = process.env.ADMIN_QA_BASE_URL || "http://127.0.0.1:3020";
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

  // Safety: only proceed with a real allowlisted account that already has admin: true.
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
  const outputDir = path.join(
    workspaceRoot,
    "output",
    "playwright",
    "admin-users-auth",
    runId,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const combinations = [];

  try {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage();

        try {
          await page.setViewport({ width: viewport.width, height: viewport.height });
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
              value: theme,
              url: baseUrl,
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
            },
          );

          const targetUrl = `${baseUrl}/admin/users`;
          await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 90000 });

          const finalUrl = page.url();
          const screenshotFileName = `admin-users-${theme}-${viewport.name}.png`;
          const screenshotPath = path.join(outputDir, screenshotFileName);

          await page.screenshot({ path: screenshotPath, fullPage: true });

          const metrics = await page.evaluate(collectLayoutMetrics);

          combinations.push({
            route: "/admin/users",
            theme,
            viewport,
            finalUrl,
            isAuthenticatedAdminView: finalUrl.includes("/admin/users"),
            screenshotPath,
            ...metrics,
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    selectedAdminEmail: selectedAdmin.email,
    runId,
    totalCombinations: combinations.length,
    combinations,
  };

  const reportPath = path.join(outputDir, "admin-users-auth-qa-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const authFailures = combinations.filter((entry) => !entry.isAuthenticatedAdminView);
  const overflowFailures = combinations.filter((entry) => entry.horizontalOverflow);

  console.log(`QA output directory: ${outputDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Total combinations: ${combinations.length}`);
  console.log(`Auth failures: ${authFailures.length}`);
  console.log(`Horizontal overflow failures: ${overflowFailures.length}`);

  if (authFailures.length > 0) {
    for (const failure of authFailures) {
      console.log(
        `[AUTH] ${failure.theme} ${failure.viewport.name} -> ${failure.finalUrl}`,
      );
    }
  }

  if (overflowFailures.length > 0) {
    for (const failure of overflowFailures) {
      console.log(
        `[OVERFLOW] ${failure.theme} ${failure.viewport.name} width=${failure.maxScrollWidth} viewport=${failure.innerWidth}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
