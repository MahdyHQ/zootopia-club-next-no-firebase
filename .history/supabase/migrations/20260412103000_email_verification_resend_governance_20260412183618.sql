-- Persisted governance state for confirm-email resend controls.
-- This table is server-authoritative and intentionally not exposed to browser clients.

create table if not exists public.email_verification_resend_governance (
  key_scope text not null check (key_scope in ('account', 'ip')),
  key_hash text not null,
  window_starts_at timestamptz not null,
  window_expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  cooldown_until timestamptz,
  last_provider_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_verification_resend_governance_pk primary key (key_scope, key_hash),
  constraint email_verification_resend_governance_window_check
    check (window_expires_at > window_starts_at)
);

comment on table public.email_verification_resend_governance is
  'Server-enforced resend governance windows for /confirm-email account and IP throttling.';

create index if not exists email_verification_resend_governance_window_expires_idx
  on public.email_verification_resend_governance (window_expires_at);

create index if not exists email_verification_resend_governance_cooldown_until_idx
  on public.email_verification_resend_governance (cooldown_until);

alter table public.email_verification_resend_governance enable row level security;

-- Keep this internal governance table backend-only from the moment it is created.
-- A later hardening migration also enforces this, but these guards make fresh
-- environments safe even if migrations are applied incrementally.
revoke all on table public.email_verification_resend_governance from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.email_verification_resend_governance from anon;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'email_verification_resend_governance'
        and policyname = 'email_verification_resend_governance_anon_deny_all'
    ) then
      create policy email_verification_resend_governance_anon_deny_all
        on public.email_verification_resend_governance
        for all to anon
        using (false)
        with check (false);
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.email_verification_resend_governance from authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'email_verification_resend_governance'
        and policyname = 'email_verification_resend_governance_authenticated_deny_all'
    ) then
      create policy email_verification_resend_governance_authenticated_deny_all
        on public.email_verification_resend_governance
        for all to authenticated
        using (false)
        with check (false);
    end if;
  end if;
end
$$;
