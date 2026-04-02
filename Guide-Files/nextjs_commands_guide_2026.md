# Next.js Command Guide (2026)
## Complete Practical CLI Reference for Creating, Running, Updating, Cleaning, and Managing a Next.js + TypeScript Project

This guide is a practical command reference for a modern **Next.js + TypeScript** workflow in 2026.

It focuses on:
- creating a project
- running the dev server
- building and starting production
- installing and removing packages
- updating dependencies
- cleaning caches and reinstalling cleanly
- inspecting your setup
- handling common reset/delete tasks
- preparing a project for deployment

The guide assumes you are using **Node.js + npm**, with notes for **pnpm / yarn / bun** where useful.

---

# 1) Recommended Baseline

For a new Next.js project in 2026, a safe modern baseline is:

- **Node.js 22 LTS** or newer stable release compatible with your stack
- **Next.js latest stable**
- **TypeScript**
- **ESLint**
- **Tailwind CSS** if you want a modern UI workflow
- **App Router** unless you have a specific reason to use the Pages Router

---

# 2) Check Your Current Tooling

## Check Node.js version
```bash
node -v
```

## Check npm version
```bash
npm -v
```

## Check npx version
```bash
npx -v
```

## Check installed Next.js version inside a project
```bash
npx next --version
```

or:
```bash
npm list next
```

---

# 3) Create a New Next.js Project

## Interactive creation (recommended)
```bash
npx create-next-app@latest
```

This starts the official interactive setup and lets you choose:
- project name
- TypeScript
- ESLint
- Tailwind CSS
- `src/` directory
- App Router
- import alias

## Create a named project directly
```bash
npx create-next-app@latest my-next-app
```

## Create with TypeScript explicitly
```bash
npx create-next-app@latest my-next-app --ts
```

## Create with TypeScript + Tailwind
```bash
npx create-next-app@latest my-next-app --ts --tailwind
```

## Create with a `src` directory
```bash
npx create-next-app@latest my-next-app --src-dir
```

## Create with App Router explicitly
```bash
npx create-next-app@latest my-next-app --app
```

## Create with a custom import alias
```bash
npx create-next-app@latest my-next-app --import-alias "@/*"
```

## Create from an example
```bash
npx create-next-app@latest --example with-supabase my-next-app
```

## Create using pnpm
```bash
pnpm create next-app my-next-app
```

## Create using yarn
```bash
yarn create next-app my-next-app
```

## Create using bun
```bash
bun create next-app my-next-app
```

---

# 4) Enter the Project Folder

```bash
cd my-next-app
```

---

# 5) Start the Development Server

## Standard dev server
```bash
npm run dev
```

By default this usually runs the app locally on:
```text
http://localhost:3000
```

## Run on a different port
```bash
npm run dev -- --port 4000
```

## Bind to all interfaces
```bash
npm run dev -- --hostname 0.0.0.0
```

## Use Webpack instead of the default modern bundler when needed
```bash
npm run dev -- --webpack
```

---

# 6) Build and Run Production Locally

## Create a production build
```bash
npm run build
```

## Start the production server
```bash
npm run start
```

## Start on a different port
```bash
npm run start -- --port 4000
```

## Run build with Webpack if needed
```bash
npm run build -- --webpack
```

---

# 7) Linting and Type Safety

## Run lint
```bash
npm run lint
```

## Run TypeScript type-check directly
```bash
npx tsc --noEmit
```

## Generate Next.js types without running full dev/build
```bash
npx next typegen
```

## Show Next.js CLI help
```bash
npx next -h
```

---

# 8) Install Packages

## Install a normal dependency
```bash
npm install package-name
```

Example:
```bash
npm install firebase
```

## Install multiple dependencies
```bash
npm install firebase zod react-hook-form
```

## Install a dev dependency
```bash
npm install -D package-name
```

Example:
```bash
npm install -D prettier eslint-config-prettier
```

## Install an exact version
```bash
npm install next@16.2.1
```

## Install all packages from package.json
```bash
npm install
```

---

# 9) Remove Packages

## Uninstall a package
```bash
npm uninstall package-name
```

Example:
```bash
npm uninstall axios
```

## Uninstall a dev package
```bash
npm uninstall eslint-config-prettier
```

---

# 10) Update Packages

## Update according to semver ranges in package.json
```bash
npm update
```

## Update one package
```bash
npm update next
```

## Check outdated packages
```bash
npm outdated
```

## Install a newer exact version manually
```bash
npm install next@latest react@latest react-dom@latest
```

## Update npm itself globally
```bash
npm install -g npm@latest
```

---

# 11) Clean Reinstall Workflow

Use this when dependencies become messy or broken.

## Delete `node_modules` and lockfile (Linux/macOS/Git Bash)
```bash
rm -rf node_modules package-lock.json
```

## Delete `.next` build cache (Linux/macOS/Git Bash)
```bash
rm -rf .next
```

## Reinstall everything
```bash
npm install
```

## Fresh clean install from lockfile
```bash
npm ci
```

`npm ci` is best when:
- you already have a lockfile
- you want a clean deterministic install
- you want CI/CD-style reliability

---

# 12) Cleaning on Windows PowerShell

## Delete `node_modules`
```powershell
Remove-Item -Recurse -Force node_modules
```

## Delete package-lock.json
```powershell
Remove-Item -Force package-lock.json
```

## Delete `.next`
```powershell
Remove-Item -Recurse -Force .next
```

## Delete `out`
```powershell
Remove-Item -Recurse -Force out
```

## Reinstall
```powershell
npm install
```

---

# 13) Clear npm Cache

## Verify npm cache
```bash
npm cache verify
```

## Clean npm cache forcefully when needed
```bash
npm cache clean --force
```

Use cache cleaning only when you actually have a corrupted or stubborn install problem.

---

# 14) Inspect Installed Packages

## List top-level installed packages
```bash
npm list --depth=0
```

## List one specific package
```bash
npm list next
```

## Explain why a package is installed
```bash
npm explain package-name
```

Example:
```bash
npm explain webpack
```

---

# 15) Common File/Folder Cleanup

## Remove the production export folder
```bash
rm -rf out
```

## Remove local environment file if you want to reset secrets
```bash
rm -f .env.local
```

## Remove all local env files carefully
```bash
rm -f .env .env.local .env.development.local .env.production.local
```

Only delete env files if you are sure you have backups of needed values.

---

# 16) Useful Project Scripts You May Add

A common `package.json` scripts block might look like this:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "clean": "rimraf .next out",
    "reinstall": "rimraf node_modules package-lock.json && npm install"
  }
}
```

If you use Windows and want cross-platform cleanup commands, install:
```bash
npm install -D rimraf
```

Then you can run:
```bash
npm run clean
```

---

# 17) Add Tailwind CSS to an Existing Next.js Project

If Tailwind was not added during project creation, install it in the way currently supported by the official Tailwind setup for your chosen version.

For many projects, the workflow starts with:
```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

Then configure your CSS and PostCSS according to the Tailwind version you are using.

Because Tailwind setup details can differ by major version, always verify the official install guide for the exact version in your project before copying older snippets blindly.

---

# 18) Add Common Libraries to a Modern Next.js App

## Firebase
```bash
npm install firebase firebase-admin
```

## Forms + validation
```bash
npm install react-hook-form zod @hookform/resolvers
```

## UI utilities
```bash
npm install clsx tailwind-merge
```

## Icons
```bash
npm install lucide-react
```

## Toasts
```bash
npm install sonner
```

## Data fetching
```bash
npm install @tanstack/react-query
```

## Charts
```bash
npm install recharts
```

---

# 19) Create Useful Files Quickly

## Create an `.env.local` file (Linux/macOS/Git Bash)
```bash
touch .env.local
```

## Create a route folder and page in App Router (Linux/macOS/Git Bash)
```bash
mkdir -p src/app/dashboard && touch src/app/dashboard/page.tsx
```

## Windows PowerShell equivalent
```powershell
New-Item -ItemType File .env.local
New-Item -ItemType Directory src/app/dashboard -Force
New-Item -ItemType File src/app/dashboard/page.tsx -Force
```

---

# 20) Environment Variable Notes

## Local development env file
```text
.env.local
```

## Typical command flow after editing env vars
```bash
npm run dev
```

If your dev server is already running, stop it and start it again after changing environment variables.

---

# 21) App Router File Creation Cheatsheet

## Home page
```text
src/app/page.tsx
```

## About page
```text
src/app/about/page.tsx
```

## Dynamic route
```text
src/app/blog/[slug]/page.tsx
```

## API route / route handler
```text
src/app/api/hello/route.ts
```

## Global layout
```text
src/app/layout.tsx
```

## Loading UI
```text
src/app/loading.tsx
```

## Error UI
```text
src/app/error.tsx
```

---

# 22) Next.js Static Export Commands

If your project is designed to be exported statically, use the appropriate Next.js config and then run:

```bash
npm run build
```

A static export may produce an `out/` directory depending on your configuration and versioned workflow.

If your deployment target is a static host, verify that your app does not rely on unsupported server-only features before choosing this path.

---

# 23) Production Debugging / Information Commands

## Show environment and package information
```bash
npx next info
```

## Check project directory size quickly (Linux/macOS)
```bash
du -sh .next node_modules
```

## Windows PowerShell basic folder size inspection
```powershell
Get-ChildItem .next
Get-ChildItem node_modules
```

---

# 24) Delete a Next.js Project Completely

## Linux/macOS/Git Bash
```bash
rm -rf my-next-app
```

## Windows PowerShell
```powershell
Remove-Item -Recurse -Force my-next-app
```

Be very careful before running project deletion commands.

---

# 25) Reset Git in a New Next.js Project

## Initialize Git
```bash
git init
```

## Add files
```bash
git add .
```

## First commit
```bash
git commit -m "Initial Next.js project setup"
```

## Rename branch to main
```bash
git branch -M main
```

---

# 26) Typical Daily Workflow Commands

## Start work
```bash
npm run dev
```

## Install a new package
```bash
npm install package-name
```

## Run lint
```bash
npm run lint
```

## Run type-check
```bash
npx tsc --noEmit
```

## Build before deployment
```bash
npm run build
```

## Start production locally for testing
```bash
npm run start
```

---

# 27) Typical Recovery Workflow When the Project Breaks

## Step 1: stop the dev server

## Step 2: remove build cache
```bash
rm -rf .next
```

## Step 3: reinstall packages cleanly
```bash
rm -rf node_modules package-lock.json
npm install
```

## Step 4: run lint and type-check
```bash
npm run lint
npx tsc --noEmit
```

## Step 5: run dev again
```bash
npm run dev
```

---

# 28) Package Manager Notes

## Enable Corepack when using pnpm/yarn through Node tooling
```bash
corepack enable
```

## Prepare a pnpm version explicitly
```bash
corepack prepare pnpm@latest --activate
```

## Check pnpm version
```bash
pnpm -v
```

Note: newer Node.js documentation states bundled Corepack will no longer ship starting with Node.js 25, so on future Node 25+ environments you may need the userland Corepack package or direct package-manager installation instead of assuming it is bundled.

---

# 29) Common npm Command Summary

## Install dependencies
```bash
npm install
```

## Clean deterministic install
```bash
npm ci
```

## Install one dependency
```bash
npm install package-name
```

## Install one dev dependency
```bash
npm install -D package-name
```

## Remove a dependency
```bash
npm uninstall package-name
```

## Update dependencies within ranges
```bash
npm update
```

## Check outdated packages
```bash
npm outdated
```

## Verify cache
```bash
npm cache verify
```

## Clean cache
```bash
npm cache clean --force
```

---

# 30) Recommended Minimal Commands for Your First Day

If you only want the shortest useful starter list:

## Create app
```bash
npx create-next-app@latest my-next-app --ts --tailwind --src-dir --app --import-alias "@/*"
```

## Enter folder
```bash
cd my-next-app
```

## Start dev server
```bash
npm run dev
```

## Install Firebase
```bash
npm install firebase firebase-admin
```

## Run lint
```bash
npm run lint
```

## Type-check
```bash
npx tsc --noEmit
```

## Build
```bash
npm run build
```

## Start production locally
```bash
npm run start
```

---

# 31) Safe Notes and Warnings

- Do not delete `.env.local` unless you are sure your secrets are backed up.
- Do not use `npm cache clean --force` as a routine habit; use it only when needed.
- Prefer `npm ci` in CI/CD and reproducible installs.
- Prefer `npm outdated` before blindly upgrading everything.
- Test `npm run build` before deployment.
- If you use server features, confirm your hosting target supports them.
- If you use a static deployment target, verify that your project is compatible with static export.

---

# 32) Suggested Extra Scripts for a Professional Setup

Example:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "check": "npm run lint && npm run typecheck && npm run build",
    "clean": "rimraf .next out",
    "clean:all": "rimraf .next out node_modules package-lock.json",
    "reinstall": "npm run clean:all && npm install"
  }
}
```

---

# 33) Final Quick Reference

## Create
```bash
npx create-next-app@latest my-next-app
```

## Dev
```bash
npm run dev
```

## Build
```bash
npm run build
```

## Start production
```bash
npm run start
```

## Lint
```bash
npm run lint
```

## Type-check
```bash
npx tsc --noEmit
```

## Install package
```bash
npm install package-name
```

## Remove package
```bash
npm uninstall package-name
```

## Update packages
```bash
npm update
```

## Check outdated
```bash
npm outdated
```

## Clean install
```bash
npm ci
```

## Delete cache/build folders
```bash
rm -rf .next out node_modules
```

---

End of guide.
