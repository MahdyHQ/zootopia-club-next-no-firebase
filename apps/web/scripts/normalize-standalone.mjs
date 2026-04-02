import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptsDir, "..");
const standaloneRoot = resolve(appRoot, ".next/standalone");
const nestedAppRoot = resolve(standaloneRoot, "apps/web");

if (!existsSync(nestedAppRoot)) {
  process.exit(0);
}

for (const entryName of [".next", "package.json", "server.js"]) {
  const sourcePath = resolve(nestedAppRoot, entryName);

  if (!existsSync(sourcePath)) {
    continue;
  }

  cpSync(sourcePath, resolve(standaloneRoot, entryName), {
    force: true,
    recursive: true,
  });
}
