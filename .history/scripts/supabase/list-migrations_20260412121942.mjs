import { getSortedMigrationFiles, validateMigrationOrdering } from "./migration-files.mjs";

try {
  const files = getSortedMigrationFiles();
  validateMigrationOrdering(files);

  for (const file of files) {
    console.log(file);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
