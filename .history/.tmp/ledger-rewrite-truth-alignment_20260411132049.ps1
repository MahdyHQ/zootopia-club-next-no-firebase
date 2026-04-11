$path = "zootopia-club-next-ledger.txt"
$content = Get-Content $path -Raw

function Replace-Section {
  param(
    [string]$Text,
    [string]$StartHeading,
    [string]$EndHeading,
    [string]$Body
  )

  $pattern = "(?ms)^" + [regex]::Escape($StartHeading) + "\r?\n.*?(?=^" + [regex]::Escape($EndHeading) + "\r?$)"
  $replacement = $StartHeading + "`r`n" + $Body.TrimEnd() + "`r`n"

  return [regex]::Replace(
    $Text,
    $pattern,
    [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement },
    1
  )
}

$content = [regex]::Replace(
  $content,
  "(?m)^Last refreshed: .*$",
  "Last refreshed: 2026-04-11 01:45:00",
  1
)

$content = Replace-Section $content "Current Truth Snapshot" "Guide Alignment Notes" @'
- `apps/web` is the only live application/runtime surface.
- `apps/api` is a future extraction boundary only and does not serve active production traffic.
- Active stack: Auth.js session cookies + Supabase Auth + Supabase Postgres + Supabase Storage.
- Active deployment target: Vercel (`vercel.json` points to `apps/web`).
- Active backend surface: same-origin App Router Route Handlers under `apps/web/app/api/**/route.ts`.
- Server authority stays in `apps/web/lib/server/*` with owner-scoped checks for data/artifact access.
- Root `.env.local` is the canonical local env source; production env is managed in Vercel.
- Supabase schema source of truth is `supabase/migrations/*.sql`.
- `apps/web/apphosting.yaml` and `docs/legacy-reference/*` are retained for legacy rollback/reference only.
- Firebase/Firestore/Firebase Hosting/Firebase App Hosting references are historical unless a section explicitly marks them active (none in current runtime sections).
'@

$content = Replace-Section $content "Guide Alignment Notes" "Current Repo Reality Versus Older Audit Checklists" @'
- The guide remains the main architecture reference.
- The repo intentionally differs from older guide assumptions in verified areas:
  - `apps/api` is present but deferred.
  - npm workspaces are used instead of pnpm/Turborepo.
  - `packages/ui` is not currently present.
  - Active deployment/runtime truth is Vercel + Supabase + Auth.js.
  - Firebase App Hosting guidance is legacy/reference-only in this repo state.
'@

$content = Replace-Section $content "Important Folders And Files" "Route Map" @'
- Root
  - `package.json`
  - `.env.example`
  - `vercel.json`
  - `supabase/migrations/*.sql`
  - `zootopia-club-next-ledger.txt`
- `apps/web`
  - `app/` (App Router pages + Route Handlers)
  - `components/`
  - `lib/server/` (auth, repository, storage, AI runtime, admin guards)
  - `auth.ts` (Auth.js config + credential providers)
  - `next.config.ts`
  - `apphosting.yaml` (legacy rollback/reference only)
  - `scripts/normalize-standalone.mjs`
- `apps/api`
  - placeholder workspace package for future backend extraction only
- Shared packages
  - `packages/shared-config`
  - `packages/shared-types`
  - `packages/shared-utils`
- Legacy/reference folders
  - `firebase/` (legacy Firebase-era rules/index artifacts)
  - `docs/legacy-reference/` (historical deployment/runtime material)
'@

$content = Replace-Section $content "API Map" "Backend Runtime And Service Ownership" @'
- Core/runtime
  - `GET /api/health`
- Public contact/support
  - `POST /api/contact`
- Auth/session
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
  - `GET|POST /api/auth/[...nextauth]`
  - `POST /api/auth/bootstrap` (deprecated, returns 410)
- Admin auth
  - `POST /api/auth/admin/resolve-identifier`
  - `POST /api/auth/admin/bootstrap` (deprecated, returns 410)
- User protected APIs
  - `POST /api/uploads`
  - `DELETE /api/uploads`
  - `GET /api/uploads/[id]`
  - `POST /api/assessment`
  - `GET /api/assessment/[id]`
  - `GET /api/assessment/credits`
  - `GET /api/assessment/linked-document`
  - `GET /api/assessment/results/[id]`
  - `GET /api/assessment/export/json/[id]`
  - `GET /api/assessment/export/markdown/[id]`
  - `GET /api/assessment/export/docx/[id]`
  - `GET /api/assessment/export/pdf/[id]` (compat redirect)
  - `GET /api/assessment/export/pdf/pro/[id]`
  - `GET /api/assessment/export/pdf/fast/[id]`
  - `POST /api/infographic`
  - `GET /api/infographic/[id]`
  - `PATCH /api/users/me/profile`
- Admin APIs
  - `GET /api/admin/overview`
  - `GET /api/admin/users`
  - `GET /api/admin/users/export`
  - `PATCH /api/admin/users/[uid]/role`
  - `PATCH /api/admin/users/[uid]/status`
  - `PATCH /api/admin/users/[uid]/credits`
- Internal maintenance
  - `POST /api/internal/maintenance/expired-uploads`
'@

$content = Replace-Section $content "Backend Runtime And Service Ownership" "Auth And Session Architecture" @'
- The active backend is the Next App Router server surface in `apps/web/app/api`, not `apps/api`.
- Live route handlers stay on Node runtime due cookie/session handling, multipart uploads, and server-side generation/export work.
- Server-only responsibility split
  - `apps/web/app/api/**/route.ts`: request parsing, auth gating, response shaping
  - `apps/web/auth.ts`: Auth.js credentials providers, token verification, JWT/session callbacks
  - `apps/web/lib/server/session.ts`: request-bound session resolution and route/API guards
  - `apps/web/lib/server/repository.ts`: Supabase-backed persistence through `zc_entities` adapter contracts plus local in-memory fallback for degraded/dev runtime
  - `apps/web/lib/server/document-runtime.ts`: upload validation, markdown extraction orchestration, and binary lifecycle operations
  - `apps/web/lib/server/assessment-*`: owner-scoped assessment save/read/export/retention contracts
  - `apps/web/lib/server/supabase-admin.ts`, `apps/web/lib/server/server-auth.ts`: server auth/runtime adapters
- `apps/api` remains a deliberate future extraction boundary only.
'@

$content = Replace-Section $content "Auth And Session Architecture" "Admin Login Architecture" @'
- Session model
  - One secure httpOnly session cookie: `zc_session`
  - Preference cookies: `zc_theme`, `zc_locale`
  - Cookie keys are defined in `packages/shared-config/src/env.ts`
- Active auth flow
  - Auth.js credentials providers (`user-credentials`, `admin-credentials`) are active in `apps/web/auth.ts`
  - Clients submit Supabase access tokens (`idToken`) to Auth.js handlers
  - Server verifies tokens through `getServerAuthAdmin().verifyIdToken(...)`
  - Session strategy is Auth.js JWT with server-side callback normalization
- Endpoint ownership
  - `GET|POST /api/auth/[...nextauth]` is the active auth handler surface
  - `/api/auth/bootstrap` and `/api/auth/admin/bootstrap` are deprecated endpoints that return 410 migration signals
  - `/api/auth/me` remains the app-specific authenticated session/runtime status endpoint
- Route protection
  - `apps/web/proxy.ts` remains optimistic redirect support only
  - authoritative guards remain server-side via session helpers (`requireAuthenticatedUser`, `requireCompletedUser`, `requireAdminUser`)
'@

$content = Replace-Section $content "Admin Login Architecture" "Mandatory Profile Completion Architecture" @'
- Admin authority inputs
  - allowlisted admin emails from `ZOOTOPIA_ADMIN_EMAILS`
  - supported username aliases resolved by `POST /api/auth/admin/resolve-identifier`
- Admin session issuance requirements (active flow in `apps/web/auth.ts`)
  - valid/recent Supabase access token
  - email/password provider identity (`password` provider)
  - allowlisted email
  - claim validation (`admin` claim must not be explicit deny)
  - active account status
- Admin access is no longer gated by a shared runtime password variable; `ZOOTOPIA_ADMIN_LOGIN_PASSWORD` is legacy/deprecated context only.
- Key files
  - `apps/web/auth.ts`
  - `apps/web/lib/server/admin-auth.ts`
  - `apps/web/app/api/auth/admin/resolve-identifier/route.ts`
  - `apps/web/app/api/auth/admin/bootstrap/route.ts` (deprecated response)
'@

$content = Replace-Section $content "Firebase Integration" "AI, Model, And Provider Orchestration" @'
- Firebase-era assets are retained only as historical or rollback-reference material.
- No active runtime path depends on Firebase Auth, Firestore, Firebase Storage, Firebase Hosting, or Firebase App Hosting as primary services.
- Legacy references remain in:
  - `firebase/*` (rules/index archive)
  - `apps/web/apphosting.yaml` (legacy rollback contract)
  - `docs/legacy-reference/*` and legacy operational notes
- Transitional `scripts/firebase/*` remain for controlled legacy operations and should not be expanded as active architecture.
'@

$content = Replace-Section $content "Firestore, Storage, Rules, And Indexes Strategy" "Environment Strategy" @'
- Firebase Firestore/Storage rules and indexes in this repo are reference/rollback artifacts, not active runtime enforcement.
- Active data/storage authorization is enforced server-side through Auth.js session context plus owner-scoped repository/storage guards.
- Active durable persistence target is Supabase Postgres (`zc_entities`) and active object storage target is Supabase Storage (`zootopia-private`).
- Any Firebase rules/index edits should be treated as explicit legacy-maintenance tasks, not current product runtime changes.
'@

$content = Replace-Section $content "Environment Strategy" "Deployment Strategy" @'
- Public browser-safe env vars
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - optional alias: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Private server env vars (active runtime)
  - `AUTH_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DATABASE_URL` (or `DATABASE_URL` alias)
  - `ZOOTOPIA_ADMIN_EMAILS`
  - `ZOOTOPIA_SESSION_TTL_SECONDS`
  - `ZOOTOPIA_DEFAULT_DAILY_ASSESSMENT_CREDITS`
- Private contact/env vars
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `CONTACT_FORM_TO`
- Private AI env vars
  - `GOOGLE_AI_API_KEY`
  - `DASHSCOPE_API_KEY`
  - optional model/endpoint overrides (`GOOGLE_AI_MODEL`, `GOOGLE_AI_ADVANCED_MODEL`, `QWEN_MODEL`, `DASHSCOPE_BASE_URL`, aliases)
- Local/production contracts
  - `.env.example` is the canonical template
  - root `.env.local` is the canonical local runtime source
  - Vercel project env settings are the canonical production source
- Legacy Firebase env keys remain compatibility-only and do not define active runtime truth.
'@

$content = Replace-Section $content "Deployment Strategy" "Shared Packages And Responsibilities" @'
- Active deployment wiring
  - Vercel is the only active/canonical deployment target
  - `vercel.json` points the deployed app root to `apps/web`
- Local integrated development
  - frontend and backend run through `apps/web` (same-origin `/api/*` route handlers)
  - Auth.js cookie/session behavior remains host-scoped and server-verified
- Legacy/reference deployment paths
  - Firebase App Hosting and Firebase Hosting + Cloud Run are historical/reference-only in this repo state
  - `apps/web/apphosting.yaml` and `docs/legacy-reference/*` remain rollback/reference assets only
- `apps/api` still represents a future extraction boundary and is not a deployed backend service.
'@

$content = Replace-Section $content "Shared Packages And Responsibilities" "Feature Flags And Intentional Runtime Toggles" @'
- `packages/shared-config`
  - app identity
  - route/env keys
  - feature flags
  - AI model catalog
- `packages/shared-types`
  - shared auth/session/user/API contracts
  - document/assessment/infographic/admin contracts
- `packages/shared-utils`
  - validation helpers
  - upload policy
  - RTL/date/pure utility helpers
  - no secrets and no server-only side effects
'@

$content = Replace-Section $content "Feature Flags And Intentional Runtime Toggles" "Current Feature Set" @'
- `packages/shared-config/src/features.ts` currently encodes:
  - `appHostingFirst: false` (legacy compatibility marker)
  - `enableAppsApiTraffic: false`
  - `enableBilling: false`
  - `enableChat: false`
- These flags support current runtime direction:
  - `apps/api` traffic remains intentionally off
  - billing and chat remain intentionally disabled in the present product phase
'@

$content = Replace-Section $content "Important Reusable Files And Modules" "Important Scripts And Commands" @'
- Auth and routing
  - `apps/web/auth.ts`
  - `apps/web/lib/server/session.ts`
  - `apps/web/lib/server/admin-auth.ts`
  - `apps/web/lib/return-to.ts`
  - `apps/web/proxy.ts`
- Persistence and data flow
  - `apps/web/lib/server/repository.ts`
  - `apps/web/lib/server/zootopia-firestore-pg.ts` (legacy-named adapter targeting Supabase Postgres)
  - `apps/web/lib/server/document-runtime.ts`
  - `apps/web/lib/server/document-markdown.ts`
- AI orchestration
  - `apps/web/lib/server/ai/execution.ts`
  - `apps/web/lib/server/ai/provider-runtime.ts`
  - `packages/shared-config/src/models.ts`
- Validation and contracts
  - `packages/shared-utils/src/validation.ts`
  - `packages/shared-types/src/auth.ts`
  - `packages/shared-types/src/user.ts`
  - `packages/shared-types/src/api.ts`
- UI shells
  - `apps/web/app/globals.css`
  - `apps/web/components/ui/vital-background.tsx`
  - `apps/web/components/ui/button.tsx`
  - `apps/web/components/ui/input.tsx`
  - `apps/web/lib/utils.ts`
  - `apps/web/components/layout/shell-nav.tsx`
  - `apps/web/components/auth/login-panel.tsx`
  - `apps/web/components/auth/admin-login-panel.tsx`
  - `apps/web/components/settings/profile-settings-form.tsx`
'@

$content = Replace-Section $content "Important Scripts And Commands" "Important Security Assumptions And Trust Boundaries" @'
- Root commands
  - `npm run dev`
  - `npm run dev:web`
  - `npm run build`
  - `npm run build:web`
  - `npm run lint`
  - `npm run lint:web`
  - `npm run typecheck`
  - `npm run typecheck:web`
  - `npm run check`
  - `npm run check:web`
  - `npm run clean:web`
  - `npm run rebuild:web`
  - `npm run start`
  - `npm run start:web`
- Legacy maintenance scripts (reference/compatibility only)
  - `npm run firebase:admin:bootstrap-env`
  - `npm run firebase:admin:set-claims`
  - `npm run firebase:admin:set-passwords`
  - `npm run firebase:rules:deploy`
  - `scripts/firebase/*`
'@

$content = Replace-Section $content "Important Security Assumptions And Trust Boundaries" "Current Behavior And Boundaries" @'
- Server-side verification is the trust boundary; client UI state is never authoritative.
- Browser clients do not access Supabase service-role credentials, Postgres connections, or private storage paths directly.
- Owner-scoped data/artifact paths are enforced server-side before read/write/delete operations.
- `proxy.ts` is optimistic-only and never the final authorization layer.
- Admin authority requires allowlisted identity plus server-side claim/status checks.
- Deprecated bootstrap endpoints (`/api/auth/bootstrap`, `/api/auth/admin/bootstrap`) intentionally return 410 and must not be treated as active auth issuance paths.
- Session cookie (`zc_session`) remains the authoritative long-lived session handle.
- Secrets and provider keys must remain outside client bundles and browser-visible env surfaces.
'@

$content = Replace-Section $content "Current Behavior And Boundaries" "Generated Artifacts And Non-Source-Of-Truth Paths" @'
- Anonymous user
  - can access `/login` and `/admin/login`
  - is redirected away from protected routes by proxy and/or server guards
- Authenticated non-admin with incomplete profile
  - can hold a valid Auth.js session cookie
  - is redirected to `/settings`
  - cannot access `/`, `/assessment`, `/infographic`, or protected user APIs until completion is saved and re-read
- Authenticated non-admin with completed profile
  - can access the full user workspace
  - lands on `/upload` after successful login/profile completion
  - can use uploads and assessment generation
  - sees Infographic as a coming-soon UI lock for non-admin users
- Authenticated admin
  - uses the dedicated admin login flow
  - is protected by allowlist + claim/status checks
  - is exempt from the non-admin profile-completion gate
  - lands in `/admin` after successful admin login
  - retains infographic studio access
- Suspended user
  - cannot start or continue a valid session regardless of route intent
'@

$content = $content -replace "(?m)^Firebase Integration$", "Legacy Firebase Integration (Historical/Inactive)"
$content = $content -replace "(?m)^Firestore, Storage, Rules, And Indexes Strategy\s*$", "Legacy Firebase Rules, Storage Rules, And Indexes (Reference Only)"

Set-Content -Path $path -Value $content -NoNewline
Write-Output "LEDGER_REWRITE_OK"
