# PowerShell Script Commands Guide (Firebase App Hosting Secrets - LEGACY REFERENCE ONLY)

Run these from the repository root.

## Deprecation Status (2026-04-11)

**ACTIVE APPS NO LONGER USE FIREBASE APP HOSTING.** The current production deployment is Vercel only.

These scripts are retained for:
- Legacy reference only in case emergency App Hosting rollback is required
- Historical context and documentation
- This guide should NOT be used for new deployment workflows

- `scripts/firebase` is deprecated and does NOT support the current Vercel+Supabase deployment.
- Do not add new operational responsibilities to these scripts.
- Removal is deferred until: legacy rollback capability fully tested and alternative documented

## Preflight checks

```powershell
Test-Path .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
Test-Path .\.env.local
```

## Dry-run validation (safe first command)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -DryRun -NonInteractive -SkipGrantAccess
```

## Apply secrets (interactive)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
```

## CI / non-interactive apply

Use this only when required values are already present in session env vars or `.env.local`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -NonInteractive
```

## Useful optional flags

Include optional secrets even when values are missing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -IncludeOptional
```

Target a single secret by name:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -OnlySecretName google-ai-api-key
```

Skip backend grant-access (set value only):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -SkipGrantAccess
```

Skip `.env.example` key alignment validation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -SkipEnvTemplateValidation
```

## Current Settings phone-auth contract

- Settings phone verification now uses the canonical Firebase Web flow only.
- The App Hosting secrets script does not manage any reCAPTCHA Enterprise keys for this feature.

## Post-change verification

```powershell
npm run lint --workspace @zootopia/web
npm run typecheck --workspace @zootopia/web
npm run build --workspace @zootopia/web
```