-- Persisted active normal-user session occupancy leases.
-- This table is server-authoritative and intentionally hidden from browser clients.

create table if not exists public.active_normal_user_sessions (
  uid text primary key,
  email text not null,
  lease_started_at timestamptz not null,
  last_seen_at timestamptz not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_normal_user_sessions_email_check
    check (length(btrim(email)) > 0),
  constraint active_normal_user_sessions_lease_window_check
    check (lease_expires_at > lease_started_at)
);

comment on table public.active_normal_user_sessions is
  'Server-enforced active normal-user occupancy leases used for capacity admission control.';

create index if not exists active_normal_user_sessions_lease_expires_idx
  on public.active_normal_user_sessions (lease_expires_at);

create index if not exists active_normal_user_sessions_email_idx
  on public.active_normal_user_sessions (email);

alter table public.active_normal_user_sessions enable row level security;

revoke all on table public.active_normal_user_sessions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.active_normal_user_sessions from anon;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'active_normal_user_sessions'
        and policyname = 'active_normal_user_sessions_anon_deny_all'
    ) then
      create policy active_normal_user_sessions_anon_deny_all
        on public.active_normal_user_sessions
        for all to anon
        using (false)
        with check (false);
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.active_normal_user_sessions from authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'active_normal_user_sessions'
        and policyname = 'active_normal_user_sessions_authenticated_deny_all'
    ) then
      create policy active_normal_user_sessions_authenticated_deny_all
        on public.active_normal_user_sessions
        for all to authenticated
        using (false)
        with check (false);
    end if;
  end if;
end
$$;
