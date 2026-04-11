import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const migrationsDir = resolve(root, "supabase/migrations");
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of files) {
  console.log(file);
}
