import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  ENV_LOCAL_PATH,
  loadEnvFileIntoProcess,
  readAdminIdentityConfig,
} from "./env-utils.mjs";

const EXPECTED_PROJECT_ID = "zootopia2026";
const DEFAULT_STORAGE_BUCKET = "zootopia2026.firebasestorage.app";

function printHelp() {
  console.log(`Set or rotate the shared Firebase Email/Password credential for the allowlisted admin accounts.

Usage:
  npm run firebase:admin:set-passwords -- --password='<secret>'
  ZOOTOPIA_ADMIN_PASSWORD='<secret>' npm run firebase:admin:set-passwords
  npm run firebase:admin:set-passwords -- --dry-run

Notes:
  - The password is never written to .env files or source files.
  - This shared-password workflow is weaker than unique passwords plus MFA.
  - Missing Firebase Auth users are reported; they are not auto-created.
  - Server env values are loaded from ${ENV_LOCAL_PATH} when present.
`);
}

function getEnvValue(primaryKey, fallbackKey) {
  return process.env[primaryKey] || (fallbackKey ? process.env[fallbackKey] : undefined);
}

function getConfiguredProjectId() {
  return (
    getEnvValue("FIREBASE_PROJECT_ID", "FIREBASE_ADMIN_PROJECT_ID") ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT
  );
}

function getConfiguredClientEmail() {
  return getEnvValue("FIREBASE_CLIENT_EMAIL", "FIREBASE_ADMIN_CLIENT_EMAIL");
}

function getConfiguredPrivateKey() {
  return getEnvValue("FIREBASE_PRIVATE_KEY", "FIREBASE_ADMIN_PRIVATE_KEY")?.replace(
    /\\n/g,
    "\n",
  );
}

function getAdminEmails(defaultAdminEmails) {
  const configured = process.env.ZOOTOPIA_ADMIN_EMAILS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : defaultAdminEmails;
}

function initializeAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = getConfiguredProjectId();
  if (!projectId) {
    throw new Error(
      `Missing Firebase Admin project configuration. Run the bootstrap command first or define server env vars in ${ENV_LOCAL_PATH}.`,
    );
  }

  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Refusing to target Firebase project ${projectId}. Expected ${EXPECTED_PROJECT_ID}.`,
    );
  }

  const clientEmail = getConfiguredClientEmail();
  const privateKey = getConfiguredPrivateKey();

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
      storageBucket: DEFAULT_STORAGE_BUCKET,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: DEFAULT_STORAGE_BUCKET,
  });
}

function parseCliArgs(argv) {
  let password = process.env.ZOOTOPIA_ADMIN_PASSWORD || "";
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--password") {
      password = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    }
  }

  return {
    dryRun,
    password: String(password || "").trim(),
  };
}

async function main() {
  await loadEnvFileIntoProcess();
  const adminIdentityConfig = await readAdminIdentityConfig();

  const { dryRun, password } = parseCliArgs(process.argv.slice(2));
  if (!dryRun && !password) {
    throw new Error(
      "Missing admin password. Pass --password='<secret>' or set ZOOTOPIA_ADMIN_PASSWORD for this command only.",
    );
  }

  if (!dryRun && password.length < 6) {
    throw new Error("Admin password must be at least 6 characters long.");
  }

  const app = initializeAdminApp();
  const auth = getAuth(app);
  const adminEmails = getAdminEmails(adminIdentityConfig.emails);

  console.warn(
    "Security warning: a shared admin password weakens account isolation. Prefer unique passwords plus MFA as soon as possible.",
  );

  if (dryRun) {
    console.log(
      `Dry run only. The script is configured for these allowlisted admin emails: ${adminEmails.join(", ")}`,
    );
    return;
  }

  const missingUsers = [];

  for (const email of adminEmails) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      await auth.updateUser(userRecord.uid, { password });
      await auth.revokeRefreshTokens(userRecord.uid);
      console.log(`Admin password updated: ${email} (${userRecord.uid})`);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";

      if (code === "auth/user-not-found") {
        missingUsers.push(email);
        continue;
      }

      throw error;
    }
  }

  if (missingUsers.length > 0) {
    console.warn(
      `These allowlisted admin emails do not exist in Firebase Auth yet: ${missingUsers.join(", ")}`,
    );
    console.warn("Create those admin users intentionally, then rerun this command.");
    process.exitCode = 1;
    return;
  }

  console.log(
    "Admin Email/Password credentials updated. Each admin should sign out and sign back in before verification.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Unable to update admin passwords.",
  );
  process.exitCode = 1;
});
