# Zootopia Club Next 16.2.2 Simplified Platform Guide (2026)
## For the project owner and AI coding agents

> **Project goal:** build a new, simplified Zootopia Club platform using **Next.js 16.2.2 + TypeScript** with a **professional scalable monorepo structure**:
>
> ```text
> apps/web + apps/api + packages/shared-*
> ```
>
> This guide is written for:
> - the project owner
> - AI coding agents
> - future contributors
>
> It defines:
> - the target architecture
> - the exact product scope
> - the folder structure
> - the separation between frontend and backend
> - the rules agents must follow
> - the documentation discipline
> - the implementation roadmap
> - the deployment mindset

---

# 1) Non-negotiable agent rules

## 1.1 Always read official documentation first

Before implementing, changing, upgrading, debugging, or proposing architecture, every AI agent **must check the official documentation** for every important tool, library, runtime, or framework involved in the task.

This is mandatory for:
- Next.js
- React
- TypeScript
- Firebase
- Firestore
- Firebase Authentication
- Firebase Storage
- Tailwind CSS
- ESLint
- any backend framework or library
- any deployment platform
- any testing library
- any new package the agent wants to introduce

## 1.2 Next.js official docs are mandatory

Every agent working on this project must always review and learn from the official Next.js docs:

```text
https://nextjs.org/docs
```

The agent must use this documentation as a **primary source of truth** for:
- architecture decisions
- App Router conventions
- route handlers
- server/client boundaries
- rendering strategy
- caching and revalidation
- project structure
- TypeScript behavior
- linting
- deployment
- upgrades
- breaking changes
- new framework features

## 1.3 Do not rely on memory alone

Agents must not assume that remembered knowledge is fully accurate.

They must:
1. verify versions
2. verify APIs
3. verify official examples
4. verify current best practices
5. verify deprecations or changed conventions

## 1.4 Documentation-first development

Before touching code, the agent must:
1. inspect official docs
2. inspect the real repo structure
3. inspect dependency versions
4. inspect environment boundaries
5. inspect how the current change fits the architecture

## 1.5 No hallucinated architecture

Agents must not invent:
- files that do not exist
- routes that do not exist
- APIs that do not exist
- packages that are not installed
- unsupported runtime assumptions
- unofficial Next.js patterns when official patterns already exist

---

# 2) Target platform identity

## 2.1 Product name

**Zootopia Club**

## 2.2 Product direction

This is a **new simplified version** of the platform.

It is **not** a direct rebuild of the old complex system.

The new platform keeps only the core pieces that matter right now:
- clean branding
- clear user experience
- Google login
- user/admin separation
- Home
- Assessment Generator
- Infographic Generator
- User Settings
- Admin Panel
- a separate backend
- Firebase-backed identity and data

## 2.3 Strategic simplification

The new platform intentionally removes the heavy complexity of the previous product version.

It must **not** start with:
- billing
- donations
- refunds
- unlock codes
- entitlements
- inbox
- communication center
- live voice
- chatbot
- study tools
- video generation
- fast access modes
- complicated multi-system orchestration
- the old document runtime complexity

These may return later only if intentionally redesigned.

---

# 3) Required core stack

## 3.1 Frontend
- **Next.js 16.2.2**
- **React**
- **TypeScript**
- **App Router**
- **Tailwind CSS**
- **ESLint**
- optional component layer chosen carefully and only after official-doc verification

## 3.2 Backend
A separate backend application inside the monorepo:
- Node.js
- TypeScript
- API routes / services / controllers
- Firebase Admin SDK where needed
- AI provider integration
- secure secret handling
- role-aware authorization

## 3.3 Infra / data
- Firebase Authentication
- Firestore
- Firebase Storage

## 3.4 Monorepo structure
Use this professional scalable structure:

```text
zootopia-club-next/
  apps/
    web/
    api/
  packages/
    shared-types/
    shared-utils/
    shared-config/
    ui/
  firebase/
    firestore.rules
    storage.rules
  docs/
  scripts/
  package.json
  pnpm-workspace.yaml
  turbo.json
  README.md
```

> You may use npm workspaces or pnpm workspaces.  
> If using Turborepo, keep it simple and justified.

---

# 4) Why this structure is preferred

## 4.1 apps/web
This contains the user-facing Next.js application.

It owns:
- routes
- layouts
- pages
- UI
- client auth state
- admin UI
- user settings UI
- assessment UI
- infographic UI

## 4.2 apps/api
This contains the backend application.

It owns:
- protected API endpoints
- token verification
- admin authorization
- AI provider calls
- storage logic
- Firestore write/read coordination
- upload handling
- internal server logic
- all secrets and privileged integrations

## 4.3 packages/shared-types
This contains shared TypeScript contracts such as:
- user role types
- API request/response shapes
- domain models
- assessment result types
- infographic result types
- auth/session payload shapes

## 4.4 packages/shared-utils
This contains pure shared logic only:
- validation helpers
- formatting helpers
- constants
- safe transform helpers
- role utility helpers
- non-secret common utilities

## 4.5 packages/shared-config
This contains shared configuration contracts:
- environment parsing
- shared constants
- feature flags
- route constants
- domain settings

## 4.6 packages/ui
Optional reusable UI package if needed later.
Do not create it too early if it adds unnecessary complexity.

---

# 5) Final simplified product scope

## 5.1 User-facing app
The user app should contain:

### Home
The main landing page after login.
It should be a real standalone page and the primary entry experience.

### Assessment Generator
The assessment tool for generating educational questions or similar outputs.

### Infographic Generator
The infographic tool.
Start with **Infographic Image Mode first** because it is faster and simpler.

### User Settings
A settings page for:
- profile info
- theme
- language
- account display details
- sign out

### Login
Google Sign-In only.

## 5.2 Admin-facing app surface
The admin surface should contain:

### Admin Dashboard
A small dashboard with high-value overview data.

### Users Management
Ability to:
- list users
- search/filter users
- inspect basic status
- change role if needed
- activate/deactivate or suspend/restore if intentionally supported

### Basic Monitoring
Very light operational visibility such as:
- number of users
- recent activity summaries
- recent generations
- simple system counts

Do not start with advanced governance systems.

---

# 6) Authentication model

## 6.1 Only Google Sign-In
The simplified platform should start with:
- Firebase Authentication
- Google Sign-In only

## 6.2 Role model
Each authenticated user should map to a role:
- `admin`
- `user`

## 6.3 Role storage
A user record should exist in Firestore.
That record should include:
- uid
- email
- displayName
- photoURL
- role
- createdAt
- updatedAt
- status if needed
- optional user preferences

## 6.4 Separation rule
Admin and user must be separated at:
- route level
- UI level
- backend authorization level
- data access level

The frontend may hide admin UI, but the backend must still enforce admin checks.

---

# 7) Domain model of the simplified app

## 7.1 Home domain
Responsibilities:
- hero/entry experience
- quick navigation
- upload entry if needed
- overview of available tools
- recent user actions if useful

## 7.2 Assessment domain
Responsibilities:
- accept user input
- optionally accept a file
- accept settings
- call backend generation endpoint
- display result
- allow simple preview/export

## 7.3 Infographic domain
Responsibilities:
- accept topic or source text
- accept options
- call backend generation endpoint
- render preview
- allow simple image download/export

### Initial scope
Start with **Infographic Image Mode** only.

### Defer for later
- structured infographic renderer mode
- advanced layout engine
- editable structured blocks
- advanced chart composition

## 7.4 Settings domain
Responsibilities:
- account view
- theme preference
- language preference
- profile metadata
- sign out

## 7.5 Admin domain
Responsibilities:
- admin route protection
- users list
- role/status management
- simple activity or metrics overview

---

# 8) Frontend architecture (apps/web)

## 8.1 Recommended structure

```text
apps/web/
  app/
    (public)/
      login/
        page.tsx
    (protected)/
      page.tsx
      assessment/
        page.tsx
      infographic/
        page.tsx
      settings/
        page.tsx
      admin/
        page.tsx
        users/
          page.tsx
    api/
      auth/
    layout.tsx
    globals.css
  components/
    layout/
    ui/
    auth/
    assessment/
    infographic/
    settings/
    admin/
  features/
    auth/
    home/
    assessment/
    infographic/
    settings/
    admin/
  lib/
    firebase/
    auth/
    api/
    env/
    guards/
  hooks/
  providers/
  types/
  constants/
  styles/
  middleware.ts
  next.config.ts
  package.json
  tsconfig.json
```

## 8.2 Architectural rules for apps/web
- Use **App Router**
- Prefer server components by default
- Use client components only when needed
- Keep data boundaries explicit
- Do not put secrets in the frontend
- Do not move backend authority into the browser
- Keep route ownership clear
- Keep admin UI isolated inside admin features/routes

## 8.3 Recommended route groups
Use route groups to keep structure clean:
- `(public)`
- `(protected)`

Optional:
- `(admin)` if that later becomes useful

---

# 9) Backend architecture (apps/api)

## 9.1 Recommended structure

```text
apps/api/
  src/
    app.ts
    server.ts
    routes/
      auth.routes.ts
      users.routes.ts
      admin.routes.ts
      assessment.routes.ts
      infographic.routes.ts
      uploads.routes.ts
      health.routes.ts
    controllers/
      auth.controller.ts
      users.controller.ts
      admin.controller.ts
      assessment.controller.ts
      infographic.controller.ts
      uploads.controller.ts
    services/
      auth/
      users/
      admin/
      assessment/
      infographic/
      uploads/
      ai/
      firestore/
      storage/
    middleware/
      authenticate.ts
      requireAdmin.ts
      errorHandler.ts
      validateRequest.ts
    lib/
      firebase-admin.ts
      env.ts
      logger.ts
    schemas/
    types/
    utils/
  package.json
  tsconfig.json
```

## 9.2 Backend responsibility rules
The backend must own:
- token verification
- role enforcement
- admin-only authorization
- secure AI execution
- upload management
- storage rules mediation when needed
- Firestore writes for privileged operations
- all privileged environment variables
- all provider secrets

## 9.3 Backend must not be bypassed
Sensitive flows must not rely on client-only trust.

Examples of backend-owned operations:
- verify admin role
- call AI provider with secret key
- store protected generation logs
- perform sensitive file handling
- return admin-only metrics
- update another user’s role/status

---

# 10) Shared packages design

## 10.1 packages/shared-types
Recommended contents:

```text
packages/shared-types/
  src/
    auth.ts
    user.ts
    admin.ts
    assessment.ts
    infographic.ts
    api.ts
    common.ts
  package.json
  tsconfig.json
```

## 10.2 packages/shared-utils
Recommended contents:

```text
packages/shared-utils/
  src/
    strings.ts
    dates.ts
    validation.ts
    roles.ts
    objects.ts
    arrays.ts
    constants.ts
  package.json
  tsconfig.json
```

## 10.3 packages/shared-config
Recommended contents:

```text
packages/shared-config/
  src/
    routes.ts
    env.ts
    featureFlags.ts
    appConfig.ts
  package.json
  tsconfig.json
```

## 10.4 packages/ui
Optional later:

```text
packages/ui/
  src/
    button.tsx
    card.tsx
    input.tsx
    dialog.tsx
    badge.tsx
    loader.tsx
  package.json
  tsconfig.json
```

Do not create a shared UI package unless reuse is real and stable.

---

# 11) Data model recommendations

## 11.1 users collection
Suggested basic user document:

```ts
type UserRole = "admin" | "user";
type UserStatus = "active" | "suspended";

interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  preferences?: {
    theme?: "light" | "dark" | "system";
    language?: "en" | "ar";
  };
}
```

## 11.2 assessment records
Store:
- owner uid
- input summary
- generation options
- model used
- output
- timestamps
- status

## 11.3 infographic records
Store:
- owner uid
- topic
- generation options
- model used
- output metadata
- image URL or stored asset path
- timestamps
- status

## 11.4 admin activity logs
Optional but useful:
- action type
- actor uid
- target uid if any
- metadata
- createdAt

---

# 12) File upload philosophy

## 12.1 Keep it simple
The new simplified version should not begin with the old heavy document runtime system.

## 12.2 Minimal upload support
If Assessment or Infographic needs file input, start with a simple model:
- upload file
- validate file
- store file
- process it through backend if needed
- return result metadata

## 12.3 Avoid rebuilding the old complex extraction system immediately
Only add advanced extraction if the product truly needs it later.

---

# 13) Infographic strategy

## 13.1 Phase 1: Image Mode only
The first production scope should focus on:
- input topic/text
- choose model
- generate infographic image
- preview image
- download/export image

## 13.2 Why this first
Because it is:
- simpler
- faster to ship
- easier to maintain initially
- enough for early product value

## 13.3 Phase 2 later
Possible future work:
- structured infographic mode
- editable infographic blocks
- chart-driven sections
- academically stronger structured rendering

---

# 14) UI and design layer

## 14.1 Shared UI surfaces
The app should include reusable:
- navbar/sidebar
- buttons
- cards
- inputs
- modals
- loaders
- toasts
- empty states
- section headers

## 14.2 Design discipline
The new platform should:
- stay premium but simpler
- preserve a clean science-oriented identity
- avoid clutter
- avoid overbuilding
- prioritize clarity
- preserve responsiveness
- preserve dark/light compatibility if used

## 14.3 Responsiveness
Agents must verify behavior across:
- small mobile
- mobile
- tablet
- laptop
- desktop
- ultra-wide

---

# 15) API surface recommendations

## 15.1 Health
- `GET /health`

## 15.2 Auth
- `GET /auth/me`
- `POST /auth/bootstrap` if needed

## 15.3 Users
- `GET /users/me`
- `PATCH /users/me/preferences`
- `PATCH /users/me/profile`

## 15.4 Admin
- `GET /admin/overview`
- `GET /admin/users`
- `PATCH /admin/users/:uid/role`
- `PATCH /admin/users/:uid/status`

## 15.5 Assessment
- `POST /assessment/generate`
- `GET /assessment/:id`
- `GET /assessment`

## 15.6 Infographic
- `POST /infographic/generate`
- `GET /infographic/:id`
- `GET /infographic`

## 15.7 Uploads
- `POST /uploads`
- `DELETE /uploads/:id` if needed

---

# 16) Environment design

## 16.1 apps/web env example
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_BASE_URL=
```

## 16.2 apps/api env example
```env
NODE_ENV=development
PORT=8080

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

GOOGLE_GENAI_API_KEY=
QWEN_API_KEY=

CLIENT_APP_URL=
ALLOWED_ORIGINS=
```

## 16.3 Environment rules
- only public-safe vars go to `NEXT_PUBLIC_*`
- secrets stay in backend env only
- never expose provider secrets to the browser
- keep environment parsing centralized

---

# 17) Local development workflow

## 17.1 Root commands
Recommended:
- install dependencies from root
- run workspace scripts from root
- run lint/typecheck/build centrally when practical

## 17.2 Example command philosophy
- `web` runs on one port
- `api` runs on another port
- frontend talks to backend via explicit base URL
- shared packages compile or resolve through workspace tooling

## 17.3 Recommended scripts
At the root, you may define:
- dev
- dev:web
- dev:api
- build
- lint
- typecheck
- test

---

# 18) Deployment philosophy

## 18.1 Keep frontend and backend conceptually separate
This project explicitly wants:
- frontend in one app
- backend in another app

Even if both later deploy to the same provider ecosystem, their ownership should remain separate.

## 18.2 Deployment options
Possible deployment patterns:
- web on Vercel / Firebase Hosting / other frontend host
- api on Cloud Run / Render / Railway / Fly.io / other backend-capable host

## 18.3 Never mix deployment assumptions
Agents must distinguish:
- local development
- frontend hosting
- backend hosting
- same-origin vs cross-origin API traffic
- auth-domain configuration
- CORS implications

---

# 19) Mandatory agent workflow before any implementation

Every AI agent must do the following before making changes:

1. Read this guide fully
2. Read the official Next.js docs
3. Re-check the Next.js docs homepage:
   - `https://nextjs.org/docs`
4. Inspect exact package versions
5. Inspect the monorepo layout
6. Identify whether the task belongs to:
   - web
   - api
   - shared package
   - firebase config
   - docs
7. Check official docs for each affected library
8. Keep the change minimal and scoped
9. Do not rebuild unrelated areas
10. After changes, verify lint/type/build for touched areas

---

# 20) Mandatory agent workflow for official-doc verification

For any serious task, the agent must explicitly verify official docs for:
- framework version
- config shape
- CLI usage
- API usage
- file conventions
- deployment behavior
- auth behavior
- package compatibility

## Minimum required official-doc checks
At minimum, the agent should verify:
- Next.js docs
- Firebase docs relevant to the touched feature
- library docs for any new package
- deployment docs if deployment behavior is being changed

---

# 21) What must be excluded from the initial build

The initial simplified build must exclude:
- old entitlement systems
- old billing systems
- old code redemption systems
- advanced message/inbox systems
- advanced admin communication tools
- live voice
- chatbot
- study tools
- advanced document-runtime architecture
- the old all-in-one platform scope

This protects the new codebase from inheriting old complexity too early.

---

# 22) Practical implementation roadmap

## Phase 0 — Documentation and repo scaffolding
- create repo
- create monorepo structure
- create docs folder
- create root workspace config
- create root scripts
- create shared package scaffolds

## Phase 1 — Core web app scaffold
- create Next.js 16.2.2 app in `apps/web`
- configure TypeScript
- configure Tailwind
- configure ESLint
- create base layout
- create public/protected route groups
- add theme foundation if needed

## Phase 2 — Core API scaffold
- create backend app in `apps/api`
- configure TypeScript
- configure env parsing
- add health route
- add auth middleware skeleton
- add error handler
- add route/controller/service structure

## Phase 3 — Firebase integration
- configure Firebase Auth in web
- configure Google Sign-In
- configure Firebase Admin in api
- configure Firestore user bootstrap
- define user role document model

## Phase 4 — Protected user flow
- build login page
- build auth bootstrap
- build route protection
- build home page
- build settings page

## Phase 5 — Admin flow
- build admin route protection
- build admin dashboard
- build users list
- build role/status update flows

## Phase 6 — Assessment flow
- build assessment page
- build request form
- build backend generation endpoint
- connect AI provider
- store and read results
- render result preview

## Phase 7 — Infographic flow
- build infographic page
- build image-generation endpoint
- connect AI provider
- store output metadata
- show image preview
- support basic export/download

## Phase 8 — Verification and hardening
- lint
- typecheck
- build
- route verification
- auth verification
- admin isolation verification
- environment sanity check

---

# 23) Root README expectations

The root README should explain:
- what the platform is
- why the monorepo exists
- what `apps/web` does
- what `apps/api` does
- what each shared package does
- how to run locally
- how to configure env vars
- how to build
- how to deploy
- what the initial scope excludes

---

# 24) Agent-safe coding rules

## 24.1 Keep changes surgical
Do not rewrite the project for personal preference.

## 24.2 Respect ownership boundaries
- web owns UI and app routing
- api owns secure logic
- shared packages own reusable contracts/utilities
- firebase folder owns security rules

## 24.3 Do not leak secrets
Never expose:
- admin credentials
- private keys
- provider API keys
- server-only environment values

## 24.4 Do not create duplicate systems
If there is already a correct place for logic, use it.

## 24.5 Prefer explicit types
Use strong shared types for:
- requests
- responses
- roles
- settings
- generation results
- admin actions

## 24.6 Keep future scale in mind
The monorepo should be easy to extend later without rewriting the initial structure.

---

# 25) Final architecture summary

## User App
- Home
- Login
- Assessment
- Infographic
- Settings

## Admin App
- Admin Dashboard
- Users Management
- Basic Monitoring

## Shared Backend
- Auth verification
- Role management
- AI execution
- File/upload handling
- Firestore integration
- Storage integration
- Protected APIs

## Shared Packages
- shared-types
- shared-utils
- shared-config
- optional ui package later

---

# 26) Final decision statement

For this project, the preferred architecture is:

```text
apps/web + apps/api + packages/shared-*
```

This is preferred over a simple `frontend/ + backend/` split because it provides:
- clearer long-term scaling
- cleaner ownership
- stronger shared-package discipline
- easier future growth
- cleaner multi-app organization
- better maintainability for both humans and AI agents

---

# 27) Required official-doc reminder block for all future agents

Use this exact reminder in future implementation prompts:

```text
You are working on a production-style monorepo using Next.js 16.2.2.

Before making any change:
1. Read the relevant official documentation for every framework, library, and tool you touch.
2. Always check the official Next.js docs first: https://nextjs.org/docs
3. Re-verify current Next.js behavior from the official docs instead of relying on memory.
4. Keep frontend/backend/shared-package ownership boundaries strict.
5. Do not move backend authority into the frontend.
6. Do not add packages casually.
7. Keep changes minimal, surgical, and architecture-safe.
8. Preserve the monorepo structure: apps/web + apps/api + packages/shared-*.
9. Prefer official conventions over ad-hoc patterns.
10. After implementation, verify lint, type safety, and build behavior for the affected apps/packages.
```

---

# 28) Final note to agents

This project should be built **professionally, but simply**.

The goal is not to recreate the old heavy platform immediately.

The goal is to build a:
- clean
- scalable
- official-doc-aligned
- maintainable
- Next.js-first
- backend-separated
- production-ready simplified platform

Start small.
Keep the architecture strong.
Add complexity only when the product truly needs it.



---

# 38) Updated Firebase target, deployment replacement, and extraction requirements

## 38.1 Firestore database to use
The required Firestore database for the new simplified platform is:

```text
zootopia-club-next-database
```

Agents must treat this as the intended database target for the new application.

## 38.2 Firebase project to use
The Firebase project that must be used is:

```text
zootopia2026
```

This is the same Firebase project that was previously used by the old complex platform.

## 38.3 Mandatory distinction
Agents must always distinguish between:
- the Firebase project: `zootopia2026`
- the Firestore database: `zootopia-club-next-database`
- the old complex platform
- the new simplified platform

These must not be mixed mentally or architecturally.

## 38.4 Multi-database discipline
Because Firestore supports multiple databases in the same project, agents must:
- verify which database is being targeted
- verify rules strategy for that database
- verify SDK initialization assumptions
- verify emulator assumptions
- verify deployment assumptions
- avoid silently writing to the wrong database

---

# 39) Updated deployment strategy: App Hosting becomes the primary target

## 39.1 New primary target
The new preferred deployment target for the simplified platform is:

```text
Firebase App Hosting
```

This should be treated as the main modern Firebase deployment path for the new Next.js platform.

## 39.2 Legacy split path becomes old/secondary
The older deployment model based on:

```text
Firebase Hosting + Cloud Run
```

should now be treated as the **old legacy split path** from the previous platform architecture.

It must not remain the main mental model for the new simplified platform.

## 39.3 Important technical clarification
Agents must understand this clearly:

- the **manual old split deployment model** (`Firebase Hosting + Cloud Run`) is being retired for this new platform
- however, **Firebase App Hosting still uses Google Cloud infrastructure under the hood**
- therefore agents must not incorrectly describe App Hosting as meaning “there is no Cloud Run involved anywhere internally”

The important distinction is:
- **old model:** you manually maintain a split frontend/backend deployment using Firebase Hosting and a separately managed Cloud Run service
- **new model:** App Hosting is the primary deployment product and manages the full-stack hosting path for you

## 39.4 Netlify remains an additional future path
Netlify should remain documented as an additional future deployment mode, but it is **not** the primary intended path.

## 39.5 Deployment priority order
Agents should document deployment modes in this order:

1. **Firebase App Hosting** — primary target
2. **Netlify** — optional secondary frontend-oriented deployment path
3. **Firebase Hosting + Cloud Run** — legacy/old path kept only for compatibility understanding or migration reference

---

# 40) Architectural implication of moving to App Hosting

## 40.1 Important design question
Because this guide still uses the monorepo structure:

```text
apps/web + apps/api + packages/shared-*
```

agents must analyze carefully how this interacts with Firebase App Hosting.

## 40.2 Rule
Agents must not assume that the old separate manual backend deployment pattern should remain unchanged.

They must explicitly evaluate whether the new platform should:

### Option A
Keep:
- `apps/web`
- `apps/api`

with App Hosting used for the web app and a separately deployed backend kept only if truly required.

### Option B
Gradually absorb backend behavior needed by the web app into the App Hosting-compatible Next.js application, using official Next.js server capabilities where appropriate.

## 40.3 Default recommendation
Unless there is a strong reason to keep a separately deployed backend at the beginning, agents should strongly consider:

- keeping the monorepo layout
- but minimizing unnecessary separation
- and preferring the App Hosting-compatible shape for the first production version

## 40.4 Still preserve backend authority
Even if some backend behavior moves closer to the Next.js app runtime, agents must still preserve:
- server-only execution for secrets
- admin authorization enforcement
- server-side provider calls
- server-side data protection
- strict server/client boundaries

---

# 41) Old complex platform as a source of extraction and reuse

## 41.1 Permission to use the old project as a source
Agents are explicitly allowed to inspect the old complex platform and use it as a source of:
- inspiration
- visual design language
- layout ideas
- colors
- interaction patterns
- useful ready-made components
- stable existing flows
- reusable assets
- reusable logos
- reusable favicon assets
- reusable upload/assessment/login surfaces
- reusable professional communication system parts
- reusable AI/provider/orchestration patterns
- reusable theme and i18n patterns
- reusable extraction-related ideas

## 41.2 Migration rule
Agents must **not** blindly copy the old project.

They must instead:
1. inspect the old project carefully
2. identify what is worth reusing
3. copy only what is useful
4. adapt it to the new simplified architecture
5. remove or refactor complexity when needed
6. document all major reuse decisions in the new ledger

## 41.3 What may be copied or adapted
The following may be intentionally reused when appropriate:
- upload page design
- assessment page design
- login page design
- logo
- favicon
- shared color system
- sidebar/navbar style
- theme switching behavior
- Arabic/English language switching
- professional prompt orchestration ideas
- model/provider switching UX
- reusable communication system files if still useful
- any polished shared UI primitives
- result preview/export patterns if they fit the simplified app

## 41.4 What must not be copied blindly
Agents must not blindly carry over:
- old billing systems
- old entitlements
- old code redemption systems
- old fast-access flows
- old overgrown runtime assumptions
- old coupling that does not fit the simplified platform
- old deployment assumptions tied to the manual Cloud Run split architecture

---

# 42) Mandatory support for themes, languages, extraction, providers, and orchestration

## 42.1 Theme modes are required
The new platform must support:
- dark mode
- light mode

Agents should preserve a clean, premium implementation and may reuse or adapt strong patterns from the old platform.

## 42.2 Language modes are required
The new platform must support:
- Arabic
- English

This should affect:
- navigation
- forms
- buttons
- labels
- major app surfaces
- user-facing tool pages
- settings
- authentication-related UI where appropriate

## 42.3 File support and extraction are required
Although the new platform is simplified, the user explicitly wants:
- strong file support
- strong extraction capability
- full file handling support
- extraction-driven workflows

Therefore, agents must not remove document extraction from the product vision.

Instead, they should rebuild it professionally in a cleaner and more appropriate way for the new platform.

## 42.4 Datalab Convert is the intended extraction engine
The intended extraction engine is:

```text
Datalab Convert -> files to Markdown
```

Agents must treat Datalab Convert as the primary extraction direction for the new platform’s document handling.

## 42.5 AI provider switching is required
The new platform should preserve professional support for:
- multiple models
- multiple providers
- provider-aware execution
- model switching in relevant tools

## 42.6 Prompt orchestration remains important
Even in the simplified platform, prompt orchestration is still important and should be kept professionally designed.

Agents may reuse and simplify strong orchestration patterns from the old project where appropriate.

---

# 43) Updated product scope clarification

## 43.1 Simplified does not mean “too minimal”
The new platform is simplified compared with the old one, but it still intentionally includes:
- authentication
- admin/user separation
- upload capability
- extraction capability
- assessment generation
- infographic generation
- provider/model selection
- dark/light modes
- Arabic/English switching
- reusable professional UI patterns
- strong design continuity from the old platform

## 43.2 What is removed vs what is preserved
### Remove or defer:
- billing
- donations
- refunds
- unlock codes
- entitlements
- inbox
- communication center as a large governance system
- live voice
- chatbot
- study tools
- video generation
- the old full platform complexity

### Preserve or rebuild in a cleaner form:
- polished design identity
- upload experience
- assessment flow
- infographic flow
- extraction support
- theme switching
- language switching
- model/provider selection
- prompt orchestration
- selected professional communication-related parts only if they fit the new architecture

---

# 44) Mandatory environment and configuration translation from the old platform

## 44.1 Old environment as reference, not as blind final copy
The old `.env.example` may be used as an architectural reference for:
- runtime settings
- Datalab settings
- provider configuration
- app URL concepts
- CORS thinking
- Firebase project hints
- extraction flags

But the agent must not blindly copy it as-is.

## 44.2 New environment strategy must be rewritten for the new architecture
The new platform’s environment design must be rewritten according to:
- Next.js App Hosting compatibility
- the new monorepo structure
- the new backend shape
- the named Firestore database target
- the new deployment priorities
- the simplified product scope

## 44.3 Datalab settings must remain server-side
Any Datalab Convert credentials or extraction settings must remain server-side only.

They must never be exposed to the browser.

## 44.4 Provider keys must remain server-side
Any Gemini, DashScope, Qwen, or other provider keys must remain server-side only.

---

# 45) Updated ledger requirements for migration/reuse tracking

The ledger file:

```text
zootopia-club-next-ledger.txt
```

must additionally track:

- which old-project files were inspected
- which old-project files were reused
- which old-project files were adapted
- which old-project systems were intentionally excluded
- what migration decisions were made
- how App Hosting changed architecture assumptions
- how Firebase project/database targeting was configured
- which deployment mode is primary
- which deployment modes are only compatibility references

This is mandatory.

---

# 46) Required future-prompt block for this updated direction

Use a block like this in future implementation prompts:

```text
You are working on the new simplified Zootopia Club platform.

Mandatory context:
- Next.js version target: 16.2.2
- Primary docs source: https://nextjs.org/docs
- Primary Firebase project: zootopia2026
- Primary Firestore database: zootopia-club-next-database
- Primary deployment target: Firebase App Hosting
- Secondary possible target: Netlify
- Legacy reference path only: Firebase Hosting + Cloud Run
- Extraction direction: Datalab Convert -> Markdown
- Old complex project may be inspected and selectively reused for design, assets, pages, theme/i18n systems, provider/model UX, orchestration ideas, and other polished reusable parts
- Do not blindly copy old complexity
- Create and maintain zootopia-club-next-ledger.txt
- Append a dated ledger entry after every meaningful change
- Distinguish clearly between App Hosting, Netlify, and legacy Firebase Hosting + Cloud Run
- Keep server-only secrets on the server
- Preserve dark/light mode and Arabic/English support
```

---

# 47) Final strategic decision for this updated version

For this updated project direction, the intended strategic state is:

- use **Firebase project `zootopia2026`**
- target **Firestore database `zootopia-club-next-database`**
- move the new platform’s primary deployment mindset to **Firebase App Hosting**
- treat the old manual **Firebase Hosting + Cloud Run** split as legacy
- keep **Netlify** documented as an additional future path
- selectively extract and adapt the best parts of the old complex platform
- preserve strong design, theme, language, extraction, provider, and orchestration quality
- keep the new platform simpler and cleaner than the old one



---

# 48) Active local workspace context and old-project access rule

## 48.1 Current local workspace paths
The active local workspace context for this project is:

```text
New project: C:\zootopia-club-next
Old project: C:\zootopia_club_ai_platform
```

Agents must treat both paths as part of the working analysis context when available in the same VS Code workspace.

## 48.2 Required old-project review
Before major implementation, the agent must inspect the old project at:

```text
C:\zootopia_club_ai_platform
```

The purpose is to:
- understand the existing Zootopia design system
- extract reusable UI and UX patterns
- identify reusable pages
- identify reusable assets
- identify reusable logic
- identify reusable theme and i18n systems
- identify reusable provider/orchestration logic
- identify reusable extraction/file-handling logic
- identify polished professional subsystems worth adapting

## 48.3 Required new-project target
The target project that must be built and organized is:

```text
C:\zootopia-club-next
```

All copied, adapted, or newly written work must be reorganized to fit the new project architecture and file ownership rules.

## 48.4 Allowed migration behavior
Agents are allowed to:
- copy individual files
- copy groups of files
- copy complete pages
- copy assets
- copy components
- copy styles
- copy utility modules
- copy selected professional subsystems

But they must then:
- review the copied code carefully
- adapt it to the new architecture
- rename or relocate files when needed to match the new structure
- remove old assumptions that no longer fit
- document the reuse in the ledger

## 48.5 Forbidden migration behavior
Agents must not:
- dump large parts of the old repo into the new repo without analysis
- preserve old coupling blindly
- preserve old deployment assumptions blindly
- preserve dead code unnecessarily
- preserve old billing/governance complexity unless intentionally requested
- break the new folder ownership model just because the old code used another structure

---

# 49) Required migration and reuse workflow from the old project

For any serious feature, the agent should follow this workflow:

1. Analyze the corresponding feature in the old project
2. Identify reusable files and dependencies
3. Decide whether each piece should be:
   - copied directly
   - adapted
   - rewritten cleanly
   - excluded
4. Move or recreate the feature in the correct new-project location
5. Verify that the result fits:
   - Next.js 16.2.2
   - App Router
   - server/client boundaries
   - the new monorepo ownership model
   - Firebase App Hosting direction
6. Record the decision in `zootopia-club-next-ledger.txt`

This is mandatory for pages and systems such as:
- upload
- assessment
- login
- theme switching
- language switching
- logo and favicon use
- provider/model selectors
- orchestration
- extraction/file-handling flows
- polished communication-related modules if retained

---

# 50) Required create-next-app bootstrap rules

## 50.1 Official Next.js bootstrap preference
When bootstrapping or regenerating a fresh Next.js app, agents should follow the official Next.js installation guidance and prefer the CLI path documented by Next.js. The official docs currently show Next.js **16.2.2** and note that `--yes` skips prompts and uses the recommended defaults, including TypeScript, Tailwind CSS, ESLint, App Router, Turbopack, import alias `@/*`, and `AGENTS.md`. citeturn603039view0

## 50.2 Required bootstrap preference for this project
For this project, agents should assume the owner prefers using the `--yes` path and modern defaults.

That means the bootstrap should align with:
- TypeScript
- Tailwind CSS
- ESLint
- App Router
- Turbopack
- import alias `@/*`
- `AGENTS.md`

## 50.3 TypeScript is required
This project uses **TypeScript** and agents must preserve that as a non-optional standard.

## 50.4 AGENTS.md handling
If the generated app includes `AGENTS.md` (and `CLAUDE.md` referencing it), agents must:
- keep it
- review it
- align it with this project’s architecture and rules
- update it if needed so it matches the actual project direction

---

# 51) Required Next.js architecture rules from official docs

## 51.1 App Router is required
Agents must use the **App Router** and keep the project aligned with the official App Router conventions documented by Next.js. citeturn603039view0turn603039view1

## 51.2 Route groups and private folders may be used
Agents may use:
- route groups like `(public)` and `(protected)`
- private folders like `_components` or `_lib`

when helpful for organization, because these are officially documented organizational tools in Next.js project structure guidance. citeturn603039view1

## 51.3 Server Components by default
Agents must remember that in the App Router, layouts and pages are **Server Components by default** and should preserve that default unless client interactivity is actually needed. citeturn603039view2

## 51.4 Use Client Components only when needed
Agents should use Client Components only for:
- state
- event handlers
- effects
- browser APIs
- custom hooks
- context providers that require client execution

This is especially important for keeping bundles smaller and preserving server-side advantages. citeturn603039view2

## 51.5 Prevent environment poisoning
Agents must carefully protect server-only code and secrets from entering the client graph, following the official server/client separation guidance in the Next.js docs. citeturn603039view2

---

# 52) Required project-structure preference for the new repo

Even though the project uses a monorepo (`apps/web + apps/api + packages/shared-*`), the internal Next.js app inside `apps/web` should follow official structure guidance such as:
- `app/`
- optional `src/`
- `public/`
- `components/`
- `lib/`
- `providers/`
- route groups
- colocated feature folders when appropriate

Agents should stay consistent with the Next.js official structure guidance rather than inventing unstable ad-hoc layouts. citeturn603039view1

---

# 53) Updated future prompt requirement for workspace-aware migration

Use a block like this in future implementation prompts:

```text
Workspace context:
- New project root: C:\zootopia-club-next
- Old project reference root: C:\zootopia_club_ai_platform

You must inspect the old project before major implementation and selectively reuse what is valuable.
You may copy full files or groups of files from the old project, but you must adapt them to the new architecture.
Do not blindly preserve old coupling or old deployment assumptions.
Update zootopia-club-next-ledger.txt with every major reuse, migration, exclusion, or refactor decision.

Bootstrap preference:
- Use the official Next.js 16.2.2 guidance
- Prefer create-next-app with `--yes` and the modern defaults when bootstrapping
- Keep TypeScript, Tailwind CSS, ESLint, App Router, Turbopack, `@/*`, and AGENTS.md aligned with the official Next.js setup
- Preserve Server Components by default and introduce Client Components only when needed
```

---

# 54) Final migration directive

For this project, the agent is explicitly authorized to use the old Zootopia codebase as a practical donor/source project.

However, every copied or adapted part must be:
- officially-doc-aligned
- Next.js-appropriate
- architecture-safe
- App Hosting-aware
- TypeScript-safe
- documented in the new ledger
- placed in the correct location in the new monorepo
