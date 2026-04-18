-- Persisted sign-in/sign-up admission governance for the public auth edge.
-- This table is server-authoritative and intentionally hidden from browser clients.

create table if not exists public.auth_admission_governance (
  gate_name text not null check (gate_name in ('sign_in_account', 'sign_in_ip', 'sign_up_account', 'sign_up_ip')),
  key_scope text not null check (key_scope in ('account', 'ip')),
  key_hash text not null,
  window_starts_at timestamptz not null,
  window_expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_admitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_admission_governance_pk primary key (gate_name, key_scope, key_hash),
  constraint auth_admission_governance_window_check
    check (window_expires_at > window_starts_at)
);

comment on table public.auth_admission_governance is
  'Server-enforced cross-instance admission windows for public sign-in and sign-up traffic.';

create index if not exists auth_admission_governance_window_expires_idx
  on public.auth_admission_governance (window_expires_at);

create index if not exists auth_admission_governance_last_admitted_idx
  on public.auth_admission_governance (last_admitted_at);

alter table public.auth_admission_governance enable row level security;

revoke all on table public.auth_admission_governance from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.auth_admission_governance from anon;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'auth_admission_governance'
        and policyname = 'auth_admission_governance_anon_deny_all'
    ) then
      create policy auth_admission_governance_anon_deny_all
        on public.auth_admission_governance
        for all to anon
        using (false)
        with check (false);
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.auth_admission_governance from authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'auth_admission_governance'
        and policyname = 'auth_admission_governance_authenticated_deny_all'
    ) then
      create policy auth_admission_governance_authenticated_deny_all
        on public.auth_admission_governance
        for all to authenticated
        using (false)
        with check (false);
    end if;
  end if;
end
$$;
