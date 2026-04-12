-- Lock down internal operational tables so browser-facing roles cannot read, write,
-- or infer backend metadata through direct SQL/PostgREST access.
--
-- These tables are server-authoritative and are intended for privileged backend paths
-- (service role / migration runner) only.

do $$
declare
  guarded_tables text[] := array[
    '_migration_history',
    'email_verification_resend_governance'
  ];
  table_name text;
  existing_policy record;
begin
  foreach table_name in array guarded_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public', table_name);

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', table_name);
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', table_name);
    end if;

    -- Remove any existing browser-facing policies, then replace with explicit deny-all.
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, table_name);
    end loop;

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format(
        'create policy %I on public.%I for all to anon using (false) with check (false)',
        table_name || '_anon_deny_all',
        table_name
      );
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format(
        'create policy %I on public.%I for all to authenticated using (false) with check (false)',
        table_name || '_authenticated_deny_all',
        table_name
      );
    end if;
  end loop;
end
$$;
