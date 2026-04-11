import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function readEnv(env, key) {
  const processValue = process.env[key];
  if (typeof processValue === "string" && processValue.trim()) {
    return processValue.trim();
  }
  const fileValue = env[key];
  if (typeof fileValue === "string" && fileValue.trim()) {
    return fileValue.trim();
  }
  return "";
}

function updateCookieJar(cookieJar, response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const names = [];
  for (const setCookie of setCookies) {
    const pair = setCookie.split(";", 1)[0];
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) {
      cookieJar.set(name, value);
      names.push(name);
    }
  }

  return names;
}

function buildCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function readBody(response) {
  let raw = null;
  try {
    raw = await response.text();
  } catch {
    return { raw: null, json: null };
  }

  if (!raw) {
    return { raw: "", json: null };
  }

  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

async function main() {
  const env = parseEnvFile(path.join(process.cwd(), ".env.local"));

  const baseUrl = process.env.AUTH_REPRO_BASE_URL || "http://127.0.0.1:3000";
  const supabaseUrl = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = readEnv(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = readEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const testPassword = process.env.AUTH_REPRO_PASSWORD || "TempPass123!";

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("Missing Supabase env configuration.");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const testEmail = `qa-user-${Date.now()}@example.com`;

  const createRes = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      name: "QA User",
    },
  });

  if (createRes.error || !createRes.data.user) {
    console.log("create-user", {
      ok: false,
      message: createRes.error?.message || "unknown",
    });
    return;
  }

  const createdUid = createRes.data.user.id;
  console.log("create-user", { ok: true, uid: createdUid });

  const cookieJar = new Map();

  try {
    const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
      },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const tokenWrapped = await readBody(tokenResponse);
    const tokenPayload = tokenWrapped.json;
    console.log("supabase token", {
      status: tokenResponse.status,
      hasAccessToken: typeof tokenPayload?.access_token === "string",
      error: tokenPayload?.error || null,
      errorCode: tokenPayload?.error_code || null,
    });

    const accessToken = tokenPayload?.access_token;
    if (typeof accessToken !== "string") {
      return;
    }

    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, {
      method: "GET",
    });
    const csrfCookies = updateCookieJar(cookieJar, csrfResponse);
    const csrfWrapped = await readBody(csrfResponse);
    const csrfPayload = csrfWrapped.json;
    console.log("auth csrf", {
      status: csrfResponse.status,
      hasToken: typeof csrfPayload?.csrfToken === "string",
      setCookieNames: csrfCookies,
    });

    const csrfToken = csrfPayload?.csrfToken;
    if (typeof csrfToken !== "string") {
      return;
    }

    const callbackBody = new URLSearchParams({
      csrfToken,
      idToken: accessToken,
      callbackUrl: `${baseUrl}/upload`,
      json: "true",
    });

    const callbackResponse = await fetch(`${baseUrl}/api/auth/callback/user-credentials?json=true`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-auth-return-redirect": "1",
        accept: "application/json",
        cookie: buildCookieHeader(cookieJar),
      },
      body: callbackBody,
      redirect: "manual",
    });
    const callbackCookies = updateCookieJar(cookieJar, callbackResponse);
    const callbackWrapped = await readBody(callbackResponse);
    const callbackPayload = callbackWrapped.json;
    console.log("auth callback user-credentials", {
      status: callbackResponse.status,
      location: callbackResponse.headers.get("location"),
      rawBody: callbackWrapped.raw,
      setCookieNames: callbackCookies,
      error: callbackPayload?.error || null,
      code: callbackPayload?.code || null,
    });

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        cookie: buildCookieHeader(cookieJar),
      },
    });
    const meWrapped = await readBody(meResponse);
    const mePayload = meWrapped.json;
    console.log("api/auth/me", {
      status: meResponse.status,
      ok: mePayload?.ok ?? null,
      code: mePayload?.error?.code ?? null,
      authenticated: mePayload?.data?.session?.authenticated ?? null,
      role: mePayload?.data?.session?.user?.role ?? null,
    });
  } finally {
    await adminClient.auth.admin.deleteUser(createdUid).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("REPRO_FAILED", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
