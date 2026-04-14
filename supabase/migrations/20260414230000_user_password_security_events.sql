-- Persist server-authoritative password security events for normal-user flows.
-- This migration records security metadata only (no raw password or hash material).

create table if not exists public.user_password_security_events (
  id text primary key,
  uid text not null,
  event_type text not null check (event_type in ('recovery_reset', 'in_account_change')),
  event_source text not null check (event_source in ('recovery', 'settings')),
  session_hardening_attempted boolean not null default false,
  session_hardening_succeeded boolean not null default false,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

comment on table public.user_password_security_events is
  'Backend-only password security audit events for normal user password reset/change actions.';

create index if not exists user_password_security_events_uid_created_at_idx
  on public.user_password_security_events (uid, created_at desc);

create table if not exists public.user_password_security_state (
  uid text primary key,
  last_event_id text not null,
  last_event_type text not null check (last_event_type in ('recovery_reset', 'in_account_change')),
  last_event_source text not null check (last_event_source in ('recovery', 'settings')),
  last_password_changed_at timestamptz not null,
  session_hardening_succeeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_password_security_state is
  'Backend-only latest password security state snapshot per user (no secret material).';

create index if not exists user_password_security_state_last_password_changed_at_idx
  on public.user_password_security_state (last_password_changed_at desc);

-- Lock both tables down for backend-only service-role access.
do $$
declare
  guarded_tables text[] := array[
    'user_password_security_events',
    'user_password_security_state'
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
