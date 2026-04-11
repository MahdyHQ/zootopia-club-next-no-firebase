const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function parseEnv(filePath) {
  const env = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

(async () => {
  const env = parseEnv(path.join("apps", "web", ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const password = env.ZOOTOPIA_ADMIN_LOGIN_PASSWORD;
  const emails = (env.ZOOTOPIA_ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!url || !key || !password || emails.length === 0) {
    console.log(JSON.stringify({ ok: false, reason: "missing runtime vars" }));
    return;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const results = [];
  for (const email of emails) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    results.push({ email, ok: !error && !!data.session, errorCode: error?.code || null });
    if (data.session) {
      await client.auth.signOut();
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        successCount: results.filter((entry) => entry.ok).length,
        results,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.log(JSON.stringify({ ok: false, reason: String(error?.message || error) }));
  process.exitCode = 1;
});
