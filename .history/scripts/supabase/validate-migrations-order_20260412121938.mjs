import { getSortedMigrationFiles, validateMigrationOrdering } from "./migration-files.mjs";

try {
  const files = getSortedMigrationFiles();
  validateMigrationOrdering(files);
  console.log(`Validated ${files.length} migration file(s).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
