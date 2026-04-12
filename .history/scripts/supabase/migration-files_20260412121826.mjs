import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE_PATTERN = /^(\d{14})_.+\.sql$/;

export function getMigrationsDir() {
  return resolve(process.cwd(), "supabase/migrations");
}

export function extractMigrationTimestamp(migrationName) {
  const match = migrationName.match(MIGRATION_FILE_PATTERN);
  return match ? match[1] : null;
}

export function getSortedMigrationFiles() {
  const migrationsDir = getMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error("No SQL migrations found in supabase/migrations.");
  }

  return files;
}

export function validateMigrationOrdering(files) {
  let previousTimestamp = "";

  for (const file of files) {
    const timestamp = extractMigrationTimestamp(file);
    if (!timestamp) {
      throw new Error(`Invalid migration name: ${file}`);
    }

    if (timestamp === previousTimestamp) {
      throw new Error(`Duplicate migration timestamp: ${file}`);
    }

    if (timestamp < previousTimestamp) {
      throw new Error(`Migration order violation: ${file}`);
    }

    previousTimestamp = timestamp;
  }
}

export function buildCanonicalMigrationByTimestamp(files) {
  const canonicalByTimestamp = new Map();

  for (const file of files) {
    const timestamp = extractMigrationTimestamp(file);
    if (!timestamp) {
      continue;
    }

    canonicalByTimestamp.set(timestamp, file);
  }

  return canonicalByTimestamp;
}
