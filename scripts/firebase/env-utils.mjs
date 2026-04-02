import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = fileURLToPath(new URL(".", import.meta.url));

export const ROOT_DIR = path.resolve(THIS_DIR, "..", "..");
export const ENV_LOCAL_PATH = path.join(ROOT_DIR, ".env.local");
export const ADMIN_IDENTITIES_PATH = path.join(
  ROOT_DIR,
  "packages",
  "shared-config",
  "src",
  "admin-identities.json",
);
export const SERVICE_ACCOUNT_KEY_PATH = path.join(
  ROOT_DIR,
  "serviceAccountKeyNext.json",
);

export async function readTextFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "";
    }

    throw error;
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvFile(content) {
  const env = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    env.set(key, value);
  }

  return env;
}

export async function loadEnvFileIntoProcess(filePath = ENV_LOCAL_PATH) {
  const content = await readTextFile(filePath);
  const envMap = parseEnvFile(content);

  for (const [key, value] of envMap.entries()) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return envMap;
}

export function formatEnvValue(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
}

export async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function readAdminIdentityConfig() {
  const config = await readJsonFile(ADMIN_IDENTITIES_PATH);

  return {
    emails: Array.isArray(config?.emails)
      ? config.emails.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : [],
    explicitUsernameLookup:
      typeof config?.explicitUsernameLookup === "object" &&
      config.explicitUsernameLookup !== null
        ? Object.fromEntries(
            Object.entries(config.explicitUsernameLookup)
              .map(([username, email]) => [
                String(username).trim().toLowerCase(),
                String(email).trim().toLowerCase(),
              ])
              .filter(([username, email]) => username && email),
          )
        : {},
  };
}
