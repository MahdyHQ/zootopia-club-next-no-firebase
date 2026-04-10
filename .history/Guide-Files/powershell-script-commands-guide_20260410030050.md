# PowerShell Script Commands Guide (Firebase App Hosting Secrets)

Run these from the repository root.

## Deprecation Status (2026-04-10)

- `scripts/firebase` is deprecated for long-term operations but retained for current App Hosting secret workflows.
- Do not add new operational responsibilities to these scripts.
- Removal criteria:
- A replacement App Hosting secret workflow is documented and approved.
- `apps/web/apphosting.yaml` and this runbook are updated to that replacement.
- At least one non-interactive secret rotation succeeds using the replacement path.

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