# Firestore/Storage ETL to `zc_entities` + `zootopia-private`

## Scope and Canonical Target

This ETL plan migrates legacy Firebase data into the Supabase runtime currently used by the app:

- Postgres target table: `public.zc_entities`
- Storage target bucket: `zootopia-private`

Canonical target definitions are in:

- `supabase/migrations/20260410120000_zootopia_platform_entities.sql`
- `apps/web/lib/server/zootopia-postgres-adapter.ts` (Supabase Postgres adapter, formerly named with misleading Firebase reference)
- `apps/web/lib/server/supabase-blob-storage.ts`

Important:

- Do not target `zootopia-app` for this migration run.
- `zootopia-app` appears in `supabase/migrations/20260410180001_phase1_storage_bucket.sql` as a legacy phase artifact. The live server storage adapter reads and writes only `zootopia-private`.

## Source to Target Mapping

### Firestore collections -> `public.zc_entities`

Every Firestore document is represented as one row:

- `zc_entities.collection`: Firestore collection name
- `zc_entities.id`: Firestore document id
- `zc_entities.body`: full document JSON payload
- `zc_entities.owner_uid`: derived owner uid for indexed owner queries
- `zc_entities.updated_at`: ETL write timestamp (`now()`)

Collections used by the current repository runtime:

- `users`
- `documents`
- `assessmentGenerations`
- `infographicGenerations`
- `adminActivityLogs`
- `assessmentGenerationIdempotency`
- `assessmentDailyCredits`
- `assessmentCreditAccounts`
- `assessmentCreditGrants`

`owner_uid` derivation must match runtime behavior in `zootopia-postgres-adapter.ts`:

- If `body.ownerUid` exists and is non-empty, use that.
- Else if collection is `users` and `body.uid` exists, use `body.uid`.
- Else store `NULL`.

### Firebase Storage object paths -> `zootopia-private`

Keep object keys unchanged when copying into `zootopia-private`:

- `documents/{ownerUid}/{documentId}/{fileName}`
- `assessment-results/{ownerUid}/{generationId}/result.json`
- `assessment-exports/{ownerUid}/{generationId}/{artifactKey}/{variant}.{ext}`

These paths are the same namespaces enforced by current server path helpers in `apps/web/lib/server/owner-scope.ts`.

## ETL Procedure

## 1) Prepare exports and safety controls

1. Export Firestore collections with document ids and payload JSON.
2. Export or list Firebase Storage objects for the three namespaces above.
3. Freeze writes during cutover window or record a high-water mark timestamp for a second incremental pass.
4. Confirm Supabase service-role credentials are available only in server-side migration environment.

## 2) Stage Firestore data in Postgres

Create staging tables once:

```sql
create table if not exists public.etl_firestore_stage (
  collection text not null,
  id text not null,
  body jsonb not null,
  source_updated_at timestamptz null,
  primary key (collection, id)
);

create table if not exists public.etl_run_checkpoint (
  run_id text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  firestore_rows bigint not null default 0,
  storage_objects bigint not null default 0,
  notes text null
);
```

Load your transformed export rows into `public.etl_firestore_stage`.

## 3) Upsert into `public.zc_entities`

Use an idempotent upsert:

```sql
insert into public.zc_entities (collection, id, owner_uid, body, updated_at)
select
  s.collection,
  s.id,
  coalesce(
    nullif(s.body ->> 'ownerUid', ''),
    case
      when s.collection = 'users' then nullif(s.body ->> 'uid', '')
      else null
    end
  ) as owner_uid,
  s.body,
  now()
from public.etl_firestore_stage s
on conflict (collection, id)
do update set
  owner_uid = excluded.owner_uid,
  body = excluded.body,
  updated_at = now();
```

## 4) Copy Storage objects to `zootopia-private`

For each exported Firebase object under the three namespaces:

1. Download object bytes from Firebase Storage source bucket.
2. Upload bytes to Supabase Storage bucket `zootopia-private` using the exact same object key.
3. Preserve content type metadata where available.
4. Record success/failure per object in a migration log.

Idempotency rule:

- Re-uploading the same key must be allowed (upsert behavior).
- If the destination already has a byte-identical object, mark as skipped.

## 5) Verification queries and checks

Postgres record counts by collection:

```sql
select collection, count(*)
from public.zc_entities
group by collection
order by collection;
```

Find rows missing indexed owner when owner is expected:

```sql
select collection, id
from public.zc_entities
where collection in (
  'documents',
  'assessmentGenerations',
  'infographicGenerations',
  'assessmentGenerationIdempotency',
  'assessmentDailyCredits',
  'assessmentCreditAccounts',
  'assessmentCreditGrants'
)
and owner_uid is null
limit 200;
```

Storage namespace sanity in Supabase:

```sql
select split_part(name, '/', 1) as namespace, count(*)
from storage.objects
where bucket_id = 'zootopia-private'
group by split_part(name, '/', 1)
order by namespace;
```

Application-level smoke checks after ETL:

- `GET /api/health` returns `runtimeFlags.supabaseAuth = true` in configured runtime.
- Authenticated upload list, assessment history, and infographic history render without missing-record errors.
- Download/export endpoints can read migrated object paths from `zootopia-private`.

## Cutover and Rollback Notes

- Cutover is complete only after both Firestore row parity and Storage object parity pass checks.
- Keep Firebase source data read-only for a short validation window.
- Rollback path:
  - Keep pre-cutover Supabase snapshot (or point-in-time backup).
  - If severe mismatch is detected, restore snapshot and rerun ETL with corrected transform.

## Operational Decision About `scripts/firebase`

For this migration task, `scripts/firebase` remains in place intentionally:

- It still contains legacy Firebase App Hosting secret-management helpers used for rollback/maintenance.
- It is referenced by operational docs/config comments.
- Removing it during ETL work adds avoidable operational risk unrelated to the data migration itself.

Deprecation note (2026-04-10): `scripts/firebase` is now considered transitional and should not gain new responsibilities.

Removal criteria for a dedicated cleanup pass:

- A replacement App Hosting secret-management workflow is documented in the operational runbooks.
- Legacy App Hosting references in operational docs (including `Guide-Files/powershell-script-commands-guide.md`) are updated to the replacement workflow.
- One successful non-interactive secret rotation run is verified with the replacement workflow.
