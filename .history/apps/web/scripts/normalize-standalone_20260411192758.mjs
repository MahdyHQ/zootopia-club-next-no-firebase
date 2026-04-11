import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptsDir, "..");
const workspaceRoot = resolve(appRoot, "../..");
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

const chromiumPackageTarget = resolve(standaloneRoot, "node_modules/@sparticuz/chromium");
const chromiumBinSource = [
  resolve(appRoot, "node_modules/@sparticuz/chromium/bin"),
  resolve(workspaceRoot, "node_modules/@sparticuz/chromium/bin"),
].find((candidate) => existsSync(candidate));

if (chromiumBinSource && existsSync(chromiumPackageTarget)) {
  /* The Pro PDF lane is the only standalone path that needs Chromium's compressed browser payload.
     Keep this explicit postbuild copy so standalone server bundles can launch the packaged
     browser in container runtimes without dragging the Fast HTML lane into the same runtime. */
  cpSync(chromiumBinSource, resolve(chromiumPackageTarget, "bin"), {
    force: true,
    recursive: true,
  });
}
