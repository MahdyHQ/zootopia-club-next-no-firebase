# Zootopia Club Next

Zootopia Club Next is the simplified 2026 monorepo rebuild of the Zootopia Club platform.

## Monorepo

- `apps/web`: canonical Next.js 16.2.2 App Router application inside the monorepo
- `apps/api`: future extraction boundary, no live traffic in the current runtime shape
- `packages/shared-config`: app constants, routes, feature flags, model catalog
- `packages/shared-types`: shared request, response, auth, document, assessment, infographic, and admin types
- `packages/shared-utils`: pure helpers, RTL helpers, upload policy, validation
- `firebase`: Firestore and Storage rules

The project root is the monorepo manager only. It intentionally does not act as a second Next.js app.

## Product Scope

- Google Sign-In
- Home, Assessment, Infographic, Settings
- Admin overview and users management
- Light and dark mode
- Arabic and English
- File upload and document extraction
- Provider and model switching

Excluded from the initial build:

- Billing and unlock systems
- Inbox or communication center
- Live voice, chatbot, study tools, video generation
- Legacy Firebase Hosting + Cloud Run deployment assumptions as the default mental model

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Deployment Paths

- Active repo target: Firebase App Hosting, with `firebase.json` pointing the App Hosting backend at `./apps/web`
- `apps/web` remains the only canonical Next.js app inside the monorepo
- `apps/web/apphosting.yaml` is the canonical web deployment config for the Next.js runtime
- Firestore rules/indexes and Storage rules still deploy from the root Firebase config
- Legacy reference only: classic Firebase Hosting framework preview and Hosting + Cloud Run

Official Firebase docs currently say:
- Firebase Hosting framework support for Next.js is a preview path
- new participation in the Hosting frameworks experiment is closed
- Firebase recommends App Hosting for new full-stack Next.js apps

This repo now follows that recommendation directly and uses App Hosting as the single canonical web deployment path.

Canonical deploy commands:

```bash
npm run firebase:deploy
npm run firebase:app:deploy
npm run firebase:rules:deploy
```

## Environment

Important runtime groups:

- Public web env: `NEXT_PUBLIC_SUPABASE_*`
- Server env: `SUPABASE_SERVICE_ROLE_KEY`, Firebase server data/storage credentials, admin email config, and AI provider keys
- Firestore target: `zootopia-club-next-database`
- Local development source of truth: root `.env.local`
- Code-managed deploy config source of truth: `apps/web/apphosting.yaml`
- Secret values source of truth: Cloud Secret Manager (referenced from `apps/web/apphosting.yaml`)

## Docs

- Main project guide: [Guide-Files/Zootopia_Club_Next_16_2_2_Simplified_Monorepo_Guide_2026_WORKSPACE_UPDATED.md](C:/zootopia-club-next/Guide-Files/Zootopia_Club_Next_16_2_2_Simplified_Monorepo_Guide_2026_WORKSPACE_UPDATED.md)
- Architecture notes: [docs/architecture.md](C:/zootopia-club-next/docs/architecture.md)
- App Hosting env/secrets beginner guide (classification, precedence, reserved names, safe admin-password rotation): [docs/app-hosting-env-secrets-beginner-guide.md](C:/zootopia-club-next/docs/app-hosting-env-secrets-beginner-guide.md)
- Ledger: [zootopia-club-next-ledger.txt](C:/zootopia-club-next/zootopia-club-next-ledger.txt)
