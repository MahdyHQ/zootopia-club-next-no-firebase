<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, runtime behavior, file structure, routing, caching, rendering, and deployment assumptions may all differ from older Next.js knowledge. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices and prefer current official conventions over memory.

Implementation philosophy:
- Prefer intelligent repair over destructive removal.
- Write mature, careful, production-grade code.
- If you encounter a bug, drift, or broken behavior, first understand why the existing code exists before changing it.
- Do not casually delete important logic, guards, compatibility code, or defensive fallbacks.
- Prefer to fix, reconnect, harden, extend, or refine existing code paths instead of removing them.
- Only remove code when you can clearly prove it is dead, harmful, duplicated beyond doubt, or safely replaced.
- Favor additive hardening, better fallbacks, stronger validation, clearer error handling, safer composition, and tighter ownership boundaries over aggressive code deletion.
- Preserve useful architecture and working behavior whenever possible.
- If a feature is partially broken, prefer repairing and completing it rather than replacing it from scratch.
- If you must remove something, explain exactly why it is safe to remove and what now replaces it.

Reality-first rule:
- Always treat the CURRENT CODEBASE as the primary source of truth.
- Treat official documentation and actual runtime behavior as higher authority than notes, memory, or historical summaries.
- Treat `zootopia-club-next-ledger.txt` as a platform-understanding aid, historical log, and architectural orientation tool only.
- The ledger is NOT the final source of truth.
- Never assume the ledger is fully up to date.
- Always compare the ledger against the real current codebase before editing anything.
- If the ledger and the code disagree, trust the real current code and verify with docs/runtime behavior.
- Use the ledger to understand context, intent, old decisions, and previous risks — not as unquestioned truth.

Research-first rule (2026):
- Always research when needed.
- Always check official documentation for every framework, library, platform, API, runtime, tool, or feature you touch.
- Do not rely on memory alone when official docs are available.
- Search for solutions when needed instead of guessing.
- Prefer official docs first, then other trustworthy technical sources if needed.
- When behavior is unclear, unstable, version-sensitive, environment-sensitive, or recently changed, verify before implementing.
- Never hallucinate modern framework behavior.
- Always bias toward fresh verification over remembered assumptions.
-search on web with now time and latest docs versions.
Mandatory workflow:
- Always read `zootopia-club-next-ledger.txt` completely at the start of every task before doing anything else.
- Treat the ledger as project memory and historical context, not final truth.
- Always analyze the current codebase first before making changes.
- Read all relevant files fully before editing.
- Trace imports, exports, route ownership, shared contracts, authority boundaries, and state flow before editing.
- Identify the smallest safe edit surface before making changes.
- Never rebuild from scratch unless explicitly requested.
- Never redesign the architecture unless explicitly requested.
- Never remove working features unless explicitly requested.
- Never change unrelated areas.
- Make only minimal, surgical, backward-compatible changes.

Authority and safety rules:
- Preserve the current live runtime ownership unless a narrow change is strictly required.
- Keep backend authority on the backend.
- Never expose secrets, API keys, credentials, or privileged logic to the browser.
- Preserve owner-scoped behavior, admin boundaries, repository boundaries, and canonical server truth.
- Do not create client-side fake truth for protected data, balances, permissions, gates, counters, or stateful capacity systems.
- Prefer fail-closed behavior for normal protected flows unless there is a strong reason otherwise.
- Use best-effort only for non-decisive cleanup paths.

Dependency discipline:
- Do not add unnecessary packages.
- If a dependency change is required, justify it clearly and keep it minimal.
- Always inspect package manifests and lockfiles before changing dependencies.

Architecture and UI discipline:
- Prefer official conventions over ad-hoc patterns.
- Keep shared state separate from shared page UI.
- A page may reference another page’s state, but must not become a second copy of that page.
- Preserve dark mode, light mode, localization, and the current design language.
- Always consider responsive behavior across all screen sizes.
- Test and verify UI across small mobile, mobile, tablet, laptop, desktop, and ultra-wide screens.

Comments and maintainability:
- Always add strong professional code comments to every meaningful new logic block, layout guard, UI behavior, overflow fix, z-index fix, shared styling rule, background-scope rule, and architecture-sensitive code you introduce.
- Each important comment must clearly explain:
  - what this code controls
  - why it exists
  - which page / feature / scope it belongs to
  - what future agents should be careful not to break
- Comments must be accurate, concise, maintainable, and genuinely useful.
- Do not add noisy or obvious comments.
- Prefer high-value comments in shared files, tricky UI logic, scoped background behavior, dropdown rendering fixes, cross-page layout rules, auth/admission logic, lease/capacity logic, and ownership-sensitive code.

Verification discipline:
- Run lint, typecheck, and build after meaningful changes whenever possible.
- Clearly distinguish verified facts from assumptions.
- Distinguish code-traced proof from runtime-verified proof.
- When live verification is not possible, say so explicitly instead of implying certainty.

Ledger refresh rule:
- At the end of every task, refresh `zootopia-club-next-ledger.txt` thoroughly.
- Replace stale current-state information in the ledger with the new truth while preserving useful history.
- Record all meaningful changes, decisions, risks, files changed, and verification results in the ledger.
- Never let the ledger overwrite reality in your reasoning.
- The ledger should be updated to reflect the code — not the other way around.
DATABASE / MIGRATION DISCIPLINE RULES — NON-NEGOTIABLE (2026)

You must always treat the latest valid database schema and latest applied migrations as the canonical source of truth.

Core rule:
- New backend/database work must read from and write to the newest canonical tables/columns only.
- Do not keep old and new tables active together unless there is a clearly justified, explicitly documented, temporary migration bridge.
- Do not leave legacy bridges, fallback reads, dual writes, or mixed truth paths behind as permanent architecture.

Before starting any task that touches backend, data, auth, storage, usage, wallet, credits, documents, results, or admin flows, you must first do a schema audit:

1. Read the latest migrations carefully.
2. Identify the newest canonical tables and columns.
3. Identify any old tables, old columns, fallback reads, bridge logic, or stale compatibility code.
4. Verify which tables the backend currently reads from.
5. Verify which tables the backend currently writes to.
6. Verify relations, foreign keys, unique constraints, indexes, RLS/security assumptions, and ownership boundaries.
7. Verify that repository/service/backend code is aligned with the newest schema.
8. Verify that no old table is still being treated as hidden truth by mistake.

Canonical schema policy:
- Always prefer the newest schema.
- Always prefer the newest migrations.
- Always prefer the modern structured tables over legacy storage or compatibility layers.
- Never assume old tables should remain active just because they still exist.
- Existing old tables must be treated as migration debt to be eliminated safely, not preserved casually.

Read/write policy:
- Backend must read from canonical latest tables.
- Backend must write to canonical latest tables.
- Do not introduce new logic that writes to old tables.
- Do not introduce new logic that depends on old fallback reads.
- Do not keep dual-write or dual-read behavior unless absolutely required for a controlled migration rollout.
- If temporary compatibility is required, document it clearly and remove it after cutover.

Migration policy:
- If the task needs new backend data structures, create a proper migration.
- Do not hack around missing schema using ad-hoc code-only workarounds.
- Add new tables/columns/indexes/constraints only through migrations.
- Migrations must be minimal, safe, precise, and professionally named.
- Migrations must preserve data unless explicit removal is intended and proven safe.
- If a migration replaces older structures, also plan the cutover and cleanup path.

Legacy cleanup policy:
- If old tables/columns are no longer needed and safe removal is justified, remove them carefully and explicitly.
- Do not leave dead schema behind without reason.
- Do not keep ambiguous old structures that make future maintenance harder.
- However, never delete old schema blindly.
- First prove:
  1. no runtime reads depend on it
  2. no runtime writes depend on it
  3. needed data has been backfilled or migrated
  4. rollback implications are understood

Pre-change database checklist:
- What are the newest canonical tables?
- What old tables still exist?
- What code still touches old tables?
- Are reads and writes aligned to the same truth source?
- Are relations and ownership boundaries correct?
- Are indexes sufficient?
- Are columns semantically clear and enough for the feature?
- Is owner-scope preserved?
- Is admin scope preserved?
- Does this backend task require a new migration?

Owner-scope and backend truth:
- Always ensure owner-scoped data remains owner-scoped in the database and backend.
- Verify that user A cannot read/write user B’s data.
- Verify backend repository methods are scoped correctly.
- Verify admin-only flows are explicitly gated.
- Verify storage/document/result/accounting linkage matches authenticated owner identity.

Backend connection discipline:
- Always verify that the backend is actually connected to the intended latest schema path.
- Always verify repository/service methods align with the newest migrations.
- Always verify route handlers call the correct canonical repository methods.
- Never leave misleading names or dead repository paths that point to old schema shapes.

Naming discipline:
- Table names, column names, repository methods, and service functions must reflect real current architecture.
- Rename misleading legacy-specific or outdated names when needed.
- Do not let old naming hide new truth.
- Keep the schema/domain understandable for future scaling.

When doing any backend task:
- First inspect migrations and current canonical schema.
- Then inspect repository/service/route ownership.
- Then implement schema changes if needed.
- Then cut code over to the newest schema.
- Then remove or isolate old dependencies.
- Only after the system is coherent, run final verification.

Verification requirements after DB/backend work:
- Verify reads use newest canonical tables.
- Verify writes use newest canonical tables.
- Verify no accidental legacy dependency remains.
- Verify migrations are valid.
- Verify owner scope.
- Verify admin scope.
- Verify auth/data/storage integration still works.
- Verify the ledger is updated with exact schema truth.

Documentation rule:
- Always record:
  - which tables are canonical now
  - which legacy tables remain
  - which legacy paths were removed
  - which migrations were added
  - whether cutover is complete or partial
  - what still needs future cleanup

Never do these:
- never trust old tables by default
- never add new backend features without checking migrations first
- never write to stale tables just because they still exist
- never keep mixed truth sources without explicit reason
- never leave migration debt undocumented
- never create database chaos that makes future search and maintenance harder

Goal:
Keep the database fresh, canonical, understandable, scalable, owner-safe, and aligned with the newest backend architecture at all times.
<!-- END:nextjs-agent-rules -->
