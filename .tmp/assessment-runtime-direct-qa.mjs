import fs from "node:fs";
import path from "node:path";

const PROFILE_PAYLOAD = {
  fullName: "Assessment QA User",
  universityCode: "QA-2026",
  nationality: "QA",
  phoneNumber: "+15551234567",
};

const PROVIDER_RESULT_CODES = new Set([
  "ASSESSMENT_PROVIDER_API_KEY_MISSING",
  "ASSESSMENT_PROVIDER_BASE_URL_MISSING",
  "ASSESSMENT_PROVIDER_MODEL_UNAVAILABLE",
  "ASSESSMENT_PROVIDER_ROUTE_MISMATCH",
  "ASSESSMENT_PROVIDER_AUTH_FAILED",
  "ASSESSMENT_PROVIDER_RATE_LIMITED",
  "ASSESSMENT_PROVIDER_TIMEOUT",
  "ASSESSMENT_PROVIDER_EXECUTION_FAILED",
  "ASSESSMENT_PROVIDER_RESPONSE_INVALID",
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

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeSetCookieHeader(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  return normalizeSetCookieHeader(headers.get("set-cookie"));
}

function extractCookieValue(setCookies, cookieName) {
  const prefix = `${cookieName}=`;
  for (const setCookie of setCookies) {
    const parts = String(setCookie || "").split(";");
    const first = parts[0] || "";
    if (first.startsWith(prefix)) {
      return first.slice(prefix.length);
    }
  }

  return "";
}

function mergeCookieHeaders(...cookieValues) {
  return cookieValues
    .filter(Boolean)
    .join("; ");
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

async function ensurePasswordUser(apiKey, email, password) {
  const signUpResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  if (signUpResponse.ok) {
    return;
  }

  const payload = await signUpResponse.json().catch(() => ({}));
  const message = String(payload?.error?.message || "");
  if (message.includes("EMAIL_EXISTS")) {
    return;
  }

  throw new Error(`Unable to create QA user ${email}: ${message || signUpResponse.status}`);
}

async function signInWithPassword(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.idToken !== "string") {
    throw new Error(
      `Unable to sign in ${email} (${response.status}): ${payload?.error?.message || "unknown"}`,
    );
  }

  return payload.idToken;
}

async function bootstrapAuthJsSessionCookie(baseUrl, providerId, idToken) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: "GET",
    redirect: "manual",
  });
  const csrfPayload = await csrfResponse.json().catch(() => ({}));
  const csrfToken = String(csrfPayload?.csrfToken || "");
  ensure(Boolean(csrfToken), `Missing csrf token from ${baseUrl}/api/auth/csrf`);

  const csrfSetCookies = readSetCookies(csrfResponse.headers);
  const csrfCookieValue = extractCookieValue(csrfSetCookies, "authjs.csrf-token");
  ensure(Boolean(csrfCookieValue), "Missing authjs.csrf-token cookie.");

  const callbackPayload = new URLSearchParams({
    csrfToken,
    idToken,
    callbackUrl: `${baseUrl}/`,
    json: "true",
  });

  const callbackResponse = await fetch(`${baseUrl}/api/auth/callback/${providerId}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `authjs.csrf-token=${csrfCookieValue}`,
    },
    body: callbackPayload.toString(),
    redirect: "manual",
  });

  const callbackSetCookies = readSetCookies(callbackResponse.headers);
  const sessionCookie = extractCookieValue(callbackSetCookies, "zc_session");
  ensure(Boolean(sessionCookie), `Missing zc_session cookie after ${providerId} callback.`);

  return `zc_session=${sessionCookie}; zc_theme=light; zc_locale=en`;
}

async function callWithSession(input) {
  const response = await fetch(`${input.baseUrl}${input.pathName}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.headers ?? {}),
      ...(input.sessionCookie ? { cookie: input.sessionCookie } : {}),
    },
    body: input.body,
    redirect: "manual",
  });

  return parseApiResponse(response);
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

function evaluateProviderPathAttempt(attempt) {
  if (attempt.status === 200 && attempt.payload?.ok === true) {
    return {
      pass: true,
      reason: "generation-created",
      generationId: attempt.payload?.data?.generation?.id ?? null,
      code: null,
    };
  }

  const code = attempt.payload?.error?.code;
  if (typeof code === "string" && PROVIDER_RESULT_CODES.has(code)) {
    return {
      pass: true,
      reason: "provider-path-error",
      generationId: null,
      code,
    };
  }

  return {
    pass: false,
    reason: "unexpected-response",
    generationId: null,
    code: code || null,
  };
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

  const baseUrl = process.env.ASSESSMENT_QA_BASE_URL || "http://127.0.0.1:3035";
  const missingConfigBaseUrl = process.env.ASSESSMENT_QA_MISSING_CONFIG_BASE_URL || "";

  const adminEmail = process.env.ASSESSMENT_QA_ADMIN_EMAIL || `qa-admin-${runId}@example.com`;
  const userAEmail = process.env.ASSESSMENT_QA_USER_A_EMAIL || `qa-user-a-${runId}@example.com`;
  const userBEmail = process.env.ASSESSMENT_QA_USER_B_EMAIL || `qa-user-b-${runId}@example.com`;
  const password = process.env.ASSESSMENT_QA_PASSWORD || "QaPass!234567";

  await ensurePasswordUser(apiKey, adminEmail, password);
  await ensurePasswordUser(apiKey, userAEmail, password);
  await ensurePasswordUser(apiKey, userBEmail, password);

  const adminIdToken = await signInWithPassword(apiKey, adminEmail, password);
  const userAIdToken = await signInWithPassword(apiKey, userAEmail, password);
  const userBIdToken = await signInWithPassword(apiKey, userBEmail, password);

  const adminSessionCookie = await bootstrapAuthJsSessionCookie(baseUrl, "admin-credentials", adminIdToken);
  const userASessionCookie = await bootstrapAuthJsSessionCookie(baseUrl, "user-credentials", userAIdToken);
  const userBSessionCookie = await bootstrapAuthJsSessionCookie(baseUrl, "user-credentials", userBIdToken);

  const profilePatchA = await callWithSession({
    baseUrl,
    sessionCookie: userASessionCookie,
    pathName: "/api/users/me/profile",
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(PROFILE_PAYLOAD),
  });

  const profilePatchB = await callWithSession({
    baseUrl,
    sessionCookie: userBSessionCookie,
    pathName: "/api/users/me/profile",
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(PROFILE_PAYLOAD),
  });

  ensure(profilePatchA.status === 200, `User A profile completion failed (${profilePatchA.status}).`);
  ensure(profilePatchB.status === 200, `User B profile completion failed (${profilePatchB.status}).`);

  const adminLaneAttempt = await callWithSession({
    baseUrl,
    sessionCookie: adminSessionCookie,
    pathName: "/api/assessment",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `admin-lane-${runId}`,
    },
    body: JSON.stringify(createAssessmentPayload("qwen3.5-flash", runId, "admin-lane")),
  });

  const qwenAttempt = await callWithSession({
    baseUrl,
    sessionCookie: userASessionCookie,
    pathName: "/api/assessment",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `qwen-${runId}`,
    },
    body: JSON.stringify(createAssessmentPayload("qwen3.5-flash", runId, "qwen")),
  });

  const googleAttempt = await callWithSession({
    baseUrl,
    sessionCookie: userASessionCookie,
    pathName: "/api/assessment",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `google-${runId}`,
    },
    body: JSON.stringify(createAssessmentPayload("gemini-2.5-flash", runId, "google")),
  });

  const qwenEvaluation = evaluateProviderPathAttempt(qwenAttempt);
  const googleEvaluation = evaluateProviderPathAttempt(googleAttempt);

  const generationId = qwenEvaluation.generationId || googleEvaluation.generationId;

  let ownerReadByOwner = null;
  let ownerReadByOtherUser = null;
  if (generationId) {
    ownerReadByOwner = await callWithSession({
      baseUrl,
      sessionCookie: userASessionCookie,
      pathName: `/api/assessment/${encodeURIComponent(generationId)}`,
    });

    ownerReadByOtherUser = await callWithSession({
      baseUrl,
      sessionCookie: userBSessionCookie,
      pathName: `/api/assessment/${encodeURIComponent(generationId)}`,
    });
  }

  let missingConfigAttempt = null;
  if (missingConfigBaseUrl) {
    missingConfigAttempt = await callWithSession({
      baseUrl: missingConfigBaseUrl,
      sessionCookie: userASessionCookie,
      pathName: "/api/assessment",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `missing-config-${runId}`,
      },
      body: JSON.stringify(createAssessmentPayload("qwen3.5-flash", runId, "missing-config")),
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
    qaAccounts: {
      adminEmail,
      userAEmail,
      userBEmail,
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

  const reportPath = path.join(outputDir, "assessment-runtime-diagnostics-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ reportPath, checks }, null, 2));

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
  console.error("assessment-runtime-direct-qa failed", error);
  process.exitCode = 1;
});
