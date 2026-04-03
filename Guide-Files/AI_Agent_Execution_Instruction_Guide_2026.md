# Universal AI Agent Execution Instruction Guide (2026)

## Top 33 General Instructions for Any Agent

1. Always read `zootopia-club-next-ledger.txt` completely at the **start of every task** before doing anything else.
2. Treat the ledger as the **primary project memory and historical change log**.
3. Compare the ledger against the **real current codebase** before editing anything.
4. Always analyze the current codebase first before making changes.
5. Never rebuild from scratch unless explicitly requested.
6. Never redesign the architecture unless explicitly requested.
7. Never remove working features unless explicitly requested.
8. Never change unrelated areas.
9. Make only **minimal, surgical, backward-compatible** changes.
10. Read all relevant files fully before editing.
11. Trace imports, exports, route ownership, shared contracts, and state flow before editing.
12. Identify the smallest safe edit surface before making changes.
13. Preserve the current live runtime ownership unless a narrow change is strictly required.
14. Keep backend authority on the backend.
15. Never expose secrets, API keys, credentials, or privileged logic to the browser.
16. Do not add unnecessary packages.
17. If a dependency change is required, justify it clearly and keep it minimal.
18. Always inspect package manifests and lockfiles before changing dependencies.
19. Always check **official documentation** for every framework, library, tool, platform, system, API, or feature you touch.
20. Do not rely on memory alone when official docs are available.
21. Search for solutions when needed, including web research and official docs, instead of guessing.
22. Prefer official conventions over ad-hoc patterns.
23. Keep shared state separate from shared page UI.
24. A page may reference another page’s state, but must not become a second copy of that page.
25. Preserve dark mode, light mode, localization, and the current design language.
26. Always consider responsive behavior across all screen sizes.
27. Test and verify UI across small mobile, mobile, tablet, laptop, desktop, and ultra-wide screens.
28. Add clear comments for future agents where logic could be confusing.
29. Run lint, typecheck, and build after meaningful changes whenever possible.
30. Clearly distinguish verified facts from assumptions.
31. At the end of every task, refresh `zootopia-club-next-ledger.txt` thoroughly.
32. Replace stale current-state information in the ledger with the new truth while preserving useful history.
33. Record all meaningful changes, decisions, risks, files changed, and verification results in the ledger.

---

# 1. Purpose of This Guide

This guide defines the **standard execution instructions** that should be attached to nearly any serious task sent to an AI coding agent working on a production-style project such as **Zootopia Club Next**.

It is designed to improve quality, reduce accidental breakage, preserve architecture, strengthen documentation discipline, and ensure that agents do not make careless changes.

This guide is also meant to be reused as a persistent instruction source for:
- coding agents
- planning agents
- debugging agents
- architecture agents
- UI agents
- backend agents
- full-stack agents
- documentation agents

---

# 2. Mandatory First Step on Every Task

For **every task**, the agent must do this first:

1. Read `zootopia-club-next-ledger.txt` completely.
2. Treat it as the main project memory.
3. Compare it to the real current codebase.
4. Identify whether the ledger already matches the current repo or contains stale statements.
5. Use both the ledger and the actual code together before making decisions.

This is mandatory.

The agent must never start implementation blindly.

---

# 3. Ledger Rules

## 3.1 The ledger is not optional
The ledger must be treated as a required source of truth and project history.

## 3.2 The ledger must be refreshed after every meaningful task
At the end of any meaningful implementation, debugging, refactor, UI pass, backend change, environment clarification, deployment clarification, or architecture update, the agent must **refresh the ledger**.

## 3.3 Refresh means more than appending one tiny note
Refreshing the ledger means:
- reread the full ledger after implementation
- replace stale current-state information where needed
- preserve useful historical information
- do not leave incorrect current-state statements in the main truth sections
- add new missing facts
- record changed files
- record design/architecture decisions
- record risks
- record verification results

## 3.4 Ledger update expectations
The updated ledger should include, when relevant:
- current truth snapshot updates
- route ownership clarification
- page responsibility clarification
- backend/runtime ownership clarification
- deployment clarification
- environment clarification
- changed files
- summary of what changed
- what was preserved
- risks or follow-up notes
- verification results

---

# 4. Documentation-First Development Rule

The agent must always follow **documentation-first development**.

Before implementing any change, the agent must:
1. inspect the real repo structure
2. inspect relevant files fully
3. inspect package versions
4. inspect environment assumptions
5. inspect runtime boundaries
6. inspect official documentation for anything important being touched

The agent must not guess when documentation exists.

---

# 5. Official Documentation Rule

The agent must always check **official documentation** for any library, tool, runtime, platform, framework, system, API, feature, or configuration shape involved in the task.

This includes, but is not limited to:
- Next.js
- React
- TypeScript
- Firebase
- Firestore
- Firebase Authentication
- Firebase Storage
- Tailwind CSS
- ESLint
- deployment platforms
- build tools
- PDF/export libraries
- charting libraries
- model provider SDKs
- OpenAI-compatible provider integrations
- AI model APIs
- routing and auth systems

## 5.1 When official docs must be checked
Official docs must be checked when:
- implementing a new feature
- upgrading or replacing a library
- changing routing behavior
- changing auth/session behavior
- changing environment config
- changing deployment behavior
- changing API usage
- changing runtime behavior
- changing export or PDF generation behavior
- using a package in a new way
- dealing with a warning, deprecation, or compatibility issue

## 5.2 Do not rely on memory alone
If official docs exist, the agent must not rely on memory alone.

---

# 6. Web Research Rule

The agent should search for solutions when needed instead of guessing.

The agent may search:
- official docs
- official release notes
- official migration guides
- official API references
- high-quality library documentation
- platform documentation
- trusted technical sources when official docs are insufficient

The agent should prefer official and primary sources first.

---

# 7. Core Change-Control Rules

The agent must:
- preserve the current architecture unless a narrow change is strictly required
- preserve working features
- preserve routes, contracts, and shared state shape unless explicitly required
- preserve runtime ownership unless strictly necessary to change
- keep changes minimal and surgical
- avoid broad refactors unless explicitly requested
- avoid touching unrelated code
- avoid renaming files, routes, contracts, props, or systems unless strictly necessary

The agent must not:
- rebuild from scratch
- redesign the system casually
- create duplicate systems
- create parallel flows where one already exists
- remove compatibility layers without proof they are unnecessary

---

# 8. Repo-Analysis Rules Before Editing

Before editing, the agent must:
1. read all relevant files fully
2. trace imports and exports
3. identify central or risky files
4. trace frontend/backend boundaries
5. trace route ownership
6. trace state flow and service flow end-to-end
7. classify the issue correctly
8. identify the smallest safe edit surface
9. inspect dependency files if relevant
10. compare real code against the ledger

---

# 9. Dependency Rules

Before adding, removing, or changing any dependency, the agent must:
- inspect `package.json`
- inspect lockfiles
- verify the exact installed version
- verify compatibility with the current stack
- check official docs for the dependency
- keep changes minimal
- justify the dependency change clearly

The agent must not import undeclared packages or add packages casually.

---

# 10. Frontend / Backend Responsibility Rules

The agent must preserve clear responsibility boundaries.

## Frontend should own:
- UI rendering
- user interaction
- local presentation state
- page structure
- client-safe logic

## Backend should own:
- secrets
- provider credentials
- secure API execution
- session authority
- privileged logic
- admin authorization
- protected data access
- sensitive processing

The agent must not move backend authority into the frontend.

---

# 11. Shared State vs Shared UI Rule

This rule is extremely important.

Shared state may remain shared.
Shared UI does **not** mean that one page should visually become another page.

Examples:
- A page may reference a linked document.
- A page may show a compact summary of shared context.
- A page must not embed another full page’s interface.

A page may reference another page’s state, but it must not become a second copy of that page.

---

# 12. Page-Focus Rule

Each major page should remain focused on its own responsibility.

Examples:
- Upload page = upload/document preparation only
- Assessment page = assessment generation only
- Infographic page = infographic generation only
- Settings page = settings only

Do not let pages feel like two or more pages merged together.

---

# 13. Design and Responsiveness Rules

The agent must always pay attention to design quality across all screen types.

## 13.1 Design discipline
The agent must:
- preserve the current design language
- preserve dark/light mode behavior
- preserve localization behavior
- remove clutter, not functionality
- keep CTA hierarchy clear
- preserve visual consistency
- avoid overly dense or overlapping layouts
- ensure each page feels intentional and focused

## 13.2 Responsiveness requirement
The agent must always consider:
- small mobile
- mobile
- tablet
- laptop
- desktop
- ultra-wide screens

The agent must verify:
- spacing
- stacking
- wrapping
- overflow
- card layout
- form usability
- dropdown behavior
- button sizing
- sidebar behavior
- result preview behavior

---

# 14. Internationalization and Theme Rules

The agent must preserve or respect:
- English and Arabic support
- dark mode and light mode
- typography behavior
- locale-aware text direction if used
- theme-aware surfaces and contrast

The agent must not make a UI improvement that only works correctly in one theme or one language.

---

# 15. Environment-Aware Analysis Rule

For any runtime-sensitive task, the agent must separate analysis by environment or deployment path.

The agent should distinguish clearly between:
1. Local integrated development
2. Firebase App Hosting or the current real deployment path
3. Legacy or reference-only deployment paths
4. Future or conceptual deployment paths

For each path, the agent should clarify:
- frontend ownership
- backend ownership
- route/API behavior
- auth/session behavior
- environment variables
- same-origin vs cross-origin behavior
- what is shared vs path-specific

Do not mix environments together.

---

# 16. Verification Rules

After meaningful changes, the agent should verify as much as possible.

The preferred verification sequence is:
1. lint
2. typecheck
3. build
4. route or feature verification
5. UI verification where applicable
6. environment-sensitive reasoning where applicable

The agent must clearly distinguish:
- what was actually verified
- what could not be verified fully
- what remains an assumption
- what issues are pre-existing

---

# 17. Reporting Rules

After implementation, the agent should report clearly:
1. root cause
2. exact files changed
3. what changed
4. what was preserved
5. environment-specific impact
6. verification results
7. whether lint passed
8. whether typecheck passed
9. whether build passed
10. whether remaining issues are pre-existing only
11. exact ledger updates made

---

# 18. Commenting Rules

The agent should add comments for future agents when:
- routing logic is non-obvious
- provider selection logic is non-obvious
- runtime ownership is easy to misunderstand
- a compatibility layer exists intentionally
- a fallback path exists intentionally
- a design decision needs explanation

Comments should be useful, not noisy.

---

# 19. Safe Package and Tool Selection Rule

When choosing libraries or tools, the agent should prefer:
- official and actively maintained libraries
- high-quality, well-documented tools
- libraries compatible with the current runtime and framework versions
- tools that fit the project’s architecture cleanly
- minimal new dependencies when possible

The agent should avoid:
- old abandoned libraries
- poorly documented libraries
- unnecessary dependency proliferation
- introducing multiple overlapping tools for one job without a good reason

---

# 20. Historical vs Current Truth Rule

The agent must distinguish clearly between:
- historical notes
- intended architecture
- current actual implementation

The ledger should preserve useful history, but the main current-state sections must reflect the **actual current truth**.

The agent must not leave outdated “current truth” statements after implementation.

---

# 21. Template Block for Reuse in Any Task

Use this reusable instruction block at the beginning of serious tasks:

```text
Analyze the current codebase first before making any changes.

Mandatory first step:
Read `zootopia-club-next-ledger.txt` completely before doing anything else.
Treat it as the primary project memory and historical change log.
Then compare it against the actual current codebase before editing.

Important:
This is an existing production-style project. Do not rebuild from scratch. Do not redesign the architecture unless explicitly requested. Do not remove working features. Do not change unrelated areas. Make only minimal, surgical, backward-compatible changes.

Mandatory rules:
- Read all relevant files fully before editing
- Trace imports/exports, contracts, routes, and state flow
- Preserve architecture and runtime ownership
- Keep backend authority on the backend
- Check official documentation for every important library, tool, system, API, or feature involved in the task
- Search for solutions when needed instead of guessing
- Do not add unnecessary packages
- Preserve design quality across all screen sizes
- Preserve dark/light and localization behavior
- Update `zootopia-club-next-ledger.txt` thoroughly after meaningful changes
- Replace stale current-state information in the ledger with the new truth while preserving useful history
- Run lint, typecheck, and build whenever possible after meaningful changes
```

---

# 22. Final Rule

When in doubt, the agent should:
- read the ledger first
- inspect the real code
- check official docs
- prefer minimal changes
- preserve architecture
- preserve runtime ownership
- preserve design consistency
- verify carefully
- refresh the ledger thoroughly at the end

That is the default safe behavior.
