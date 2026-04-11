import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const migrationsDir = resolve(root, "supabase/migrations");
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error("No SQL migrations found in supabase/migrations.");
  process.exit(1);
}

const timestampPattern = /^(\d{14})_.+\.sql$/;
let previous = "";

for (const file of files) {
  const match = file.match(timestampPattern);
  if (!match) {
    console.error(`Invalid migration name: ${file}`);
    process.exit(1);
  }

  const timestamp = match[1];
  if (!timestamp || timestamp <= previous) {
    console.error(`Migration order violation: ${file}`);
    process.exit(1);
  }

  previous = timestamp;
}

console.log(`Validated ${files.length} migration file(s).`);
