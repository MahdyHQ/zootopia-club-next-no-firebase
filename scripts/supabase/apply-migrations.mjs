/**
 * MIGRATION APPLY SCRIPT
 *
 * Applies all Supabase migrations in order to the target database.
 * Uses the `postgres` npm package (already installed in apps/web).
 *
 * Usage:
 *   node scripts/supabase/apply-migrations.mjs          # Apply all pending migrations
 *   node scripts/supabase/apply-migrations.mjs --dry    # Show what would be applied without executing
 *   node scripts/supabase/apply-migrations.mjs --status # Report migration status only
 *
 * Environment:
 *   DATABASE_URL or SUPABASE_DATABASE_URL - Postgres connection string
 *
 * How it works:
 *   1. Connects to the database
 *   2. Creates a _migration_history table if it doesn't exist
 *   3. Reads all .sql files from supabase/migrations/ in sorted order
 *   4. Canonicalizes legacy filename history entries by timestamp
 *   5. Skips migrations already recorded in _migration_history
 *   6. Applies each pending migration inside a transaction
 *   7. Records the migration name in _migration_history on success
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  buildCanonicalMigrationByTimestamp,
  extractMigrationTimestamp,
  getMigrationsDir,
  getSortedMigrationFiles,
  validateMigrationOrdering,
} from "./migration-files.mjs";

// Load .env.local from project root so the script works standalone
import { config } from "dotenv";
const root = process.cwd();
config({ path: resolve(root, ".env.local") });

const migrationsDir = getMigrationsDir();
const MAX_STATUS_LINES = 10;

function getDatabaseUrl() {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    "";
  if (!url) {
    console.error("ERROR: DATABASE_URL or SUPABASE_DATABASE_URL is not set.");
    console.error("Set one of these env vars to your Supabase Postgres connection string.");
    process.exit(1);
  }
  return url;
}

async function ensureMigrationHistoryTable(sql) {
  await sql`
    create table if not exists public._migration_history (
      migration_name text primary key,
      applied_at timestamptz not null default now()
    );
  `;
}

async function getAppliedMigrations(sql) {
  return await sql`
    select migration_name, applied_at
    from public._migration_history
    order by applied_at asc, migration_name asc
  `;
}

function classifyHistoryRows(appliedRows, files, canonicalByTimestamp) {
  const fileSet = new Set(files);
  const historyOnly = [];
  const legacyAliases = [];

  for (const row of appliedRows) {
    if (fileSet.has(row.migration_name)) {
      continue;
    }

    const timestamp = extractMigrationTimestamp(row.migration_name);
    const canonicalName = timestamp ? canonicalByTimestamp.get(timestamp) : null;

    if (canonicalName && canonicalName !== row.migration_name) {
      legacyAliases.push({
        legacyName: row.migration_name,
        canonicalName,
      });
      continue;
    }

    historyOnly.push(row.migration_name);
  }

  return { historyOnly, legacyAliases };
}

async function syncCanonicalHistoryAliases(sql, appliedRows, canonicalByTimestamp) {
  let insertedCount = 0;
  const appliedNames = new Set(appliedRows.map((row) => row.migration_name));

  // This keeps already-applied migrations safe after on-disk filename cleanup.
  // If history has an old filename but the same timestamp exists on disk with a new canonical name,
  // we record the canonical name so the runner does not attempt to reapply SQL.
  for (const row of appliedRows) {
    const timestamp = extractMigrationTimestamp(row.migration_name);
    if (!timestamp) {
      continue;
    }

    const canonicalName = canonicalByTimestamp.get(timestamp);
    if (!canonicalName || canonicalName === row.migration_name || appliedNames.has(canonicalName)) {
      continue;
    }

    await sql`
      insert into public._migration_history (migration_name, applied_at)
      values (${canonicalName}, ${row.applied_at})
      on conflict (migration_name) do nothing
    `;

    appliedNames.add(canonicalName);
    insertedCount += 1;
  }

  return insertedCount;
}

function printStatusSection(title, rows) {
  if (rows.length === 0) {
    return;
  }

  console.log(`\n${title}`);

  for (const row of rows.slice(0, MAX_STATUS_LINES)) {
    console.log(`  ${row}`);
  }

  if (rows.length > MAX_STATUS_LINES) {
    console.log(`  ... and ${rows.length - MAX_STATUS_LINES} more`);
  }
}

function printMigrationStatus({ files, appliedRows, pending, historyOnly, legacyAliases }) {
  console.log("\nMigration status summary:");
  console.log(`  Local migration files: ${files.length}`);
  console.log(`  Recorded history rows: ${appliedRows.length}`);
  console.log(`  Pending migrations: ${pending.length}`);

  printStatusSection("Pending migration files:", pending);

  if (legacyAliases.length > 0) {
    console.log("\nLegacy history aliases detected (safe compatibility rows now canonicalized):");
    for (const alias of legacyAliases.slice(0, MAX_STATUS_LINES)) {
      console.log(`  ${alias.legacyName} -> ${alias.canonicalName}`);
    }
    if (legacyAliases.length > MAX_STATUS_LINES) {
      console.log(`  ... and ${legacyAliases.length - MAX_STATUS_LINES} more`);
    }
  }

  printStatusSection("History-only rows (not found in local migration files):", historyOnly);
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const statusOnly = process.argv.includes("--status");
  const databaseUrl = getDatabaseUrl();

  console.log(`Connecting to database...`);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });

  try {
    const files = getSortedMigrationFiles();
    validateMigrationOrdering(files);
    const canonicalByTimestamp = buildCanonicalMigrationByTimestamp(files);

    await ensureMigrationHistoryTable(sql);

    let appliedRows = await getAppliedMigrations(sql);
    const aliasRowsInserted = await syncCanonicalHistoryAliases(sql, appliedRows, canonicalByTimestamp);
    if (aliasRowsInserted > 0) {
      console.log(`Canonicalized ${aliasRowsInserted} legacy migration history row(s) by timestamp.`);
      appliedRows = await getAppliedMigrations(sql);
    }

    const applied = new Set(appliedRows.map((row) => row.migration_name));
    const pending = files.filter((file) => !applied.has(file));
    const { historyOnly, legacyAliases } = classifyHistoryRows(appliedRows, files, canonicalByTimestamp);

    printMigrationStatus({ files, appliedRows, pending, historyOnly, legacyAliases });

    if (statusOnly) {
      console.log("\nStatus check complete (no migrations applied).");
      return;
    }

    if (pending.length === 0) {
      console.log("\nAll migrations are already applied.");
      return;
    }

    console.log(`\nFound ${pending.length} pending migration(s):\n`);
    for (const f of pending) {
      console.log(`  ${f}`);
    }
    console.log("");

    if (dryRun) {
      console.log("[DRY RUN] No migrations were applied. Remove --dry to apply them.");
      return;
    }

    for (const migrationFile of pending) {
      const migrationPath = resolve(migrationsDir, migrationFile);
      const migrationSql = readFileSync(migrationPath, "utf-8");

      console.log(`Applying: ${migrationFile}...`);

      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(migrationSql);
          await tx`insert into public._migration_history (migration_name) values (${migrationFile})`;
        });
        console.log(`  ✓ ${migrationFile} applied successfully.\n`);
      } catch (err) {
        console.error(`  ✗ FAILED: ${migrationFile}`);
        console.error(`  Error: ${err.message}\n`);
        console.error("Migration stopped. Fix the error and re-run to continue.");
        process.exit(1);
      }
    }

    console.log(`All ${pending.length} migration(s) applied successfully.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});