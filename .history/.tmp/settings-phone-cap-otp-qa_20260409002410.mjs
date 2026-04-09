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

const SETTINGS_PHONE_MAX_DIGITS = 18;

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

async function selectVerifiedAdminUser(auth, candidateEmails) {
  for (const email of candidateEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      if (user.customClaims?.admin === true && user.disabled !== true) {
        return user;
      }
    } catch {
      // Continue scanning candidates.
    }
  }

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
  const adminUser = await selectVerifiedAdminUser(auth, getAdminEmails(envMap));
  if (!adminUser?.email) {
    throw new Error("No active admin user found for settings phone QA.");
  }

  const customToken = await auth.createCustomToken(adminUser.uid, { admin: true });
  const idToken = await exchangeCustomTokenForIdToken(apiKey, customToken);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const baseUrl = process.env.SETTINGS_PHONE_QA_BASE_URL || "http://127.0.0.1:3025";

  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const pageErrors = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      cookie: `zc_session=${sessionCookie}; zc_theme=light; zc_locale=en`,
    });

    page.on("pageerror", (error) => {
      pageErrors.push(String(error?.message || error));
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle2" });
    try {
      await page.waitForFunction(
        () => Boolean(document.querySelector(".settings-phone-combo input")),
        { timeout: 60000 },
      );
    } catch {
      const debugState = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        hasPhoneCombo: Boolean(document.querySelector(".settings-phone-combo input")),
        inputCount: document.querySelectorAll("input").length,
        bodyText: (document.body?.textContent || "").slice(0, 600),
      }));

      throw new Error(
        `Phone selector not found. url=${debugState.url}; title=${debugState.title}; inputCount=${debugState.inputCount}; pageErrors=${JSON.stringify(pageErrors.slice(0, 3))}; consoleErrors=${JSON.stringify(consoleErrors.slice(0, 3))}; bodyText=${debugState.bodyText}`,
      );
    }

    const countryCallingCodeDigits = await page.$eval(
      ".settings-phone-combo span",
      (el) => (el.textContent || "").replace(/\D/g, "").length,
    );

    const input = await page.$(".settings-phone-combo input");
    if (!input) {
      throw new Error("Settings phone input was not found.");
    }

    const inputMaxLength = await page.$eval(
      ".settings-phone-combo input",
      (el) => Number(el.maxLength || -1),
    );

    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type("123456789012345678901234567890", { delay: 15 });

    const typedValue = await page.$eval(".settings-phone-combo input", (el) => el.value);
    const typedDigits = typedValue.replace(/\D/g, "").length;
    const expectedMaxNationalDigits = Math.max(
      1,
      SETTINGS_PHONE_MAX_DIGITS - countryCallingCodeDigits,
    );
    const capPass = typedDigits <= expectedMaxNationalDigits;
    const maxLengthPass = inputMaxLength === expectedMaxNationalDigits;

    const sendAttempt = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const sendButton = buttons.find((button) => {
        const label = (button.textContent || "").toLowerCase();
        return label.includes("send otp") || label.includes("resend otp");
      });

      if (!sendButton) {
        return {
          found: false,
          enabled: false,
          clicked: false,
        };
      }

      const enabled = !sendButton.disabled;
      if (enabled) {
        sendButton.click();
      }

      return {
        found: true,
        enabled,
        clicked: enabled,
      };
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });

    const otpInputVisibleAfterSend = (await page.$("#settings-phone-otp-code")) !== null;
    const otpInputUsableAfterSend = otpInputVisibleAfterSend
      ? await page.$eval("#settings-phone-otp-code", (el) => {
          const input = el;
          return !input.disabled && input.getAttribute("inputmode") === "numeric";
        })
      : false;

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(
      workspaceRoot,
      "output",
      "playwright",
      "settings-phone-cap-otp",
      runId,
    );
    fs.mkdirSync(outputDir, { recursive: true });

    await page.screenshot({
      path: path.join(outputDir, "settings-phone-cap-otp.png"),
      fullPage: true,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      selectedAdminEmail: adminUser.email,
      countryCallingCodeDigits,
      expectedMaxNationalDigits,
      typedValue,
      typedDigits,
      inputMaxLength,
      capPass,
      maxLengthPass,
      sendAttempt,
      otpInputVisibleAfterSend,
      otpInputUsableAfterSend,
      pageErrors,
      consoleErrors,
    };

    fs.writeFileSync(
      path.join(outputDir, "settings-phone-cap-otp-report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log(`QA output directory: ${outputDir}`);
    console.log(`COUNTRY_CALLING_CODE_DIGITS=${countryCallingCodeDigits}`);
    console.log(`EXPECTED_MAX_NATIONAL_DIGITS=${expectedMaxNationalDigits}`);
    console.log(`INPUT_MAX_LENGTH=${inputMaxLength}`);
    console.log(`TYPED_DIGITS=${typedDigits}`);
    console.log(`CAP_PASS=${capPass}`);
    console.log(`MAX_LENGTH_PASS=${maxLengthPass}`);
    console.log(`SEND_FOUND=${sendAttempt.found}`);
    console.log(`SEND_ENABLED=${sendAttempt.enabled}`);
    console.log(`SEND_CLICKED=${sendAttempt.clicked}`);
    console.log(`OTP_INPUT_VISIBLE_AFTER_SEND=${otpInputVisibleAfterSend}`);
    console.log(`OTP_INPUT_USABLE_AFTER_SEND=${otpInputUsableAfterSend}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
