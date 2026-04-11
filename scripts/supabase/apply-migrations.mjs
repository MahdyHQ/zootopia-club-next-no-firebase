/**
 * MIGRATION APPLY SCRIPT
 *
 * Applies all Supabase migrations in order to the target database.
 * Uses the `postgres` npm package (already installed in apps/web).
 *
 * Usage:
 *   node scripts/supabase/apply-migrations.mjs          # Apply all pending migrations
 *   node scripts/supabase/apply-migrations.mjs --dry    # Show what would be applied without executing
 *
 * Environment:
 *   DATABASE_URL or SUPABASE_DATABASE_URL - Postgres connection string
 *
 * How it works:
 *   1. Connects to the database
 *   2. Creates a _migration_history table if it doesn't exist
 *   3. Reads all .sql files from supabase/migrations/ in sorted order
 *   4. Skips migrations already recorded in _migration_history
 *   5. Applies each pending migration inside a transaction
 *   6. Records the migration name in _migration_history on success
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

// Load .env.local from project root so the script works standalone
import { config } from "dotenv";
const root = process.cwd();
config({ path: resolve(root, ".env.local") });

const migrationsDir = resolve(root, "supabase/migrations");

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
    create table if not exists _migration_history (
      migration_name text primary key,
      applied_at timestamptz not null default now()
    );
  `;
}

async function getAppliedMigrations(sql) {
  const rows = await sql`select migration_name from _migration_history order by migration_name`;
  return new Set(rows.map((r) => r.migration_name));
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const databaseUrl = getDatabaseUrl();

  console.log(`Connecting to database...`);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });

  try {
    await ensureMigrationHistoryTable(sql);
    const applied = await getAppliedMigrations(sql);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("All migrations are already applied.");
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
          await tx`insert into _migration_history (migration_name) values (${migrationFile})`;
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