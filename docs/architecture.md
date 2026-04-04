# Zootopia Club Next Architecture

## Runtime Ownership

- `C:\zootopia-club-next` is the monorepo root and owns workspace/package-manager, shared lint/type/build orchestration, Firebase root config, docs, and shared package coordination.
- `apps/web` owns the canonical Next.js App Router application, its Next-specific config, theme and locale providers, Firebase client integration, and the current route-handler runtime.
- `apps/api` is present as a future extraction boundary and does not receive live traffic in the current runtime shape.
- `packages/shared-*` hold contracts, pure helpers, and configuration only.

## Current Truth

- Root scripts orchestrate workspaces instead of acting like a deleted root Next app.
- Root Next-only leftovers (`next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, root `.next`) were accidental artifacts and are not part of the canonical structure.
- `apps/web` is the only active Next.js runtime.
- `apps/web/app/api/**/route.ts` is the live backend surface for auth, uploads, assessment, infographic, and admin operations.
- `proxy.ts` is used only for optimistic request-time redirects. Server layouts and route handlers remain the authoritative auth gates.
- `apps/api` remains a placeholder workspace package so the monorepo still expresses the intended future backend boundary without pretending it is active today.

## Deployment Paths

### Local Development

- `apps/web` runs the UI and same-origin route handlers.
- `apps/api` stays idle unless explicitly developed later.
- Firebase Admin and provider keys remain server-only, and document uploads use the direct-file runtime inside `apps/web`.

### Firebase App Hosting

- Active and only canonical web deployment target.
- Root `firebase.json` points App Hosting at `./apps/web`, and `apps/web/apphosting.yaml` lives beside the canonical Next.js app so rollouts build from the correct subdirectory in the monorepo.
- Firestore rules/indexes and Storage rules still deploy from the same root Firebase config.
- This avoids the unsupported classic Firebase Hosting framework-preview path for the Next.js 16 app.

### Netlify

- Secondary future target.
- Deploy `apps/web` with the same App Router and route-handler structure.

### Legacy Firebase Hosting + Cloud Run

- Documentation-only migration context.
- Legacy config was moved to `docs/legacy-reference`.

## Database Target

- Firebase project: `zootopia2026`
- Firestore database: `zootopia-club-next-database`

The named Firestore database must be wired explicitly anywhere Firebase Admin or client Firestore access is used. Firestore multi-database is a supported product feature, but the Firebase Admin Node database-id overload still needs cautious treatment because the reference labels it as preview.
