# Zootopia Club Next
## Full Beginner-Friendly Migration Guide
### From Firebase to Vercel + Supabase (Step by Step, 2026)

---

## 1. Goal of This Guide

This guide explains the best professional migration path for moving your platform from Firebase to:

- **Vercel** for hosting and runtime
- **Supabase** for authentication, database, and storage

It is written for a beginner, but in a technical and production-minded way.

This guide also separates clearly:

- what **you** should do yourself
- what the **AI agent** should do for you

The idea is to migrate safely, in the correct order, without breaking the platform.

---

## 2. Final Target Architecture

After migration, your platform should look like this:

### Frontend + Runtime
- **Vercel** hosts the `Next.js` app
- Vercel runs your:
  - pages
  - server components
  - route handlers (`app/api/.../route.ts`)

### Backend Data Platform
- **Supabase Auth** handles user login/session
- **Supabase Postgres** stores user and app data
- **Supabase Storage** stores files, results, and generated artifacts

### Roles and Security
- **Admin** and **normal user** remain fully separated
- All critical checks stay **server-side only**
- No client-side role trust

---

## 3. Migration Philosophy

Do **not** try to migrate everything at once.

The safest order is:

1. Prepare Supabase project
2. Prepare Vercel deployment target
3. Add Supabase environment variables
4. Build Supabase auth
5. Build user profile table and role model
6. Move user/profile logic from Firebase to Supabase
7. Move credits and admin user management to Supabase
8. Move files/storage to Supabase Storage
9. Move generated results metadata to Supabase
10. Remove Firebase runtime completely
11. Deploy to Vercel
12. Final QA and admin verification

This is the most professional and least risky order.

---

## 4. What You Must Do Yourself

These are the actions that are better for **you** to do manually.

### 4.1 Create a Supabase project
You should:
- create the Supabase project manually
- choose region
- save the project URL and keys
- enable email/password auth
- create database password securely

### 4.2 Create a Vercel project
You should:
- connect the GitHub repo to Vercel
- create the Vercel project manually
- configure production environment variables
- review deployment settings

### 4.3 Decide your migration policy
You should decide:
- whether old Firebase user data will be migrated or abandoned
- whether current users keep accounts or re-register
- whether old storage files must be copied to Supabase
- whether phone number remains just profile data or not

### 4.4 Enter secrets manually
You should manually set:
- Supabase project URL
- publishable key
- service role key
- SMTP or email-related secrets if needed
- any AI provider secrets

### 4.5 Run final production checks
You should manually test:
- login
- register
- admin login
- admin-only pages
- user isolation
- credit changes
- export flow
- upload flow
- assessment generation

---

## 5. What the AI Agent Should Do

These are the things the AI agent can safely and professionally do for you.

### 5.1 Analyze the project deeply
The agent should:
- read the ledger first
- map all Firebase usage
- map all auth/session logic
- map all repository/data storage paths
- map admin/export logic
- map all env usage

### 5.2 Prepare the codebase for Supabase
The agent should:
- install and wire Supabase packages
- create Supabase browser/server helpers
- migrate auth/session handling
- create login and register pages
- create role-safe server helpers
- refactor repository/data access to Supabase
- refactor storage to Supabase Storage
- clean dead Firebase code
- update env contract
- update docs

### 5.3 Preserve architecture quality
The agent should:
- avoid random rewrites
- keep admin and user fully separated
- keep server authority on sensitive operations
- keep exported admin data accurate
- keep code professional and maintainable

---

## 6. Official Stack You Should Use

### Required packages
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### Optional UI helper
```bash
npx shadcn@latest add @supabase/supabase-client-nextjs
```

### Core environment variables
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 7. Recommended Migration Order

# Phase 0 — Safety First

## Step 0.1: Create a new branch
**You do this.**

```bash
git checkout -b migrate-to-vercel-supabase
```

## Step 0.2: Back up the current repo
**You do this.**

Make a full backup copy of the project folder before deep migration.

## Step 0.3: Freeze new Firebase-dependent features
**You decide this.**

Do not add more Firebase features before migration is complete.

---

# Phase 1 — Create the New Platforms

## Step 1.1: Create a Supabase project
**You do this.**

Inside Supabase:
- create a new project
- save:
  - Project URL
  - Publishable key
  - Service role key
- choose a stable region

## Step 1.2: Enable email/password auth
**You do this.**

In Supabase Auth settings:
- enable **Email** provider
- confirm email flow only if you want it immediately
- decide whether email confirmation is required in v1

## Step 1.3: Create a Vercel project
**You do this.**

Inside Vercel:
- import the GitHub repo
- connect the project
- do not finalize production deploy until local migration passes

---

# Phase 2 — Local Supabase Foundation

## Step 2.1: Install Supabase packages
**AI agent can do this.**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

## Step 2.2: Create clean env structure
**AI agent can prepare the file structure. You fill the real values.**

The agent should:
- rebuild `.env.example`
- keep only live keys
- remove or comment dead Firebase auth/browser keys
- document public vs server-only keys

You then fill `.env.local`.

## Step 2.3: Create Supabase helper files
**AI agent should do this.**

Create separate helpers for:
- browser client
- server client
- admin/server-only client

Recommended split:
- `apps/web/lib/supabase/client.ts`
- `apps/web/lib/supabase/server.ts`
- `apps/web/lib/server/supabase-admin.ts`

---

# Phase 3 — Authentication Migration

This is the **first real migration** you should do.

## Step 3.1: Add login page
**AI agent should do this.**

Requirements:
- email + password
- premium UI
- same quality level as your app settings/auth styling
- loading state
- error state
- accessibility
- mobile responsive

## Step 3.2: Add register page
**AI agent should do this.**

Requirements:
- email
- password
- confirm password
- safe validation
- clear UX
- no ugly boilerplate

## Step 3.3: Add logout flow
**AI agent should do this.**

Requirements:
- clear sign-out button
- session cleanup
- correct redirect

## Step 3.4: Implement session-aware server logic
**AI agent should do this.**

The app should correctly resolve the current user in:
- server components
- route handlers
- protected pages
- admin pages

## Step 3.5: Remove Firebase auth runtime usage
**AI agent should do this only after Supabase auth is working.**

Do not remove Firebase auth before Supabase login/register/session is confirmed working.

---

# Phase 4 — Profiles and Roles

## Step 4.1: Create `profiles` table in Supabase
**You can create it manually, or the AI agent can generate SQL for you.**

Recommended initial columns:
- `id uuid primary key` (same as auth user id)
- `email text`
- `full_name text`
- `role text`
- `status text`
- `phone_number text`
- `credits integer`
- `created_at timestamptz`
- `updated_at timestamptz`

Optional later:
- `avatar_url`
- `profile_completed boolean`
- `university_code text`

## Step 4.2: Add role model
**AI agent should do this.**

You need strict role separation:
- `admin`
- `user`

The role must be checked on the **server only**.

## Step 4.3: Add protected route guards
**AI agent should do this.**

Requirements:
- public pages remain public
- protected pages require auth
- admin pages require admin role
- no client-only protection

---

# Phase 5 — User Data Migration

## Step 5.1: Move settings/profile save logic
**AI agent should do this.**

Migrate:
- profile fields
- phone number field
- status-related fields
- any onboarding/profile completion flags

## Step 5.2: Keep ownership strict
**AI agent should do this carefully.**

Every profile update must be bound to:
- current authenticated user only
- no client-supplied user id trust

## Step 5.3: Confirm admin separation remains intact
**AI agent should do this.**

Admin can inspect users.
Normal user cannot escalate to admin.

---

# Phase 6 — Credits System Migration

## Step 6.1: Move credits to Supabase
**AI agent should do this.**

Credits should live in the user profile or a related credits table.

## Step 6.2: Preserve credit rules
**AI agent should do this.**

Important rules:
- each user isolated from others
- no cross-user credit edits
- deduction only for the correct user
- admin can edit credits safely

## Step 6.3: Keep admin credit controls
**AI agent should do this.**

Admin must be able to:
- view user credits
- edit user credits
- export correct current credit values

---

# Phase 7 — Storage Migration

## Step 7.1: Identify all Firebase Storage usage
**AI agent should do this first.**

Do not migrate blindly.
Map all actual file/storage paths.

## Step 7.2: Create Supabase buckets
**You can do this manually, or the AI agent can tell you the exact bucket structure to create.**

Recommended concept:
- `user-uploads`
- `assessment-results`
- `generated-assets`
- maybe `admin-exports` only if needed

## Step 7.3: Migrate file metadata
**AI agent should do this.**

For each stored file, keep metadata such as:
- owner user id
- bucket path
- original file name
- mime type
- created at
- related assessment/result id if needed

## Step 7.4: Replace Firebase Storage runtime code
**AI agent should do this after Supabase storage paths are working.**

---

# Phase 8 — Results and Repository Migration

## Step 8.1: Trace all current repository paths
**AI agent should do this.**

Map:
- user document data
- assessment metadata
- generated results
- admin listing sources
- export data sources

## Step 8.2: Replace Firestore-backed repository logic
**AI agent should do this carefully.**

Every repository call that currently hits Firebase should be moved to Supabase.

## Step 8.3: Preserve ownership
**AI agent should do this.**

All result ownership must stay strict:
- user A sees only user A’s data
- admin can see all when appropriate

---

# Phase 9 — Admin System Migration

## Step 9.1: Migrate admin list routes
**AI agent should do this.**

Admin should still be able to list all users.

## Step 9.2: Migrate admin user management
**AI agent should do this.**

Admin should still be able to manage:
- role
- status
- credits
- profile fields you expose

## Step 9.3: Keep export working
**AI agent should do this.**

Admin export to Excel must still show:
- email
- name
- role
- status
- credits
- phone number
- created/updated dates
- other approved fields

---

# Phase 10 — Remove Firebase Completely

Do **not** do this before the replacement path works.

## Step 10.1: Remove Firebase browser code
**AI agent should do this.**

## Step 10.2: Remove Firebase server code
**AI agent should do this only after repository/storage migration is complete.**

Examples:
- `firebase-admin`
- firebase helpers
- firebase env keys
- firebase config files
- firebase scripts
- firebase deployment files

## Step 10.3: Remove Firebase deployment remnants
**AI agent should do this after full replacement.**

Examples:
- `firebase.json`
- `.firebaserc`
- `firebase/`
- `scripts/firebase/`
- App Hosting-only assumptions

---

# Phase 11 — Prepare Vercel

## Step 11.1: Add envs to Vercel
**You do this.**

In Vercel project settings, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- any email secrets
- any AI provider keys

## Step 11.2: Verify build works locally first
**AI agent can help, but you should observe the result.**

Run:
```bash
npm run lint
npm run typecheck
npm run build
```

## Step 11.3: Push and deploy
**You do this.**

Once build passes locally, push the branch and deploy on Vercel.

---

# Phase 12 — Final QA Checklist

## User authentication
- register works
- login works
- logout works
- session persists correctly

## User profile
- settings save correctly
- phone number stored correctly
- credits display correctly

## Admin
- admin login works
- admin pages protected
- normal users blocked from admin pages
- admin can list users
- admin can edit credits/status
- admin export works

## Ownership and isolation
- user A cannot see or edit user B data
- storage paths are ownership-safe
- result data is ownership-safe
- credit operations affect only the current correct user

## Build and deploy
- lint passes
- typecheck passes
- build passes
- Vercel deployment succeeds

---

## 8. Suggested Responsibility Split

## You should do manually
1. Create Supabase project
2. Create Vercel project
3. Add real env values
4. Decide migration policy for old data
5. Perform final manual QA
6. Approve destructive cleanup after migration is proven safe

## AI agent should do
1. Audit the project deeply
2. Build Supabase auth/session flow
3. Build register/login pages
4. Build role-safe server guards
5. Migrate repository/data logic
6. Migrate storage/runtime logic
7. Migrate admin list/export
8. Remove Firebase safely after replacement
9. Rebuild `.env.example`
10. Rebuild deployment contract for Vercel
11. Run lint/typecheck/build
12. Update the ledger after every serious migration pass

---

## 9. Best Beginner Rule

The most important rule for you as a beginner:

**Do not ask the AI to “remove Firebase completely” before Supabase auth, database, storage, and admin flows are already working.**

Always use this order:

**replace first -> verify -> then delete old system**

This is the cleanest and safest professional path.

---

## 10. Best Immediate Next Action

If you want the best first practical move today, do this exact order:

1. Create the Supabase project
2. Add Supabase env keys locally
3. Ask the AI to migrate **auth only first**
4. Verify login/register/session locally
5. Then continue with profiles and repository migration

That is the smartest first step.

---

## 11. Recommended Prompt Sequence for the AI

Use this order:

### Prompt 1
Migrate auth/session from Firebase to Supabase only.

### Prompt 2
Migrate profiles, roles, and protected/admin route logic.

### Prompt 3
Migrate repository/user data and credits.

### Prompt 4
Migrate file storage and generated result persistence.

### Prompt 5
Migrate admin list/export.

### Prompt 6
Remove Firebase completely and prepare for Vercel deployment.

---

## 12. Final Advice

For your project, the most professional path is:

- **Vercel** for runtime and deployment
- **Supabase** for auth + DB + storage
- **strict server-side admin/user separation**
- **full ownership isolation for every user**
- **step-by-step migration, not one-shot replacement**

That is the 2026-grade professional migration path.

