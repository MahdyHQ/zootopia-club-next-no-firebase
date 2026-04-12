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
