# Legacy Firebase App Hosting Env and Secrets Guide (Reference)

This document is historical/rollback reference only.
The active production env contract is Vercel + Supabase + Auth.js.

## What this guide guarantees

- It classifies each important env family by purpose, sensitivity, and where it belongs.
- It preserves safe handling patterns for Firebase App Hosting if a legacy rollback is ever required.
- It keeps backend authority on server-side routes and secrets only.
- It explains what was automatic vs manual in App Hosting.

## Quick decisions

- Active deployments use Vercel project environment variables.
- Use apps/web/apphosting.yaml only as legacy App Hosting rollback/reference material.
- Keep real secret values in Cloud Secret Manager only.
- Configure ZOOTOPIA_ADMIN_LOGIN_PASSWORD as a runtime secret for the admin bootstrap gate.
- Keep .env.example as documentation/template only.
- Keep .env.local as local machine runtime values only.
- Keep Firebase Console overrides empty unless a controlled legacy rollback needs them.

## Beginner basics

### YAML vs JSON (legacy App Hosting context)

- YAML uses indentation and list dashes. The legacy App Hosting config file uses YAML.
- JSON uses braces and commas. It is not the format used for apphosting.yaml.

### tsconfig.json vs apphosting.yaml

- tsconfig.json configures TypeScript compiler/type behavior.
- apphosting.yaml configured legacy App Hosting runtime/build env and secrets.
- They solve different problems and must not be mixed.

### .env.local vs .env.example

- .env.local: real local values on your machine.
- .env.example: template only, no real secrets.

## Variable family classification

Legend:

- Sensitivity: public, internal, secret
- Deploy location: apphosting non-secret value, apphosting secret reference, or system-managed

| Family | Keys | Sensitivity | Required or optional | Local (.env.local) | Deployed (Legacy App Hosting) |
| --- | --- | --- | --- | --- | --- |
| Supabase web client config | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | public | required | yes | apphosting non-secret (BUILD) |
| Supabase server auth | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | internal/secret mix | required | yes | non-secret URL + secret reference (RUNTIME) |
| Firebase server project routing | FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET | internal | required | yes | apphosting non-secret (RUNTIME) |
| Firebase Admin credential fallback | FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY | secret/internal mix | optional fallback | yes | secret refs only when managed identity is not used |
| Admin authorization controls | ZOOTOPIA_ADMIN_EMAILS | internal | required | yes | apphosting non-secret (RUNTIME) |
| Admin password gate | ZOOTOPIA_ADMIN_LOGIN_PASSWORD | secret | required for admin bootstrap | yes | apphosting secret reference (RUNTIME) |
| Session TTL control | ZOOTOPIA_SESSION_TTL_SECONDS | internal | optional | yes | apphosting non-secret (RUNTIME) |
| Internal maintenance gate | ZOOTOPIA_MAINTENANCE_SECRET | secret | optional (required only when maintenance endpoint is used) | yes | apphosting secret reference (RUNTIME) |
| AI provider credentials | GOOGLE_AI_API_KEY, DASHSCOPE_API_KEY | secret | at least one required | yes | apphosting secret references (RUNTIME) |
| AI provider endpoint tuning | DASHSCOPE_BASE_URL, DASHSCOPE_COMPATIBLE_BASE_URL, ALIBABA_MODEL_STUDIO_BASE_URL | internal | optional | yes | apphosting non-secret (RUNTIME) |
| Model selection overrides | GOOGLE_AI_MODEL, GOOGLE_AI_ADVANCED_MODEL, QWEN_MODEL | internal | optional | yes | apphosting non-secret (RUNTIME) |
| Contact relay non-secrets | SMTP_HOST, SMTP_PORT, SMTP_SECURE | internal | optional (required when /api/contact is enabled) | yes | apphosting non-secret (RUNTIME) |
| Contact relay secrets | SMTP_USER, SMTP_PASS, EMAIL_FROM, CONTACT_FORM_TO | secret/internal mix | optional (required when /api/contact is enabled) | yes | apphosting secret references (RUNTIME) |
| Local PDF executable overrides | ASSESSMENT_PDF_BROWSER_EXECUTABLE_PATH, PUPPETEER_EXECUTABLE_PATH | local-only | optional | yes | never set in apphosting |
| System-injected runtime/build values | FIREBASE_CONFIG, GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS, K_SERVICE, FUNCTION_TARGET, NODE_ENV | system-managed | automatic | optionally present | do not set manually |

## Legacy apphosting.yaml reference contract

### Non-secret values managed in source

BUILD values:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUNTIME values:

- SUPABASE_URL
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- ZOOTOPIA_ADMIN_EMAILS
- ZOOTOPIA_SESSION_TTL_SECONDS
- DASHSCOPE_BASE_URL
- GOOGLE_AI_MODEL
- GOOGLE_AI_ADVANCED_MODEL
- QWEN_MODEL
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE

Optional commented non-secret compatibility aliases:

- DASHSCOPE_COMPATIBLE_BASE_URL
- ALIBABA_MODEL_STUDIO_BASE_URL

### Secret references in source

Active:

- SUPABASE_SERVICE_ROLE_KEY -> supabase-service-role-key
- ZOOTOPIA_ADMIN_LOGIN_PASSWORD -> zootopia-admin-login-password
- GOOGLE_AI_API_KEY -> google-ai-api-key

Optional (commented until needed):

- DASHSCOPE_API_KEY -> dashscope-api-key
- SMTP_USER -> smtp-user
- SMTP_PASS -> smtp-pass
- EMAIL_FROM -> smtp-email-from
- CONTACT_FORM_TO -> contact-form-to
- ZOOTOPIA_MAINTENANCE_SECRET -> zootopia-maintenance-secret
- FIREBASE_CLIENT_EMAIL -> firebase-client-email
- FIREBASE_PRIVATE_KEY -> firebase-private-key

## Safe admin auth design

This repo uses ZOOTOPIA_ADMIN_LOGIN_PASSWORD as an additional server-side admin gate.
That gate is required but never the sole factor.

Why this remains safe:

- Admin auth is enforced by Supabase sign-in plus server-side allowlist and role/claim checks.
- ZOOTOPIA_ADMIN_LOGIN_PASSWORD adds an extra server-side factor before session issuance.
- Session issuance still requires verified Supabase access tokens and claim checks.

Unsafe patterns to avoid:

- Do not use ZOOTOPIA_ADMIN_LOGIN_PASSWORD as the only admin check.
- Do not expose this secret in client-side code, logs, or front-end env variables.
- Do not replace allowlist or claim checks with password-only checks.

Supported rotation workflow:

1. Rotate credentials in the auth provider (Supabase dashboard/admin API).
2. Ensure allowlisted admins sign out and sign back in so refreshed tokens are used.
3. Keep password values out of .env files and out of source control.

## Reserved key safety for legacy App Hosting

From Firebase App Hosting docs, do not define:

- empty variable names or names containing =
- keys beginning with X_FIREBASE_, X_GOOGLE_, CLOUD_RUN_
- PORT, K_SERVICE, K_REVISION, K_CONFIGURATION
- duplicate keys

Also avoid depending on random environment-provided keys you did not set yourself.

## Quotes, empty values, and private keys

### Quotes

- Simple values can be unquoted.
- Values with spaces should be quoted.
- Values with literal $ should escape as \$ when needed.

### Empty values

- Empty is valid for optional settings in .env.example.
- Empty usually means disabled/unused fallback path.

### Private key handling

- Keep private keys in Secret Manager for production.
- For local .env.local fallback, use one quoted line with escaped newlines:

```dotenv
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- Runtime code converts \n back to real newlines before initializing Firebase Admin SDK.

## Automatic vs manual setup (legacy App Hosting)

Automatic by platform:

- App Hosting injected system variables (for example FIREBASE_CONFIG).

Manual by operator:

- Create secret values in Secret Manager.
- Ensure backend has access to those secrets.
- Keep Firebase Console overrides empty unless intentionally overriding file-based values during rollback.

## Precedence rules you must remember (legacy App Hosting)

App Hosting variable precedence (highest first):

1. Firebase Console env values
2. apphosting.<env>.yaml
3. apphosting.yaml
4. Firebase system-provided values

Next.js env load order (server process lookup):

1. process.env
2. .env.$(NODE_ENV).local
3. .env.local (not in test)
4. .env.$(NODE_ENV)
5. .env

## Optional rollback secret setup commands

Use Firebase CLI with npx only when validating a legacy App Hosting rollback path:

```bash
npx -y firebase-tools@latest apphosting:secrets:set google-ai-api-key --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set zootopia-admin-login-password --project zootopia2026
```

Optional features:

```bash
npx -y firebase-tools@latest apphosting:secrets:set dashscope-api-key --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set smtp-user --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set smtp-pass --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set smtp-email-from --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set contact-form-to --project zootopia2026
npx -y firebase-tools@latest apphosting:secrets:set zootopia-maintenance-secret --project zootopia2026
```

If you create secrets outside Firebase CLI, grant backend access afterward.

## Rollout checklist

- apphosting.yaml contains only non-secret values and secret references.
- Secret values exist in Secret Manager.
- No real secrets are committed.
- Console overrides are empty or intentionally documented.
- Deployment succeeds and admin/login/contact/assessment server routes behave correctly.
