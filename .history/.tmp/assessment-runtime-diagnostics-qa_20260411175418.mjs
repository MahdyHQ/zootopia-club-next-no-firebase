import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

const PROVIDER_PATH_CODES = new Set([
  "ASSESSMENT_PROVIDER_API_KEY_MISSING",
  "ASSESSMENT_PROVIDER_BASE_URL_MISSING",
  "ASSESSMENT_PROVIDER_MODEL_UNAVAILABLE",
  "ASSESSMENT_PROVIDER_ROUTE_MISMATCH",
  "ASSESSMENT_PROVIDER_AUTH_FAILED",
  "ASSESSMENT_PROVIDER_RATE_LIMITED",
  "ASSESSMENT_PROVIDER_TIMEOUT",
  "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
  "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
  "ASSESSMENT_MODEL_UNSUPPORTED",
]);

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

async function createSessionCookieForUid(input) {
  const claims = input.claims ?? undefined;
  const customToken = await input.auth.createCustomToken(input.uid, claims);
  const idToken = await exchangeCustomTokenForIdToken(input.apiKey, customToken);
  return input.auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });
}

async function fetchWithSession(input) {
  const headers = {
    ...(input.headers ?? {}),
  };

  if (input.sessionCookie) {
    headers.cookie = `zc_session=${input.sessionCookie}; zc_theme=light; zc_locale=en`;
  }

  return fetch(`${input.baseUrl}${input.pathName}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body,
    redirect: "manual",
  });
}

async function parseApiResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
    text,
  };
}

function createAssessmentPayload(modelId, runId, suffix) {
  return {
    prompt: `Assessment diagnostics ${runId} ${suffix}`,
    modelId,
    options: {
      mode: "question_generation",
      questionCount: 10,
      difficulty: "easy",
      language: "en",
      questionTypes: ["mcq"],
      questionTypeDistribution: [{ type: "mcq", percentage: 100 }],
    },
  };
}

async function postAssessment(input) {
  const response = await fetchWithSession({
    baseUrl: input.baseUrl,
    sessionCookie: input.sessionCookie,
    pathName: "/api/assessment",
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify(input.payload),
  });

  return parseApiResponse(response);
}

function evaluateProviderPathResult(result) {
  if (result.status === 200 && result.payload?.ok === true) {
    return {
      pass: true,
      reason: "generation-created",
      code: null,
      generationId: result.payload?.data?.generation?.id ?? null,
    };
  }

  const code = result.payload?.error?.code ?? null;
  if (typeof code === "string" && PROVIDER_PATH_CODES.has(code)) {
    return {
      pass: true,
      reason: "provider-path-error",
      code,
      generationId: null,
    };
  }

  return {
    pass: false,
    reason: "unexpected-response",
    code,
    generationId: null,
  };
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const workspaceRoot = process.cwd();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(
    workspaceRoot,
    "output",
    "playwright",
    "assessment-runtime-diagnostics",
    runId,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const envMap = parseEnvFile(path.join(workspaceRoot, ".env.local"));
  const apiKey = readEnv(envMap, "NEXT_PUBLIC_FIREBASE_API_KEY");
  ensure(Boolean(apiKey), "NEXT_PUBLIC_FIREBASE_API_KEY is missing.");

  const adminConfig = getFirebaseAdminConfig(envMap);
  ensure(Boolean(adminConfig.projectId), "FIREBASE_PROJECT_ID (or alias) is missing.");
  ensure(Boolean(adminConfig.clientEmail && adminConfig.privateKey), "Firebase Admin credentials are missing from local env.");

  const baseUrl = process.env.ASSESSMENT_QA_BASE_URL || "http://127.0.0.1:3025";
  const missingConfigBaseUrl = process.env.ASSESSMENT_QA_MISSING_CONFIG_BASE_URL || "";

  const firebaseApp = getApps()[0] || initializeApp({
    credential: cert({
      projectId: adminConfig.projectId,
      clientEmail: adminConfig.clientEmail,
      privateKey: adminConfig.privateKey,
    }),
    projectId: adminConfig.projectId,
  });

  const auth = getAuth(firebaseApp);
  const adminEmails = getAdminEmails(envMap);
  const adminUser = await selectVerifiedAdminUser(auth, adminEmails);
  ensure(Boolean(adminUser?.uid), "No allowlisted admin user with admin: true was found.");

  const adminSessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: adminUser.uid,
    claims: { admin: true },
  });

  const adminUsersResponse = await fetchWithSession({
    baseUrl,
    sessionCookie: adminSessionCookie,
    pathName: "/api/admin/users",
  });
  const adminUsersParsed = await parseApiResponse(adminUsersResponse);
  ensure(
    adminUsersParsed.status === 200 && adminUsersParsed.payload?.ok === true,
    `Admin users fetch failed (${adminUsersParsed.status}).`,
  );

  const users = adminUsersParsed.payload.data.users;
  const candidateUsers = users.filter(
    (entry) => entry.role === "user" && entry.status === "active",
  );
  ensure(candidateUsers.length >= 2, "Need at least two active non-admin users for owner-lane verification.");

  const userA = candidateUsers.find((entry) => entry.profileCompleted === true) || candidateUsers[0];
  const userB = candidateUsers.find((entry) => entry.uid !== userA.uid);
  ensure(Boolean(userB?.uid), "Unable to resolve user B for owner separation checks.");

  const userASessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: userA.uid,
  });

  const userBSessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: userB.uid,
  });

  const adminLaneAttempt = await postAssessment({
    baseUrl,
    sessionCookie: adminSessionCookie,
    idempotencyKey: `admin-lane-${runId}`,
    payload: createAssessmentPayload("qwen3.5-flash", runId, "admin-lane"),
  });

  const qwenAttempt = await postAssessment({
    baseUrl,
    sessionCookie: userASessionCookie,
    idempotencyKey: `qwen-${runId}`,
    payload: createAssessmentPayload("qwen3.5-flash", runId, "qwen"),
  });

  const googleAttempt = await postAssessment({
    baseUrl,
    sessionCookie: userASessionCookie,
    idempotencyKey: `google-${runId}`,
    payload: createAssessmentPayload("gemini-2.5-flash", runId, "google"),
  });

  const qwenEvaluation = evaluateProviderPathResult(qwenAttempt);
  const googleEvaluation = evaluateProviderPathResult(googleAttempt);

  const generationId = qwenEvaluation.generationId || googleEvaluation.generationId;

  let ownerReadByOwner = null;
  let ownerReadByOtherUser = null;
  if (generationId) {
    ownerReadByOwner = await parseApiResponse(
      await fetchWithSession({
        baseUrl,
        sessionCookie: userASessionCookie,
        pathName: `/api/assessment/${encodeURIComponent(generationId)}`,
      }),
    );

    ownerReadByOtherUser = await parseApiResponse(
      await fetchWithSession({
        baseUrl,
        sessionCookie: userBSessionCookie,
        pathName: `/api/assessment/${encodeURIComponent(generationId)}`,
      }),
    );
  }

  let missingConfigAttempt = null;
  if (missingConfigBaseUrl) {
    missingConfigAttempt = await postAssessment({
      baseUrl: missingConfigBaseUrl,
      sessionCookie: userASessionCookie,
      idempotencyKey: `missing-config-${runId}`,
      payload: createAssessmentPayload("qwen3.5-flash", runId, "missing-config"),
    });
  }

  const checks = {
    adminLaneRejected:
      adminLaneAttempt.status === 403
      && adminLaneAttempt.payload?.error?.code === "ASSESSMENT_USER_LANE_REQUIRED",
    qwenPathVerified: qwenEvaluation.pass,
    googlePathVerified: googleEvaluation.pass,
    ownerLaneSeparationVerified:
      Boolean(generationId)
      && ownerReadByOwner?.status === 200
      && ownerReadByOtherUser?.status === 404,
    missingConfigCodeVerified:
      missingConfigAttempt == null
        ? null
        : (
          missingConfigAttempt.status === 503
          && missingConfigAttempt.payload?.error?.code === "ASSESSMENT_PROVIDER_API_KEY_MISSING"
        ),
  };

  const report = {
    runId,
    baseUrl,
    missingConfigBaseUrl: missingConfigBaseUrl || null,
    selectedUsers: {
      adminUid: adminUser.uid,
      userAUid: userA.uid,
      userBUid: userB.uid,
    },
    checks,
    attempts: {
      adminLaneAttempt,
      qwenAttempt,
      qwenEvaluation,
      googleAttempt,
      googleEvaluation,
      generationId,
      ownerReadByOwner,
      ownerReadByOtherUser,
      missingConfigAttempt,
    },
  };

  const outputPath = path.join(outputDir, "assessment-runtime-diagnostics-report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    reportPath: outputPath,
    checks,
  }, null, 2));

  if (
    !checks.adminLaneRejected
    || !checks.qwenPathVerified
    || !checks.googlePathVerified
    || !checks.ownerLaneSeparationVerified
    || checks.missingConfigCodeVerified === false
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("assessment-runtime-diagnostics-qa failed", error);
  process.exitCode = 1;
});
