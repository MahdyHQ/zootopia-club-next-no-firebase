import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/* Next 16 writes route-aware helpers and Turbopack server artifacts under `.next/dev`.
   If that dev cache is interrupted or left stale, later `next typegen` / `next build`
   can read malformed dev-only helpers, and `next dev` itself can boot into a broken
   half-written state where routes/manifests exist but the Turbopack SSR runtime chunk
   is missing. Keep this cleanup narrowly scoped to `.next/dev` so we recover from
   known corruption without blowing away the entire Next cache on every start. */
const nextDevCachePath = resolve(process.cwd(), ".next", "dev");
const nextDevServerPath = resolve(nextDevCachePath, "server");
const nextDevRoutesManifestPath = resolve(nextDevCachePath, "routes-manifest.json");
const nextDevAppPathsManifestPath = resolve(
  nextDevServerPath,
  "app-paths-manifest.json",
);
const nextDevDocumentEntryPath = resolve(nextDevServerPath, "pages", "_document.js");
const nextDevTurbopackRuntimePath = resolve(
  nextDevServerPath,
  "chunks",
  "ssr",
  "[turbopack]_runtime.js",
);

function removeNextDevCache(reason) {
  rmSync(nextDevCachePath, { recursive: true, force: true });
  console.log(`Removed stale Next dev cache: ${nextDevCachePath}`);
  if (reason) {
    console.log(`Reason: ${reason}`);
  }
}

function getNextDevCacheIntegrityFailure() {
  if (!existsSync(nextDevCachePath)) {
    return null;
  }

  /* `routes-manifest.json` is emitted alongside the dev server output. If the
     server/app manifests already exist but the top-level routes manifest does not,
     the dev cache is in a partially written state that caused `/contact` to crash
     with ENOENT during route resolution. */
  if (
    existsSync(nextDevAppPathsManifestPath) &&
    !existsSync(nextDevRoutesManifestPath)
  ) {
    return "server app paths manifest exists but routes-manifest.json is missing";
  }

  /* `_document.js` and route entrypoints import the generated Turbopack SSR runtime.
     If those entry files survived a previous dev session but `[turbopack]_runtime.js`
     did not, Next will throw MODULE_NOT_FOUND from `.next/dev/server/**` before the
     route can compile. Reset only this dev cache so the next boot regenerates it. */
  if (existsSync(nextDevDocumentEntryPath) && !existsSync(nextDevTurbopackRuntimePath)) {
    const documentEntry = readFileSync(nextDevDocumentEntryPath, "utf8");
    if (documentEntry.includes("[turbopack]_runtime.js")) {
      return "generated server entrypoints reference a missing Turbopack SSR runtime";
    }
  }

  return null;
}

const shouldOnlyResetInvalidCache = process.argv.includes("--if-invalid");
const integrityFailure = getNextDevCacheIntegrityFailure();

if (!existsSync(nextDevCachePath)) {
  console.log(`Skipped missing Next dev cache: ${nextDevCachePath}`);
} else if (shouldOnlyResetInvalidCache) {
  if (integrityFailure) {
    removeNextDevCache(integrityFailure);
  } else {
    console.log(`Kept healthy Next dev cache: ${nextDevCachePath}`);
  }
} else {
  removeNextDevCache("unconditional reset requested");
}
