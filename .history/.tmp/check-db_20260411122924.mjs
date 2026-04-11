import fs from "node:fs";
import postgres from "postgres";

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
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
    env[key] = value;
  }

  return env;
}

const env = parseEnv('.env.local');
const dbUrl = (process.env.SUPABASE_DATABASE_URL || env.SUPABASE_DATABASE_URL || '').trim();

if (!dbUrl) {
  console.log('DB_URL_MISSING');
  process.exit(0);
}

const sql = postgres(dbUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
});

try {
  const rows = await sql`select 1 as ok`;
  console.log('DB_OK', rows?.[0]?.ok === 1);
} catch (error) {
  const err = error;
  console.log('DB_ERR', err?.code || err?.name || 'ERR', err?.message || String(err));
} finally {
  await sql.end({ timeout: 1 });
}
