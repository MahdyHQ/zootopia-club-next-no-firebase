-- Phase 2: Internal table hardening + zc_entities RLS policies
-- -----------------------------------------------------------------------------
-- This migration closes security gaps identified during the admin-boundary audit:
--
-- 1. _migration_history: Internal operational table. Must NOT be readable by
--    any authenticated user. Only service_role (backend server) may access it.
--
-- 2. zc_entities: Generic JSONB document store. RLS was enabled but no policies
--    were defined. This migration adds owner-scoped policies so authenticated
--    users can only read/write their own records.
--
-- 3. admin_activity_logs: Existing policy allows users to read entries where
--    they are owner_uid, actor_uid, or target_uid. This is intentional — users
--    should see their own audit trail. Admin-only full visibility is enforced
--    at the API layer, not the RLS layer.
--
-- Security model:
-- - service_role bypasses RLS (Next.js server uses service key)
-- - authenticated users get owner-scoped access only
-- - anon role gets no access to any table
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. _migration_history: Close all authenticated access. Service-role only.
-- =============================================================================
-- This table is created by the apply-migrations.mjs script, not by this migration.
-- We add RLS and explicitly deny all non-service access.

do $$
begin
  -- Enable RLS on _migration_history if it exists and RLS is not yet enabled.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_migration_history'
  ) then
    alter table public._migration_history enable row level security;

    -- Revoke all direct access from browser-facing roles.
    revoke all on public._migration_history from public;
    revoke all on public._migration_history from authenticated;
    revoke all on public._migration_history from anon;

    -- Direct browser-role access stays denied at the database layer.
    -- Any admin observability is provided through backend service-role paths.
  end if;
end
$$;

-- =============================================================================
-- 2. zc_entities: Add owner-scoped RLS policies
-- =============================================================================
-- zc_entities is a generic JSONB document store used by the Postgres adapter
-- for collections: documents, assessments, infographics, credits, idempotency,
-- admin logs, and users. Each row has an owner_uid column.
--
-- Policy: authenticated users can only access rows where owner_uid = auth.uid()

do $$
begin
  -- SELECT: users can only read their own records
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zc_entities' and policyname = 'zc_entities_owner_select'
  ) then
    create policy zc_entities_owner_select on public.zc_entities
      for select to authenticated
      using (owner_uid = auth.uid()::text);
  end if;

  -- INSERT: users can only insert records they own
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zc_entities' and policyname = 'zc_entities_owner_insert'
  ) then
    create policy zc_entities_owner_insert on public.zc_entities
      for insert to authenticated
      with check (owner_uid = auth.uid()::text);
  end if;

  -- UPDATE: users can only update their own records
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zc_entities' and policyname = 'zc_entities_owner_update'
  ) then
    create policy zc_entities_owner_update on public.zc_entities
      for update to authenticated
      using (owner_uid = auth.uid()::text)
      with check (owner_uid = auth.uid()::text);
  end if;

  -- DELETE: users can only delete their own records
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zc_entities' and policyname = 'zc_entities_owner_delete'
  ) then
    create policy zc_entities_owner_delete on public.zc_entities
      for delete to authenticated
      using (owner_uid = auth.uid()::text);
  end if;
end
$$;

comment on table public.zc_entities is
  'Generic JSON document store for collection-shaped records; owner_uid duplicates body.ownerUid for indexed queries. RLS: owner-scoped only.';