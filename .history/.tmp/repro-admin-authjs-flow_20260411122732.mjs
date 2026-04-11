import fs from "node:fs";
import path from "node:path";

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

async function readJson(response) {
  try {
    const text = await response.text();
    if (!text) {
      return { __raw: "", __json: null };
    }
    try {
      return { __raw: text, __json: JSON.parse(text) };
    } catch {
      return { __raw: text, __json: null };
    }
  } catch {
    return { __raw: null, __json: null };
  }
}

async function main() {
  const env = parseEnvFile(path.join(process.cwd(), ".env.local"));

  const baseUrl = process.env.AUTH_REPRO_BASE_URL || "http://127.0.0.1:3000";
  const supabaseUrl = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = readEnv(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const adminPassword = readEnv(env, "ZOOTOPIA_ADMIN_LOGIN_PASSWORD");
  const identifier = process.env.AUTH_REPRO_IDENTIFIER || "elmahdy";

  if (!supabaseUrl || !supabaseKey || !adminPassword) {
    throw new Error("Missing required env for repro.");
  }

  const cookieJar = new Map();

  const resolveResponse = await fetch(`${baseUrl}/api/auth/admin/resolve-identifier`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  const resolveWrapped = await readJson(resolveResponse);
  const resolvePayload = resolveWrapped?.__json;
  console.log("resolve-identifier", {
    status: resolveResponse.status,
    ok: resolvePayload?.ok,
    code: resolvePayload?.error?.code ?? null,
    resolution: resolvePayload?.data?.resolutionSource ?? null,
    identifierType: resolvePayload?.data?.identifierType ?? null,
  });

  if (!resolveResponse.ok || !resolvePayload?.ok || !resolvePayload?.data?.email) {
    return;
  }

  const email = resolvePayload.data.email;

  const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ email, password: adminPassword }),
  });
  const tokenWrapped = await readJson(tokenResponse);
  const tokenPayload = tokenWrapped?.__json;
  console.log("supabase token", {
    status: tokenResponse.status,
    hasAccessToken: typeof tokenPayload?.access_token === "string",
    error: tokenPayload?.error ?? null,
    errorCode: tokenPayload?.error_code ?? null,
  });

  const accessToken = tokenPayload?.access_token;
  if (typeof accessToken !== "string") {
    return;
  }

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: "GET",
  });
  const csrfCookies = updateCookieJar(cookieJar, csrfResponse);
  const csrfWrapped = await readJson(csrfResponse);
  const csrfPayload = csrfWrapped?.__json;
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
    callbackUrl: `${baseUrl}/admin`,
    json: "true",
  });

  const callbackResponse = await fetch(`${baseUrl}/api/auth/callback/admin-credentials?json=true`, {
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
  const callbackWrapped = await readJson(callbackResponse);
  const callbackPayload = callbackWrapped?.__json;
  console.log("auth callback admin-credentials", {
    status: callbackResponse.status,
    location: callbackResponse.headers.get("location"),
    ok: callbackPayload?.ok ?? null,
    error: callbackPayload?.error ?? null,
    code: callbackPayload?.code ?? null,
    rawBody: callbackWrapped?.__raw,
    urlHasCode: typeof callbackPayload?.url === "string" ? new URL(callbackPayload.url, baseUrl).searchParams.get("code") : null,
    setCookieNames: callbackCookies,
  });

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    method: "GET",
    headers: {
      cookie: buildCookieHeader(cookieJar),
      "cache-control": "no-store",
    },
  });
  const meWrapped = await readJson(meResponse);
  const mePayload = meWrapped?.__json;
  console.log("api/auth/me", {
    status: meResponse.status,
    ok: mePayload?.ok ?? null,
    code: mePayload?.error?.code ?? null,
    authenticated: mePayload?.data?.session?.authenticated ?? null,
    role: mePayload?.data?.session?.user?.role ?? null,
  });
}

main().catch((error) => {
  console.error("REPRO_FAILED", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
