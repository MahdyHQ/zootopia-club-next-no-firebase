-- Enforce owner-scoped isolation for Postgres rows and Storage object paths.
-- This migration keeps server-side service-role operations working while adding
-- authenticated-role protections for any current/future direct Supabase access.

-- Keep the active server bucket id aligned with runtime code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zootopia-private', 'zootopia-private', false, null, null)
on conflict (id) do nothing;

do $$
declare
  owner_tables text[] := array[
    'documents',
    'assessment_generations',
    'infographic_generations',
    'assessment_generation_idempotency',
    'assessment_daily_credits',
    'assessment_credit_grants'
  ];
  table_name text;
begin
  -- User profile rows are self-owned by uid.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_self_select'
  ) then
    create policy user_profiles_self_select on public.user_profiles
      for select to authenticated
      using (uid = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_self_insert'
  ) then
    create policy user_profiles_self_insert on public.user_profiles
      for insert to authenticated
      with check (uid = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_self_update'
  ) then
    create policy user_profiles_self_update on public.user_profiles
      for update to authenticated
      using (uid = auth.uid()::text)
      with check (uid = auth.uid()::text);
  end if;

  -- Generic owner_uid protections for user-owned entities.
  foreach table_name in array owner_tables loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (owner_uid = auth.uid()::text)',
        table_name || '_owner_select',
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_insert'
    ) then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (owner_uid = auth.uid()::text)',
        table_name || '_owner_insert',
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_update'
    ) then
      execute format(
        'create policy %I on public.%I for update to authenticated using (owner_uid = auth.uid()::text) with check (owner_uid = auth.uid()::text)',
        table_name || '_owner_update',
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_delete'
    ) then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (owner_uid = auth.uid()::text)',
        table_name || '_owner_delete',
        table_name
      );
    end if;
  end loop;

  -- owner_uid is primary key in this table; still enforce self scope.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_credit_accounts' and policyname = 'assessment_credit_accounts_owner_select'
  ) then
    create policy assessment_credit_accounts_owner_select on public.assessment_credit_accounts
      for select to authenticated
      using (owner_uid = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_credit_accounts' and policyname = 'assessment_credit_accounts_owner_insert'
  ) then
    create policy assessment_credit_accounts_owner_insert on public.assessment_credit_accounts
      for insert to authenticated
      with check (owner_uid = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_credit_accounts' and policyname = 'assessment_credit_accounts_owner_update'
  ) then
    create policy assessment_credit_accounts_owner_update on public.assessment_credit_accounts
      for update to authenticated
      using (owner_uid = auth.uid()::text)
      with check (owner_uid = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_credit_accounts' and policyname = 'assessment_credit_accounts_owner_delete'
  ) then
    create policy assessment_credit_accounts_owner_delete on public.assessment_credit_accounts
      for delete to authenticated
      using (owner_uid = auth.uid()::text);
  end if;

  -- Admin logs: allow users to read only entries tied to themselves.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_activity_logs' and policyname = 'admin_activity_logs_owner_select'
  ) then
    create policy admin_activity_logs_owner_select on public.admin_activity_logs
      for select to authenticated
      using (
        owner_uid = auth.uid()::text
        or actor_uid = auth.uid()::text
        or target_uid = auth.uid()::text
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'zootopia_private_owner_select'
  ) then
    create policy zootopia_private_owner_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'zootopia-private'
        and (
          (split_part(name, '/', 1) in ('documents', 'assessment-results', 'assessment-exports')
            and split_part(name, '/', 2) = auth.uid()::text)
          or (split_part(name, '/', 1) = 'uploads'
            and split_part(name, '/', 2) = 'temp'
            and split_part(name, '/', 3) = auth.uid()::text)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'zootopia_private_owner_insert'
  ) then
    create policy zootopia_private_owner_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'zootopia-private'
        and (
          (split_part(name, '/', 1) in ('documents', 'assessment-results', 'assessment-exports')
            and split_part(name, '/', 2) = auth.uid()::text)
          or (split_part(name, '/', 1) = 'uploads'
            and split_part(name, '/', 2) = 'temp'
            and split_part(name, '/', 3) = auth.uid()::text)
        )
      );
  end if;

  -- Upsert requires UPDATE policy in addition to INSERT+SELECT.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'zootopia_private_owner_update'
  ) then
    create policy zootopia_private_owner_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'zootopia-private'
        and (
          (split_part(name, '/', 1) in ('documents', 'assessment-results', 'assessment-exports')
            and split_part(name, '/', 2) = auth.uid()::text)
          or (split_part(name, '/', 1) = 'uploads'
            and split_part(name, '/', 2) = 'temp'
            and split_part(name, '/', 3) = auth.uid()::text)
        )
      )
      with check (
        bucket_id = 'zootopia-private'
        and (
          (split_part(name, '/', 1) in ('documents', 'assessment-results', 'assessment-exports')
            and split_part(name, '/', 2) = auth.uid()::text)
          or (split_part(name, '/', 1) = 'uploads'
            and split_part(name, '/', 2) = 'temp'
            and split_part(name, '/', 3) = auth.uid()::text)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'zootopia_private_owner_delete'
  ) then
    create policy zootopia_private_owner_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'zootopia-private'
        and (
          (split_part(name, '/', 1) in ('documents', 'assessment-results', 'assessment-exports')
            and split_part(name, '/', 2) = auth.uid()::text)
          or (split_part(name, '/', 1) = 'uploads'
            and split_part(name, '/', 2) = 'temp'
            and split_part(name, '/', 3) = auth.uid()::text)
        )
      );
  end if;
end
$$;
