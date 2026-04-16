# Zootopia Club — Hybrid Credit Persistence, Admin Governance, and User Credit Visibility Guide (2026)

## Purpose

This guide is a professional implementation and investigation reference for **Zootopia Club** credit architecture in the active **Next.js 16.2.2 + Auth.js/JWT + Supabase** platform.

It is designed for:
- AI coding agents
- human developers
- future maintainers
- audit/debugging tasks involving admin credit mutations, persistence truth, and user-visible balance rendering

This guide explains:
- the **current platform truth**
- the **real credit domain model**
- the **recommended hybrid persistence architecture**
- how admin-controlled credit operations should work
- how different credit types must be separated and displayed
- how the user should see their balance in a truthful and professional way
- how to implement or migrate the system without breaking the current platform

---

# 1. Current Platform Truth

The active runtime is:

- **Monorepo:** `zootopia-club-next`
- **Primary app:** `apps/web`
- **Framework:** Next.js 16.2.2
- **Auth:** Auth.js / NextAuth v5 with JWT sessions
- **Backend provider:** Supabase
- **Canonical user-visible credit read path:** `/api/assessment/credits`
- **Admin mutation origin:** admin user-detail flow on `/admin/users/[uid]`
- **Header balance and Assessment balance:** must remain tied to server truth

This means the browser must **never become the owner of credit truth**.

The browser may:
- display balance
- trigger admin/user actions
- subscribe to realtime invalidation
- use TanStack Query as shared cache

But the browser must **not**:
- calculate secure truth on its own
- decide another user’s credit ownership
- apply privileged mutations directly
- invent hidden balance deltas

---

# 2. The Real Problem This Guide Addresses

The project has already shown strong evidence that the problem is not only UI refresh or realtime delivery.

The observed contradiction is:

- admin credit actions appear in admin activity logs
- mutation flows look successful at the admin surface
- but the persisted credit-account truth can still remain unchanged

A concrete example already observed in the database looked like this:

- repeated `add_manual_credits` / `set_manual_credits` operations were logged
- but the persisted account entity still showed `manualCredits: 0`

That means a professional agent must **not assume the issue is only frontend refresh**.

The real failure may be in one of these layers:

1. mutation computation
2. persistence write path
3. canonical read path
4. mirror/compatibility storage mismatch
5. later overwrite/reset
6. false-success logging path

---

# 3. Recommended Hybrid Architecture

## 3.1 What “hybrid” means here

In this project, a **hybrid credit system** should mean:

- **canonical truth lives in explicit relational credit tables**
- **compatibility or legacy mirrors may still exist in `zc_entities`**
- **user-visible summaries must be derived from canonical server logic**
- **legacy/document-style entity storage must not be the primary authority for credit truth**

In other words:

### Canonical source of truth
Use dedicated structured tables for:
- credit accounts
- daily credit usage
- grants
- mutation history
- audit logging

### Optional compatibility mirror
Use `zc_entities` only as one of these:
- a legacy read-compatibility layer
- a mirror for old admin tooling
- a temporary migration bridge
- a debugging snapshot store

But **not** as the primary authority if structured credit tables exist.

---

# 4. The Golden Ownership Rule

The project should have **one authoritative credit domain**, not two competing ones.

## Required rule

All credit truth should resolve from this conceptual flow:

```text
admin/user action
-> server route or server action
-> repository transaction
-> canonical credit tables
-> effective summary recomputation
-> /api/assessment/credits
-> shared TanStack Query cache
-> header / assessment / user credit details page
```

If `zc_entities` remains present, it should follow this safer role:

```text
canonical tables
-> optional mirror/update snapshot to zc_entities
```

not:

```text
sometimes write zc_entities
sometimes read tables
sometimes read zc_entities
sometimes log only
```

That mixed pattern causes silent drift.

---

# 5. Credit Types That Must Be Separated Clearly

A professional system must distinguish at least these credit types.

## 5.1 Daily credits
These are the normal recurring credits.

Recommended fields:
- `day_key`
- `daily_limit`
- `successful_generation_ids`
- `pending_reservations`
- `created_at`
- `updated_at`

Meaning:
- these reset by day/window
- they represent the user’s normal recurring allowance

## 5.2 Manual/Admin credits
These are durable extra credits controlled by admins.

Recommended fields:
- `manual_credits`
- `updated_at`
- `updated_by_uid` if tracked separately

Meaning:
- manually added by admin
- not part of the recurring daily quota
- should persist until consumed or reset

## 5.3 Grant credits
These are explicit credit grants with identity and lifecycle.

Recommended fields:
- `id`
- `owner_uid`
- `credits`
- `consumed`
- `status`
- `expires_at`
- `reason`
- `note`
- `created_by_uid`
- `created_by_role`
- `created_at`
- `updated_at`
- `revoked_at`
- `revoked_by_uid`
- `revoke_reason`

Meaning:
- these are explicit discrete grants
- each grant has identity, status, possible expiry, and auditability
- useful for promotional, compensation, urgent, or special-case credits

## 5.4 Reservation-aware extra credits
For user-visible truth, the platform should also expose a computed lane like:

- `extraCreditsAvailable`

This is not necessarily raw storage.
It is a **server-computed value** that can represent usable non-daily credits after reservation-aware logic.

---

# 6. Recommended Canonical Summary Shape

The platform already benefits from a summary-oriented model.
A professional server summary should expose at least:

```ts
interface AssessmentCreditSummary {
  ownerUid: string;
  assessmentAccess: "enabled" | "disabled";
  isAdminExempt: boolean;

  remainingCount: number;
  dailyRemainingCount: number;

  manualCreditsAvailable: number;
  grantCreditsAvailable: number;
  extraCreditsAvailable: number;

  dailyLimit: number;
  dailyLimitOverride: number | null;

  pendingReservationCount: number;
  successfulGenerationCount: number;

  activeGrantCount: number;
  expiredGrantCount?: number;

  lastMutationAt?: string | null;
  computedAt: string;
}
```

## Important meaning rules

- `remainingCount` = the **authoritative total usable remaining** shown in the header
- `dailyRemainingCount` = remaining recurring daily quota
- `manualCreditsAvailable` = currently available manual/admin credit bucket
- `grantCreditsAvailable` = currently available active grant bucket
- `extraCreditsAvailable` = reservation-aware usable non-daily pool

The header should stay compact and show **`remainingCount`**.
The details page should show the breakdown.

---

# 7. Canonical Tables Recommended for the Hybrid Model

## 7.1 `assessment_credit_accounts`
This should be the durable account row per user.

Recommended columns:
- `owner_uid`
- `assessment_access`
- `daily_limit_override`
- `manual_credits`
- `created_at`
- `updated_at`

Optional improvements:
- `updated_by_uid`
- `assessment_prompt_entitlement`
- `version`
- `last_mutation_id`

## 7.2 `assessment_daily_credits`
Daily usage / reservation table.

Recommended columns:
- `id`
- `owner_uid`
- `day_key`
- `daily_limit`
- `successful_generation_ids`
- `pending_reservations`
- `created_at`
- `updated_at`

## 7.3 `assessment_credit_grants`
Discrete grant lifecycle table.

Recommended columns:
- `id`
- `owner_uid`
- `credits`
- `consumed`
- `status`
- `expires_at`
- `reason`
- `note`
- `created_by_uid`
- `created_by_role`
- `created_at`
- `updated_at`
- `revoked_at`
- `revoked_by_uid`
- `revoke_reason`

## 7.4 Recommended new table: `assessment_credit_mutations`
This is strongly recommended for professional observability.

Purpose:
- durable mutation history
- before/after state tracking
- clear distinction between admin intent and final committed effect

Recommended columns:
- `id`
- `owner_uid`
- `actor_uid`
- `actor_email`
- `actor_role`
- `mutation_type`
- `amount`
- `reason`
- `note`
- `grant_id`
- `expires_at`
- `message_to_user`
- `before_manual_credits`
- `after_manual_credits`
- `before_remaining_count`
- `after_remaining_count`
- `before_daily_remaining_count`
- `after_daily_remaining_count`
- `before_grant_credits_available`
- `after_grant_credits_available`
- `created_at`
- `correlation_id`
- `route_source`
- `commit_status`

This table should become the primary historical detail source for the future user/admin credit details views.

## 7.5 `admin_activity_logs`
This remains useful, but should be treated more as governance/audit log than as the only mutation history source.

---

# 8. Recommended Role of `zc_entities`

## 8.1 Good use of `zc_entities`
`zc_entities` is acceptable as:
- a legacy compatibility store
- a generic JSON entity mirror
- a migration bridge
- a debugging surface
- a Firestore-parity carryover layer

## 8.2 Bad use of `zc_entities`
It becomes dangerous when:
- writes go to canonical tables but reads come from `zc_entities`
- some code writes only logs and not the entity body
- one path updates tables while another path reads old mirrored JSON
- normalization quietly resets fields like `manualCredits` to zero

## 8.3 Professional hybrid rule
If the platform keeps `zc_entities`, then apply this rule:

### Preferred direction
```text
canonical relational tables -> recompute summary -> optional mirror to zc_entities
```

### Avoid
```text
sometimes zc_entities is canonical, sometimes relational tables are canonical
```

That ambiguity is the exact kind of drift that causes “logs say success, account still zero”.

---

# 9. Admin-Controlled Operations That Must Be Distinguished

Each operation must have its own explicit mutation type.

Recommended mutation types:
- `set_manual_credits`
- `add_manual_credits`
- `subtract_manual_credits`
- `create_credit_grant`
- `revoke_credit_grant`
- `set_daily_limit_override`
- `clear_daily_limit_override`
- `set_assessment_access`
- `set_prompt_entitlement`

Each operation should record:
- who did it
- to whom
- when
- why
- amount/value
- optional message shown to the user
- whether it expires
- whether it created or modified a grant

---

# 10. Required Mutation Write Rules

A professional mutation path must follow these rules.

## 10.1 One transaction boundary
For credit-changing operations, the repository should preferably do all critical persistence in one transaction:

- load account
- compute next state
- write canonical account/grant/daily changes
- write mutation history row
- write admin activity log if part of the same durable boundary
- recompute summary or prepare for recompute

## 10.2 No “log-only success”
The system must never behave like this:

```text
mutation log appended
but actual account row unchanged
yet UI/admin thinks mutation succeeded
```

If the actual account write fails, the mutation must not be presented as successful.

## 10.3 Audit failure must not falsify persistence truth
If a non-critical log step fails **after** the real account write succeeds, the system should return a truthful state such as:
- committed with warning
- committed but audit-log append failed

It must not convert a real committed mutation into a false total failure.

---

# 11. Effective Summary Computation Rules

The effective summary logic must be server-owned and deterministic.

## 11.1 Inputs
It should compute from:
- `assessment_credit_accounts`
- `assessment_daily_credits`
- `assessment_credit_grants`
- reservation state
- assessment access status
- admin exemption status if applicable

## 11.2 Outputs
It should return the canonical summary used by:
- `/api/assessment/credits`
- header badge
- assessment page credit panel
- user credit details page
- admin detail credit overview cards

## 11.3 Required truthfulness
If `manual_credits` changes in canonical storage, the summary must reflect it.
If the summary ignores stored manual credits, that is a read-truth bug.

---

# 12. User-Facing Surfaces That Must Stay Aligned

## 12.1 Header balance
The header should show:
- compact total usable remaining balance
- derived from `remainingCount`

It should **not** show only daily credits unless the total really equals daily only.

## 12.2 Assessment credit panel
This panel should read the same shared query source and explain the source mix, for example:
- daily credits available
- admin-added credits available
- active grants available
- access disabled
- exhausted

## 12.3 New user credit details page
A professional protected page is strongly recommended, for example:

```text
/credits
or
/settings/credits
or
/account/credits
```

This page should show the user their own credit details only.

---

# 13. Recommended User Credit Details Page Structure

## 13.1 Top summary cards
Show:
- **Total usable remaining**
- **Daily remaining**
- **Manual/admin credits available**
- **Grant credits available**
- **Assessment access status**

## 13.2 Breakdown table
Suggested columns:

| Field | Purpose |
|---|---|
| Credit Source | Daily / Manual / Grant |
| Current Available | Usable amount now |
| Original Amount | For grants/manual operations when relevant |
| Consumed | Consumed amount if relevant |
| Status | active / exhausted / revoked / expired / disabled |
| Created At | Creation timestamp |
| Expires At | Optional expiry timestamp |
| Created By | Admin UID/email or system |
| Reason | Why it was created/changed |
| Note / Message | Optional admin note or user-facing message |

## 13.3 History table
Suggested columns:

| Column | Description |
|---|---|
| Time | Mutation time |
| Operation | add_manual_credits, create_credit_grant, etc. |
| Amount | Numeric amount or setting value |
| Source Type | manual / grant / daily override / access |
| Actor | Admin/system identity |
| Reason | Stored reason |
| Message | Optional user-facing explanation |
| Before | Before-state snapshot |
| After | After-state snapshot |
| Expiry | If applicable |
| Correlation ID | Debugging / diagnostics |

## 13.4 UX guidance
The page should be:
- professional
- clean
- not noisy
- explicit about source separation
- owner-scoped only

---

# 14. Required Admin Detail Page Credit View

The admin page on `/admin/users/[uid]` should clearly separate:

1. **Current credit truth**
2. **Mutation controls**
3. **Grant list**
4. **Mutation history**
5. **Diagnostics / metadata**

Recommended current-truth cards:
- Remaining total
- Daily remaining
- Manual/admin credits
- Active grant credits
- Daily limit
- Access status
- Prompt entitlement status

---

# 15. Dates and Lifecycle Rules

A professional credit system must track time explicitly.

## Required date fields across operations
- `created_at`
- `updated_at`
- `expires_at` when applicable
- `revoked_at` when applicable
- `computed_at` on summaries

## Important lifecycle states
For grants especially, support:
- `active`
- `consumed`
- `expired`
- `revoked`
- `scheduled` if ever needed later

---

# 16. Admin Attribution Rules

Every admin-driven mutation should be able to answer:

- Which admin did this?
- Which user received it?
- What type of credit was changed?
- What was the amount?
- Why was it changed?
- When was it changed?
- Does it expire?
- Was a user-facing message included?

Minimum recommended actor fields:
- `actor_uid`
- `actor_email`
- `actor_role`

Minimum target fields:
- `owner_uid`
- `target_uid` if needed explicitly

---

# 17. Professional Pages and Tools Map

## 17.1 Existing/admin pages
- `/admin/users/[uid]` — admin credit control and visibility
- `/admin` — overview

## 17.2 Existing user pages
- `/assessment` — assessment studio
- protected header — compact total balance

## 17.3 Recommended new user page
- `/credits` — user credit details page

## 17.4 Existing backend routes
- `/api/admin/users/[uid]/credits` — admin credit mutation/read lane
- `/api/assessment/credits` — canonical user-visible summary lane

## 17.5 Recommended additional route if needed
If richer user credit detail is needed beyond the compact summary, add something like:

```text
GET /api/credits/details
```

with server-enforced owner scoping.

---

# 18. Diagnostics Requirements

This domain needs strong diagnostics.

At minimum, correlate:
- `actorUid`
- `actorEmail`
- `targetUid`
- `mutationType`
- `requestedAmount`
- `beforeManualCredits`
- `afterManualCredits`
- `beforeRemainingCount`
- `afterRemainingCount`
- `canonicalTableWritten`
- `entityMirrorWritten`
- `mutationHistoryWritten`
- `adminLogWritten`
- `summaryRecomputed`
- `apiAssessmentCreditsReturned`
- `correlationId`

This makes future failures undeniable.

---

# 19. Centralized Error System Recommendation

The touched flow should use one central platform error authority, for example:

```text
apps/web/lib/server/assessment-platform-errors.ts
```

It should normalize:
- permission errors
- invalid mutation action
- user not found
- account not found
- persistence write failure
- mirror write failure
- summary recompute failure
- audit append failure
- partial-commit-with-warning states

Recommended shape:
- stable error code
- category
- safe user message
- internal detail metadata

---

# 20. Recommended Hybrid Migration Strategy

## Phase 1 — Investigate truth path
Confirm:
- where `set_manual_credits` writes
- where `add_manual_credits` writes
- whether canonical read path uses the same store
- whether `zc_entities` is stale mirror only or still read as truth

## Phase 2 — Make canonical tables authoritative
Ensure:
- all writes go to canonical tables
- summary recompute reads canonical tables
- `/api/assessment/credits` reads canonical summary only

## Phase 3 — Add mutation history table
Add `assessment_credit_mutations` so history is durable and explainable.

## Phase 4 — Keep or remove mirror safely
Either:
- keep `zc_entities` as derived mirror only
- or remove it from the credit truth path completely

## Phase 5 — Build user credit details page
Expose owner-scoped breakdown cleanly to the user.

---

# 21. The Most Important Anti-Patterns to Avoid

Do not:
- create a second balance calculator in the browser
- patch the UI to fake success
- mix canonical reads between tables and `zc_entities`
- allow logs to imply success when account truth did not change
- let admin route and page-level server action use inconsistent mutation behavior
- expose another user’s detail page or credit data
- carry balance truth in realtime payloads

Realtime should remain **signal/invalidation only**.
Canonical truth should remain **server-owned**.

---

# 22. Recommended End State

The professional end state for Zootopia Club credit architecture should be:

```text
Admin mutation
-> canonical account/grant/daily tables updated transactionally
-> mutation history row written
-> admin activity log written
-> canonical credit summary recomputed
-> optional zc_entities mirror updated
-> owner-scoped realtime invalidation published
-> /api/assessment/credits returns truthful summary
-> TanStack Query refetches canonical truth
-> header / assessment / credits page all show the same balance truth
```

This keeps:
- admin authority on the backend
- user-visible balance truthful
- audit history readable
- grant expiry lifecycle explicit
- source separation professional
- diagnostics strong

---

# 23. Recommended Ready-to-Use Agent Brief

Use the following mental model when instructing an AI agent:

1. **Investigate persistence truth first**
2. **Do not assume UI-only failure**
3. **Make canonical relational credit tables authoritative**
4. **Treat `zc_entities` as mirror/legacy unless proven otherwise**
5. **Preserve `/api/assessment/credits` as canonical user-visible summary**
6. **Keep TanStack Query as shared cache only**
7. **Keep realtime invalidation-only**
8. **Add professional user credit details page**
9. **Track every credit source separately**
10. **Track every admin mutation with actor, target, reason, note, timestamps, and expiry when applicable**

---

# 24. Final Recommendation

For this project, the strongest professional approach is:

- **canonical structured credit tables** for real truth
- **server-owned summary computation**
- **optional `zc_entities` compatibility mirror only**
- **explicit admin mutation history**
- **truthful header total**
- **source-aware assessment panel**
- **owner-scoped credit details page**
- **strong diagnostics and centralized errors**

That gives Zootopia Club a credit system that is:
- easier to debug
- safer to extend
- clearer for admins
- clearer for users
- more resistant to persistence drift
- ready for professional governance and future growth

