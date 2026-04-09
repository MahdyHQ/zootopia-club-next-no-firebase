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

async function selectVerifiedNonAdminUser(auth, adminEmailSet) {
  let nextPageToken = undefined;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      const email = String(user.email || "").trim().toLowerCase();
      if (!email || adminEmailSet.has(email)) {
        continue;
      }
      if (user.disabled || user.customClaims?.admin === true) {
        continue;
      }

      return user;
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return null;
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

  const browserExecutablePath = getBrowserExecutablePath();
  if (!browserExecutablePath) {
    throw new Error("Chrome/Edge executable not found.");
  }

  const baseUrl = process.env.SETTINGS_PHONE_QA_BASE_URL || "http://127.0.0.1:3025";

  const firebaseApp =
    getApps()[0] ||
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
  const adminEmailSet = new Set(adminEmails.map((email) => email.toLowerCase()));
  const user = await selectVerifiedNonAdminUser(auth, adminEmailSet);

  if (!user?.email) {
    throw new Error("No active non-admin user found for settings QA.");
  }

  const customToken = await auth.createCustomToken(user.uid);
  const idToken = await exchangeCustomTokenForIdToken(apiKey, customToken);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const errors = [];
  const consoleErrors = [];
  let maxDepthError = false;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setCookie(
      {
        name: "zc_session",
        value: sessionCookie,
        url: baseUrl,
        httpOnly: true,
      },
      {
        name: "zc_theme",
        value: "light",
        url: baseUrl,
      },
      {
        name: "zc_locale",
        value: "en",
        url: baseUrl,
      },
    );

    page.on("pageerror", (error) => {
      const message = String(error?.message || error);
      errors.push(message);
      if (message.toLowerCase().includes("maximum update depth exceeded")) {
        maxDepthError = true;
      }
    });

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }
      const text = message.text();
      consoleErrors.push(text);
      if (text.toLowerCase().includes("maximum update depth exceeded")) {
        maxDepthError = true;
      }
    });

    await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle2" });

    await page.waitForSelector(".settings-phone-combo input", { timeout: 15000 });
    const input = await page.$(".settings-phone-combo input");
    if (!input) {
      throw new Error("Phone input not found.");
    }

    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await input.type("1012345678", { delay: 30 });

    await new Promise((resolve) => {
      setTimeout(resolve, 1800);
    });

    const typedValue = await page.$eval(
      ".settings-phone-combo input",
      (el) => el.value,
    );

    const sendButtonEnabled = await page.$eval(
      "button.action-button",
      (el) => !el.disabled,
    );

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(
      workspaceRoot,
      "output",
      "playwright",
      "settings-phone-loop",
      runId,
    );
    fs.mkdirSync(outputDir, { recursive: true });

    await page.screenshot({
      path: path.join(outputDir, "settings-phone-loop.png"),
      fullPage: true,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      selectedUserEmail: user.email,
      route: "/settings",
      typedValue,
      sendButtonEnabled,
      maxDepthError,
      pageErrors: errors,
      consoleErrors,
    };

    fs.writeFileSync(
      path.join(outputDir, "settings-phone-loop-report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log(`QA output directory: ${outputDir}`);
    console.log(`MAX_DEPTH_ERROR=${maxDepthError}`);
    console.log(`TYPED_VALUE=${typedValue}`);
    console.log(`SEND_BUTTON_ENABLED=${sendButtonEnabled}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
