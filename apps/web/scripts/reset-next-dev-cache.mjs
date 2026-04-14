import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/* Next 16 writes route-aware helpers under `.next/dev/types` during dev/typegen work.
   If that dev cache is interrupted or left stale, later `next typegen` / `next build`
   runs can read malformed dev-only route helpers and fail type checking even though the
   clean production `.next/types` output is valid. Keep this cleanup narrowly scoped to
   the dev cache so build/typecheck recover without blowing away the whole Next cache. */
const nextDevCachePath = resolve(process.cwd(), ".next", "dev");

if (existsSync(nextDevCachePath)) {
  rmSync(nextDevCachePath, { recursive: true, force: true });
  console.log(`Removed stale Next dev cache: ${nextDevCachePath}`);
} else {
  console.log(`Skipped missing Next dev cache: ${nextDevCachePath}`);
}
