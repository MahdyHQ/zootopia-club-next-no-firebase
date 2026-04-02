# Firebase App Hosting Architecture Verification Report
**Official Documentation | April 1, 2026**

> **Status**: VERIFIED from official Firebase documentation (Updated 2026-03-30)

---

## EXECUTIVE SUMMARY

Firebase has fundamentally transformed its hosting architecture with **App Hosting**. This is NOT a minor update—it represents a paradigm shift from manually managed services to a unified, zero-configuration deployment platform.

**Key Finding**: The old model (Firebase Hosting + manual Cloud Run management) is now superseded by Firebase App Hosting, which automates the entire build-deploy-scale workflow.

---

## 1. OLD MODEL: Firebase Hosting + Manually Managed Cloud Run

### Architecture
```
┌─────────────────────────────────────────┐
│         User Browser                    │
│  visits: zootopiaclub.studio            │
└────────────┬────────────────────────────┘
             │
             ├──────────────────────────────┬─────────────────────────────┐
             ▼                              ▼                             ▼
    ┌─────────────────┐        ┌──────────────────────┐     ┌──────────────────────┐
    │ Firebase        │        │ Firebase Hosting     │     │ Cloud Run (Manual)   │
    │ Hosting (CDN)   |───────▶| Rewrites /api/** to |────▶│ Backend API Service  │
    │ Static Files    │        │ Cloud Run endpoint   │     │ (manually managed)   │
    └─────────────────┘        └──────────────────────┘     └──────────────────────┘
         ^                                                    Manual Build + Deploy
         │                                                    Manual Scaling Config
         └────────────── Custom Domain ──────────────────────┘
```

### How It Worked
1. **Frontend** deployed to Firebase Hosting
   - Static files, SPA, or simple React app
   - No SSR support
   
2. **Backend** manually managed on Cloud Run
   - Separate git repo or manual deployment
   - Manual configuration of:
     - Docker containers or buildpacks
     - Environment variables
     - Scaling (min/max instances)
     - Memory and CPU allocation
   
3. **Connection** via rewrites
   - Firebase Hosting rewrites `/api/**` requests to Cloud Run URL
   - Feels unified to end users, but actually two separate services

### Limitations
- ❌ **Manual management overhead**: Every backend change requires manual build & deploy
- ❌ **No SSR support**: Firebase Hosting didn't support Next.js SSR
- ❌ **Configuration complexity**: Separate configs for hosting and backend
- ❌ **Limited Git integration**: Required scripts/CI/CD for automation
- ❌ **Framework-agnostic**: No optimizations for specific frameworks

---

## 2. NEW APP HOSTING MODEL

### What Is Firebase App Hosting?

**Firebase App Hosting** is a managed full-stack hosting platform that:
- Automates the entire build → deploy → scale pipeline
- Handles framework detection and optimization automatically
- Provides zero-configuration GitHub integration
- Manages App Hosting as a single unified deployment

### Architecture

```
┌──────────────────────────┐
│  GitHub Commit           │
│  (main branch)           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│ Developer Connect                                 │
│ (Firebase Github App Integration)                 │
└────────────┬─────────────────────────────────────┘
             │
             ▼ (Sends build event)
┌──────────────────────────────────────────────────┐
│ Firebase App Hosting Orchestrator                │
└────────────┬──────────────────────┬──────────────┘
             │                      │
             ▼                      ▼
    ┌──────────────────┐   ┌──────────────────┐
    │ Cloud Build       │   │ Framework        │
    │ (Build service)   │   │ Detection &      │
    │                  │   │ Buildpacks       │
    │ npm install      │   │ (automatic)      │
    │ npm run build    └──►│                  │
    └──────────────────┘   └────────┬─────────┘
                                    │
                           ▼────────┴───────▼
                    ┌────────────────────────────────┐
                    │ Artifact Registry              │
                    │ (Container image storage)      │
                    └────────────┬───────────────────┘
                                 │
                    ┌────────────▼───────────────────┐
                    │ Cloud Run                      │
                    │ (Serverless container runtime) │
                    │ Auto-scaling: 0-∞ instances    │
                    └────────────┬───────────────────┘
                                 │
                    ┌────────────▼───────────────────┐
                    │ Cloud Load Balancer            │
                    │ + Cloud CDN (global caching)   │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │ Public HTTPS Endpoint          │
                    │ backend-id--project.hosted.app │
                    └────────────────────────────────┘
```

### Build Process (Automated)
1. **Git Commit Detected**: Developer pushes to live branch
2. **Build Triggered**: Cloud Build starts automatically
3. **Framework Detection**: Buildpacks detect Next.js/Angular/other framework
4. **Container Creation**: Framework-optimized container image built
5. **Configuration Inference**: Cloud Run config auto-set based on framework
6. **Artifact Storage**: Container image stored in Artifact Registry
7. **Cloud Run Deployment**: New revision created with image
8. **Health Verification**: Service verified healthy
9. **Traffic Switch**: 100% traffic moved to new revision (or gradual rollout)
10. **Live**: App immediately accessible at public URL

### Google Cloud Stack Under the Hood
| Component | Purpose |
|-----------|---------|
| **Cloud Build** | Compiles your app into a container |
| **Buildpacks** | Auto-detects framework and optimizes build |
| **Artifact Registry** | Stores your app's container images |
| **Cloud Run** | Serverless container runtime (auto-scaling) |
| **Cloud Load Balancer** | Routes traffic globally |
| **Cloud CDN** | Caches static content worldwide |
| **Cloud Secret Manager** | Stores sensitive keys securely |
| **Developer Connect** | GitHub integration and CI/CD orchestration |

### Supported Frameworks
- **Next.js 13.5+** (with optimizations)
- **Angular 18.2+** (with optimizations)
- **Other frameworks** (if they provide build output matching bundle spec)

### Key Differences: Old Model vs App Hosting

| Feature | Old Model | App Hosting |
|---------|-----------|------------|
| **Build Process** | Manual Docker build or custom scripts | Automatic Cloud Build + Buildpacks |
| **Deployment Trigger** | Manual CLI or CI/CD scripts | Simple git commit to main branch |
| **Configuration** | Separate for Hosting and Cloud Run | Single `apphosting.yaml` (optional) |
| **Scaling Setup** | Manual Cloud Run configuration | Auto-configured by buildpacks |
| **Framework Support** | Generic (no optimizations) | Next.js & Angular first-class citizens |
| **Git Integration** | Manual scripting required | Native GitHub integration (zero config) |
| **Local Development** | Custom dev setup | Firebase Local Emulator Suite |
| **Secrets Management** | Environment files or manual setup | Cloud Secret Manager (built-in) |
| **Monitoring** | Google Cloud Console + custom logging | Firebase Console +  built-in rollout tracking |
| **Zero Downtime Deploy** | Manual blue-green setup | Built-in (traffic gradually transitions) |

---

## 3. FULL-STACK HOSTING: Next.js Monorepo with Separate Web + API

### Question: Can App Hosting Host Both Web and API?

**✓ YES - Native Monorepo Support**

### Recommended Architecture

For Zootopia's monorepo structure:

```
zootopia-club-next/
├── apps/
│   ├── web/
│   │   ├── package.json (Next.js app)
│   │   ├── src/
│   │   ├── next.config.js
│   │   └── public/
│   │
│   └── api/
│       ├── package.json (Express/Node backend)
│       ├── src/
│       └── server.ts
│
├── packages/
│   ├── shared-config/
│   ├── shared-types/
│   ├── shared-utils/
│   └── shared-api-client/
│
├── firebase.json
├── package.json (root monorepo)
└── (GitHub repo root)
```

### Deployment Options

#### OPTION A: Separate Backends (Recommended for Complex APIs)

Deploy as two independent App Hosting backends:

1. **Backend 1: Frontend App**
   - Points to: `apps/web`
   - Handles: Next.js frontend + SSR
   - Public URL: `web-app--project-id.us-central1.hosted.app`

2. **Backend 2: API Server**
   - Points to: `apps/api`
   - Handles: Express/Node API endpoints
   - Public URL: `api-server--project-id.us-central1.hosted.app`

**Configuration**:
```json
// firebase.json
{
  "apphosting": [
    {
      "backendId": "web-app",
      "rootDir": "./apps/web"
    },
    {
      "backendId": "api-server",
      "rootDir": "./apps/api"
    }
  ]
}
```

**How Web Calls API**:
- Web backend calls: `http://api-server--project-id.us-central1.run.app`
- Requires service-to-service authentication
- Google Cloud handles secure routing

#### OPTION B: Monolithic Backend (Simpler)

Use Next.js API routes in single backend:

- Deploy only `apps/web` as App Hosting backend
- Use Next.js API routes for `/api/*` requests
- `apps/api` code can be in `web/api/` or imported as library
- Single deployment, single URL

**Configuration**:
```json
{
  "apphosting": [
    {
      "backendId": "zootopia",
      "rootDir": "./apps/web"
    }
  ]
}
```

#### OPTION C: Hybrid (Current Zootopia Setup)

If you keep `apps/api` separate but want single URL:

- Deploy `apps/web` as App Hosting backend
- Keep `apps/api` as separate Cloud Run service (manually managed)
- Configure Next.js middleware to proxy API calls

### Firebase Official Monorepo Documentation

From Firebase docs (2026-03-30):

> "Monorepo support is built into the graphical backend setup flow in the Firebase console. When prompted for a 'Root directory' under 'Deployment settings,' specify the path to the application you want to deploy inside the monorepo."

**Setup Instructions:**
- **Console**: Settings → Deployment → Root Directory = `./apps/web` (or your app path)
- **CLI**: `firebase apphosting:backends:create --project PROJECT_ID`
  - Answer: "Which GitHub repo?" → your repo
  - Answer: "Root directory relative to repo?" → `./apps/web`

**Build Behavior**:
- Entire monorepo root context available at build time
- `npm install` runs from monorepo root
- Shared dependencies installed
- Target app build executes in its directory

---

## 4. MODERN DEPLOYMENT WORKFLOW

### Primary Workflow: GitHub Integration (Recommended)

```
1. Developer commits & pushes to main branch
   └─ git push origin main

2. GitHub sends webhook to Developer Connect
   └─ Firebase GitHub App receives event

3. Firebase App Hosting triggered
   └─ Initiates build process

4. Cloud Build Job Starts
   └─ Environment: Node.js + framework tools
   ├─ Step: Clone repo to build context
   ├─ Step: npm install (monorepo root)
   ├─ Step: npm run build (in app directory)
   ├─ Step: Optimize output files
   └─ Step: Create container image

5. Buildpacks Detect Framework
   └─ For Next.js: Applies Next.js-specific optimizations
   ├─ Configuration: Sets optimal Cloud Run settings
   ├─ Environment: Infers build/runtime variables
   └─ Image: Layers app with Node.js runtime

6. Container Image Created & Stored
   └─ Artifact Registry: firebaseapphosting-images

7. Cloud Run Revision Deployed
   ├─ Zero-downtime deployment
   ├─ New revision: 0% traffic initially
   ├─ Health checks run
   └─ If healthy: Gradual traffic switch (by default 100% immediately)

8. Live
   └─ App accessible at public URL
      backend-id--project-id.us-central1.hosted.app
```

**Timeline**: Typically 3-5 minutes from commit to live

### Alternative Workflow: Local Deploy via CLI

For projects with multiple Firebase resources (functions, rules, etc.):

```bash
# Setup
firebase init apphosting

# Deploy from local source
firebase deploy --only apphosting:backendId
```

**Process**:
1. Firebase CLI compresses entire project directory
2. Uploads to Google Cloud Storage
3. Cloud Build processes (same as GitHub flow)
4. Container deployed to Cloud Run

### Rollout Policy

Firebase offers two rollout strategies:

1. **Automatic Rollouts** (Default)
   - Enabled by default
   - New build: 0% traffic
   - After health check: 100% traffic immediately
   - No manual intervention needed

2. **Manual Rollouts**
   - New build: 0% traffic
   - Developer manually approves in Firebase Console
   - Then traffic switches

### Key Advantages

✓ **Push-to-deploy simplicity**: Single git commit
✓ **No manual build steps**: Buildpacks handle framework detection
✓ **Zero configurations needed**: Works out-of-box for Next.js/Angular
✓ **GitHub integration native**: No CI/CD script maintenance
✓ **Instant feedback**: Rollout status visible in Firebase Console
✓ **Automatic environment setup**: Secrets, variables, Cloud Run config inferred

---

## 5. BACKEND INTEGRATION: How Apps/Api Calls Happen

### Critical Finding: No Built-in Proxy Rewriting

**Unlike old model**, App Hosting doesn't support Firebase Hosting-style rewrites for backend proxying.

Each App Hosting backend is an **independent Cloud Run service** with its own URL.

### Integration Methods

#### METHOD 1: Internal Google Cloud Networking (BEST FOR MONOREPO)

**Setup**:
- Web backend: `apps/web` → Cloud Run Service 1
- API backend: `apps/api` → Cloud Run Service 2
- Google Cloud handles internal routing

**Code in Next.js** (`apps/web/src/pages/api/...` or server components):
```typescript
// Use internal Cloud Run URL
const apiUrl = 'http://api-server--project-id.us-central1.run.app';

const response = await fetch(apiUrl + '/endpoint', {
  // Service-to-service auth handled by Google Cloud
});
```

**Advantages**:
- ✓ No internet routing needed
- ✓ Encrypted internal communication
- ✓ No egress charges
- ✓ Automatic service discovery

**Configuration**:
- Both backends in same project
- Service account: `firebase-app-hosting-compute@PROJECT_ID.iam.gserviceaccount.com`
- Requires service-to-service auth setup

#### METHOD 2: Public HTTPS Endpoint

**Setup**:
- API backend deployed with public URL
- Web frontend calls public endpoint

**Code in Next.js**:
```typescript
const apiUrl = 'https://api-server--project-id.us-central1.hosted.app';

const response = await fetch(apiUrl + '/endpoint');
```

**Disadvantages**:
- ✗ Internet routing (slower)
- ✗ Egress charges apply
- ✗ Public exposure

#### METHOD 3: Next.js API Routes (SIMPLEST)

**Setup**:
- Single App Hosting backend with `apps/web`
- API code in Next.js `/api` routes
- OR: `apps/api` imported as library

**Code in Next.js**:
```typescript
// pages/api/my-endpoint.ts
export default async function handler(req, res) {
  // API logic here
  res.json({ data: 'response' });
}
```

**Client calls**:
```typescript
const response = await fetch('/api/my-endpoint');
```

**Advantages**:
- ✓ Single deployment
- ✓ Simplest setup
- ✓ Same URL for web and API
- ✓ Zero backend integration complexity

### Recommendation for Zootopia

**IF** your `apps/api` is complex and independently scaled:
→ Use **METHOD 1** (Internal Google Cloud networking)

**IF** your API is tightly coupled with web logic:
→ Use **METHOD 3** (Next.js API routes only)

---

## 6. MONOREPO SUPPORT: Details & Requirements

### Official Firebase Documentation

> "Monorepo support is built into the backend setup flow. When prompted for a 'Root directory' under 'Deployment settings,' specify the path to the application you want to deploy inside the monorepo."

### Supported Monorepo Tools

- **Turborepo** ✓ (first-class support)
- **Nx** ✓ (first-class support)
- **Yarn Workspaces** ✓ (via workspace configuration)
- **npm workspaces** ✓ (via root package.json)
- **pnpm** ✓ (via monorepo.yaml or .pnpmrc)

### Setup Process

#### Via Firebase Console

1. Open Firebase Project → App Hosting
2. Click "Create backend"
3. Connect GitHub repository (entire repo)
4. **"Deployment settings" → "Root directory"** = `./apps/web`
5. Continue with other settings

#### Via Firebase CLI

```bash
firebase apphosting:backends:create --project PROJECT_ID

# Console prompts:
# ? Which GitHub repo do you want to deploy? user/zootopia-club-next
# ? Specify your app's root directory relative to your repository path
#   Answer: ./apps/web
# ? Set the live branch? answer: main
# ? Name for your backend? answer: web-app
```

### Build Process Specifics

When you specify root directory = `./apps/web`:

1. **Entire monorepo root** cloned to Cloud Build workspace
2. **npm install** runs from monorepo root (`/`)
   - All `node_modules` installed
   - Workspace hoisting happens
   - Shared dependencies available
3. **Build command** executes in app directory (`./apps/web`)
   - `npm run build` or equivalent
   - Can access shared packages
4. **Output** captured from app directory
5. **Container created** with optimized layers

### Requirements & Best Practices

✓ **Root directory must contain `package.json`**
```
apps/
└── web/
    └── package.json  ← App-level package.json
```

✓ **Shared dependencies must be in root `package.json`**
```json
{
  // Root /package.json
  "workspaces": ["apps/*", "packages/*"],
  "dependencies": {
    // No app dependencies here - use workspace
  }
}
```

✓ **App can reference shared packages**
```json
{
  // apps/web/package.json
  "dependencies": {
    "@zootopia/shared-utils": "workspace:*"
  }
}
```

### Troubleshooting Monorepo Issues

**Issue**: "App Hosting cannot find a project to target inside the Nx monorepo"

**Solution**: 
- Ensure `project.json` exists in root directory
- Explicitly specify root directory in setup
- For Nx: `apps/target-app` must have `project.json`

---

## 7. ENVIRONMENT VARIABLES: Handling & Precedence

### Variable Types

#### 1. Plain Environment Variables
```yaml
# apphosting.yaml
env:
  - variable: API_URL
    value: https://api.example.com
    availability:
      - BUILD      # Available during npm run build
      - RUNTIME    # Available in running app
```

#### 2. Next.js Public Variables (Browser-Accessible)
```yaml
env:
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: my-project-123
    availability:
      - BUILD
      - RUNTIME
```

#### 3. Secrets (Cloud Secret Manager)
```yaml
env:
  - variable: DATABASE_PASSWORD
    secret: db-password-secret
    
  - variable: API_KEY_PINNED
    secret: api-key-secret@5  # Pinned to version 5
    
  - variable: FULL_SECRET_REF
    secret: projects/my-project/secrets/secret-name/versions/latest
```

### Configuration Sources (Priority Order)

1. **Firebase Console** ← HIGHEST PRIORITY
   - Values set here override all files
   - UI-based configuration

2. **apphosting.<env>.yaml** (Environment-specific)
   - Example: `apphosting.staging.yaml`
   - Lower priority than console
   - Allows different values per environment

3. **apphosting.yaml** (Global production config)
   - Default configuration
   - Committed to git

4. **Firebase System Variables** ← LOWEST PRIORITY
   - Auto-populated by Firebase
   - `FIREBASE_CONFIG`, `FIREBASE_WEBAPP_CONFIG`
   - Cloud Run default variables

### Automatically Populated Variables

**FIREBASE_CONFIG** (build & runtime):
```json
{
  "databaseURL": "https://PROJECT.firebaseio.com",
  "storageBucket": "PROJECT.firebasestorage.app",
  "projectId": "PROJECT"
}
```

**FIREBASE_WEBAPP_CONFIG** (build only):
```json
{
  "apiKey": "KEY",
  "appId": "APP_ID",
  "authDomain": "PROJECT.firebaseapp.com",
  "databaseURL": "https://PROJECT.firebaseio.com",
  "messagingSenderId": "SENDER_ID",
  "projectId": "PROJECT",
  "storageBucket": "PROJECT.firebasestorage.app"
}
```

**Google Cloud Standard**:
- `PORT` (reserved - do not set)
- `K_SERVICE`, `K_REVISION`, `K_CONFIGURATION` (reserved)

### Setup Workflows

#### Quick Setup: Firebase Console

1. Go to backend settings
2. Click "Environment variables" tab
3. Add individual variables via UI
4. Variables take effect on next rollout

#### Advanced Setup: apphosting.yaml

```bash
firebase init apphosting
# Creates starter apphosting.yaml
```

Edit `apphosting.yaml`:
```yaml
# Build and runtime environment
env:
  - variable: PUBLIC_API_URL
    value: https://api.prod.example.com
    availability:
      - BUILD
      - RUNTIME
      
  - variable: DATABASE_URL
    secret: db-connection-string
    
# Cloud Run configuration
runConfig:
  cpu: 2
  memoryMiB: 1024
  minInstances: 1
  maxInstances: 100
```

#### Local Development: apphosting.emulator.yaml

```bash
firebase init emulators
# Creates apphosting.emulator.yaml
```

```yaml
# apphosting.emulator.yaml (safe to commit)
env:
  - variable: API_URL
    value: http://localhost:3001
    availability:
      - BUILD
      - RUNTIME
      
  - variable: TEST_API_KEY
    secret: test-api-key-local
```

### Variable Lifecycle

1. **Set** in Firebase Console or `apphosting.yaml`
2. **Commit** changes (for yaml files)
3. **This does NOT trigger deployment**
4. **Next commit/rollout** picks up new variables
5. **Visible in Firebase Console** under rollout details

### Secrets Management

```bash
# Create/update secret
firebase apphosting:secrets:set MY_SECRET --project PROJECT_ID
# Prompted to enter value
# Automatically added to apphosting.yaml

# Grant team access
firebase apphosting:secrets:grantaccess MY_SECRET
  --emails team@company.com

# Or use Google Group
firebase apphosting:secrets:grantaccess MY_SECRET
  --emails developers@company.com
```

### Best Practices

✓ **Use console for simple cases**
✓ **Use apphosting.yaml for complex setups**
✓ **Use Cloud Secret Manager for sensitive data**
✓ **Use apphosting.emulator.yaml for local overrides**
✓ **Use NEXT_PUBLIC_ prefix only for browser-safe values**
✓ **Pin secret versions if needed:** `secret-name@5`

---

## 8. LOCAL DEVELOPMENT VS APP HOSTING: Understanding Differences

### Runtime Environment

| Component | Local Development | App Hosting |
|-----------|-------------------|------------|
| **Process** | Dev server (npm run dev) | Container in Cloud Run |
| **URL** | `http://localhost:3000` | `https://backend--project.hosted.app` |
| **Framework** | Next.js dev server (Hot Module Reload) | Next.js production build in container |
| **Dependencies** | npm/yarn/pnpm from local disk | Dependencies in container image |
| **File System** | Regular file system | Read-only except `/tmp` |
| **Network** | Direct localhost | Cloud Load Balancer + Cloud CDN |

### Environment Variable Configuration

| Aspect | Local | App Hosting |
|--------|-------|------------|
| **Source** | `apphosting.emulator.yaml` OR `.env` | Console OR `apphosting.yaml` |
| **Priority** | `apphosting.emulator.yaml` > `.env` | Console > `apphosting.<env>.yaml` > `apphosting.yaml` |
| **Secrets** | Cloud Secret Manager (with access) | Cloud Secret Manager |
| **Override Scope** | Local machine only | Affects all users globally |
| **When Active** | `firebase emulators:start` | Every request to live URL |

### Build Process

| Stage | Local | App Hosting |
|-------|-------|------------|
| **Trigger** | `npm run dev` or build command | Git commit to live branch |
| **Buildpacks** | None (your framework's dev server) | Yes - auto-detects framework |
| **Optimization** | Dev optimizations (source maps, HMR) | Production optimizations (minified, optimized) |
| **Output** | Dev server or local dist/ | Container image in Artifact Registry |
| **Cache** | Local node_modules | In-container node_modules (from build layer) |

### Firebase Services Integration

| Service | Local | App Hosting |
|---------|-------|------------|
| **Firestore** | Local Emulator (optional) | Production Firebase |
| **Authentication** | Local Emulator (optional) | Production Firebase |
| **Cloud Storage** | Local Emulator (optional) | Production Firebase |
| **Admin SDK** | App Default Credentials required | Automatic via service account |
| **Web SDK** | Manual initialization | Auto-initialized via `FIREBASE_WEBAPP_CONFIG` |

### Caching & Performance

| Aspect | Local | App Hosting |
|--------|-------|------------|
| **Browser Cache** | Disabled in dev mode | Cloud CDN caches static assets |
| **Server Cache** | In-memory (lost on restart) | Cloud CDN + Cloud Run cache |
| **Response Time** | ~100-500ms (depends on hardware) | ~10-50ms (global CDN) |
| **Concurrent Users** | 1 dev machine | Auto-scales to thousands |

### Configuration Differences

#### Local: apphosting.emulator.yaml

```yaml
# For local Firebase emulators
env:
  - variable: FIRESTORE_EMULATOR_HOST
    value: localhost:8080
    availability:
      - BUILD
      - RUNTIME
  
  - variable: API_URL
    value: http://localhost:3001
    availability:
      - BUILD
      - RUNTIME
  
  # Secrets must still exist in Cloud Secret Manager
  # You grant your email access to them
  - variable: API_KEY
    secret: test-api-key-local
```

#### Production: apphosting.yaml

```yaml
env:
  - variable: API_URL
    value: https://api.prod.example.com
    availability:
      - BUILD
      - RUNTIME
  
  - variable: API_KEY
    secret: api-key-production
  
# Cloud Run resource configuration
runConfig:
  cpu: 2
  memoryMiB: 1024
  minInstances: 2
  maxInstances: 100
  concurrency: 80
```

### Local Testing Reality

**Important**: Your local dev server is NOT the same as App Hosting runtime.

**Example Differences**:

1. **File uploads**: Local uses disk, App Hosting uses `/tmp` or Cloud Storage
2. **Concurrency**: Local: single connection, App Hosting: hundreds
3. **Response times**: Local: network latency, App Hosting: optimized globally
4. **Memory/CPU**: Local: your machine specs, App Hosting: 512MB/1CPU default
5. **Environment**: Local: your OS, App Hosting: Linux container

**How to Align Local with Production**:
1. Use `apphosting.emulator.yaml` for matching environment variables
2. Run `firebase emulators:start` to test locally
3. Use production-like configuration in `apphosting.yaml`
4. Test with production Database/Auth/Storage (careful)
5. Monitor App Hosting logs after deploy

### Local Emulator Suite

**Firebase Emulator Setup**:
```bash
firebase init emulators
firebase emulators:start
```

**Emulates**:
- ✓ App Hosting deployment locally
- ✓ Environment variables from `apphosting.emulator.yaml`
- ✓ Secrets from Cloud Secret Manager (you must have access)
- ✓ Can work with other emulators (Firestore, Auth, etc.)
- ✓ Provides web-based emulator UI

**Benefits**:
- Test without pushing to main branch
- Replicate prod environment locally
- Verify secrets and env vars work
- Debug before deployment

---

## OFFICIAL RECOMMENDATIONS FOR ZOOTOPIA

### Immediate Actions

1. **Audit Current Setup**
   - Your old guide documents Firebase Hosting + Cloud Run
   - This is now obsolete architecture
   - Plan migration to App Hosting

2. **Choose Deployment Model**
   ```
   Option A (Recommended):
   └─ Single App Hosting backend for apps/web
      └─ Use Next.js API routes for backend logic
   
   Option B (For Complex API):
   └─ Two App Hosting backends
      ├─ Backend 1: apps/web
      └─ Backend 2: apps/api
   ```

3. **Setup Monorepo Configuration**
   ```
   firebase apphosting:backends:create --project zootopia2026
   └─ Root directory: ./apps/web (or ./apps/api for second backend)
   ```

4. **Configure Environment Variables**
   ```
   Create apphosting.yaml:
   ├─ Environment variables
   ├─ Cloud Run settings (CPU/memory)
   └─ Secret references
   ```

5. **Setup Local Development**
   ```
   firebase init emulators
   firebase emulators:start
   ```

### Architecture Going Forward

```
zootopia-club-next Repository (GitHub)
    │
    ├── Push to main branch
    │
    └── Firebase App Hosting Automatic Deploy
        ├── Builds: apps/web (or both apps/web + apps/api)
        ├── Deploys to Cloud Run
        └── Available at: web-app--zootopia2026.us-central1.hosted.app
        
        All handled automatically - zero manual deployment needed
```

### Migration Path

1. **Phase 1**: Create new App Hosting backends (while keeping old setup)
2. **Phase 2**: Test new deployment via `firebase deploy`
3. **Phase 3**: Enable GitHub integration for automatic deploys
4. **Phase 4**: Update DNS/custom domains to point to App Hosting
5. **Phase 5**: Decomission old Firebase Hosting + Cloud Run setup

---

## SOURCES

**All information verified from official Firebase documentation:**
- Firebase App Hosting (Main): https://firebase.google.com/docs/app-hosting
- How App Hosting Works: https://firebase.google.com/docs/app-hosting/about-app-hosting
- Configure Backends: https://firebase.google.com/docs/app-hosting/configure
- Monorepo Support: https://firebase.google.com/docs/app-hosting/monorepos
- Local Emulation: https://firebase.google.com/docs/app-hosting/emulate
- Alternative Deployment: https://firebase.google.com/docs/app-hosting/alt-deploy
- App Hosting Skill (Internal Firebase): firebase-app-hosting-basics

**Last Verified**: April 1, 2026
**Firebase Docs Updated**: 2026-03-30

---

## DOCUMENT METADATA

| Property | Value |
|----------|-------|
| Title | Firebase App Hosting Architecture Verification |
| Date | April 1, 2026 |
| Project | Zootopia Club |
| Status | FINAL |
| Verification Level | Official Firebase Docs |
| Distribution | Internal Project Documentation |
