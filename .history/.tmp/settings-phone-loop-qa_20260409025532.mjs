import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
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

const FIRESTORE_DATABASE_ID = "zootopia-club-next-database";

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

async function selectVerifiedPhoneUser(firestore, adminEmailSet) {
  const snapshot = await firestore.collection("users").get();
  const candidates = snapshot.docs
    .map((doc) => doc.data())
    .filter((doc) => {
      const email = String(doc.email || "").trim().toLowerCase();
      return (
        String(doc.role || "") === "user" &&
        String(doc.status || "") === "active" &&
        Boolean(doc.phoneNumber) &&
        Boolean(doc.phoneVerifiedAt) &&
        Boolean(email) &&
        !adminEmailSet.has(email)
      );
    });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}

async function selectActiveNonAdminFirestoreUser(firestore, adminEmailSet) {
  const snapshot = await firestore.collection("users").get();
  const candidates = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: String(data.email || "").trim().toLowerCase(),
        role: String(data.role || ""),
        status: String(data.status || ""),
      };
    })
    .filter((doc) => {
      return (
        doc.role === "user" &&
        doc.status === "active" &&
        Boolean(doc.email) &&
        !adminEmailSet.has(doc.email)
      );
    });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
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
  const firestore = getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);
  const adminEmails = getAdminEmails(envMap);
  const adminEmailSet = new Set(adminEmails.map((email) => email.toLowerCase()));
  const verifiedPhoneUser = await selectVerifiedPhoneUser(firestore, adminEmailSet);
  const activeFirestoreUser = verifiedPhoneUser
    ? null
    : await selectActiveNonAdminFirestoreUser(firestore, adminEmailSet);

  const selectedFirestoreUid = verifiedPhoneUser?.uid || activeFirestoreUser?.uid || null;

  const user = selectedFirestoreUid
    ? await auth.getUser(selectedFirestoreUid)
    : await selectVerifiedNonAdminUser(auth, adminEmailSet);

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

    await page.goto(`${baseUrl}/settings`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("body", { timeout: 15000 });
    await page
      .waitForFunction(
        () => Boolean(document.querySelector(".settings-phone-combo input")),
        { timeout: 60000 },
      )
      .catch(() => undefined);

    const currentUrl = page.url();
    const input = await page.$(".settings-phone-combo input");
    if (!input) {
      const bodyText = await page.$eval("body", (el) =>
        (el.textContent || "").slice(0, 500),
      );
      throw new Error(
        `Phone input not found (url=${currentUrl}). Page snippet: ${bodyText}`,
      );
    }

    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");

    const typingTrace = [];
    for (const digit of "1012345678") {
      await page.keyboard.type(digit, { delay: 25 });
      await new Promise((resolve) => {
        setTimeout(resolve, 80);
      });
      const currentValue = await page.$eval(
        ".settings-phone-combo input",
        (el) => el.value,
      );
      typingTrace.push(currentValue);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1800);
    });

    const typedValue = await page.$eval(
      ".settings-phone-combo input",
      (el) => el.value,
    );

    const sendButtonEnabled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const sendButton = buttons.find((button) => {
        const label = (button.textContent || "").toLowerCase();
        return label.includes("send otp") || label.includes("resend otp");
      });

      return sendButton ? !sendButton.disabled : false;
    });

    const sendAttempt = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const sendButton = buttons.find((button) => {
        const label = (button.textContent || "").toLowerCase();
        return label.includes("send otp") || label.includes("resend otp");
      });

      if (!sendButton) {
        return {
          found: false,
          clicked: false,
          label: "",
        };
      }

      if (sendButton.disabled) {
        return {
          found: true,
          clicked: false,
          label: (sendButton.textContent || "").trim(),
        };
      }

      sendButton.click();
      return {
        found: true,
        clicked: true,
        label: (sendButton.textContent || "").trim(),
      };
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });

    const otpInputVisibleAfterSend =
      (await page.$("#settings-phone-otp-code")) !== null;
    const otpInputUsableAfterSend = otpInputVisibleAfterSend
      ? await page.$eval("#settings-phone-otp-code", (el) => {
          const input = el;
          return !input.disabled && input.getAttribute("inputmode") === "numeric";
        })
      : false;

    const postSendStatusLines = await page.$$eval("p", (elements) =>
      elements
        .map((element) => (element.textContent || "").trim())
        .filter((value) => {
          if (!value) {
            return false;
          }

          const normalized = value.toLowerCase();
          return (
            normalized.includes("otp") ||
            normalized.includes("verification") ||
            normalized.includes("phone")
          );
        })
        .slice(0, 12),
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
      selectedUserUid: user.uid,
      usedVerifiedPhoneSeedUser: Boolean(verifiedPhoneUser),
      route: "/settings",
      typedValue,
      typingTrace,
      sendButtonEnabled,
      sendAttempt,
      otpInputVisibleAfterSend,
      otpInputUsableAfterSend,
      postSendStatusLines,
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
    console.log(`SEND_BUTTON_FOUND=${sendAttempt.found}`);
    console.log(`SEND_BUTTON_CLICKED=${sendAttempt.clicked}`);
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
