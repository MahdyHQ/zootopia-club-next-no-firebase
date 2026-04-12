-- Phase 1 Postgres domain schema bootstrap.
-- -----------------------------------------------------------------------------
-- Source of truth for shapes: apps/web/lib/server/repository.ts + packages/shared-types.
-- This migration establishes canonical relational tables for application entities.
--
-- Security model (Phase 1):
-- - RLS is ENABLED on every table. No policies are defined for `anon` / `authenticated`,
--   so direct PostgREST access from browsers is denied.
-- - The Next.js app remains backend-authoritative while repository rewiring proceeds;
--   this file defines the audited schema contract for Supabase Postgres.
-- - Supabase `service_role` bypasses RLS (server-only key -- never expose to the client).
--
-- Future phases: add RLS policies aligned with auth.uid(), storage alignment, and
-- repository.ts rewiring. Do not grant broad table privileges to `authenticated` until
-- policies exist (Supabase security guidance).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- user_profiles -- app profile row keyed by auth provider uid string
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_profiles (
  uid text PRIMARY KEY,
  email text,
  display_name text,
  photo_url text,
  full_name text,
  university_code text,
  phone_number text,
  phone_country_iso2 text,
  phone_country_calling_code text,
  nationality text,
  profile_completed boolean NOT NULL DEFAULT false,
  profile_completed_at timestamptz,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  preferences jsonb NOT NULL DEFAULT '{"theme": "system", "language": "en"}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE public.user_profiles IS 'Application user profile + role/status row (server-authoritative).';

CREATE INDEX user_profiles_email_lower_idx ON public.user_profiles (lower(email));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
CREATE TABLE public.documents (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  owner_role text,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_path text,
  status text NOT NULL,
  markdown text,
  extraction_engine text NOT NULL DEFAULT 'direct-file',
  is_active boolean DEFAULT true,
  superseded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE public.documents IS 'Upload metadata + retention controls (binary payload in object storage).';

CREATE INDEX documents_owner_uid_created_at_idx ON public.documents (owner_uid, created_at DESC);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- assessment_generations
-- Full generation payload kept as JSONB to match nested AssessmentGeneration types.
-- -----------------------------------------------------------------------------
CREATE TABLE public.assessment_generations (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.assessment_generations IS 'Assessment generation payload snapshot stored as JSONB.';

CREATE INDEX assessment_generations_owner_uid_created_idx
  ON public.assessment_generations (owner_uid, created_at DESC);

ALTER TABLE public.assessment_generations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- infographic_generations
-- -----------------------------------------------------------------------------
CREATE TABLE public.infographic_generations (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE public.infographic_generations IS 'Infographic generation payload snapshot, including inline SVG content.';

CREATE INDEX infographic_generations_owner_uid_created_idx
  ON public.infographic_generations (owner_uid, created_at DESC);

ALTER TABLE public.infographic_generations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- admin_activity_logs
-- -----------------------------------------------------------------------------
CREATE TABLE public.admin_activity_logs (
  id text PRIMARY KEY,
  actor_uid text NOT NULL,
  actor_role text,
  action text NOT NULL,
  target_uid text,
  owner_uid text,
  owner_role text,
  resource_type text,
  resource_id text,
  route text,
  metadata jsonb,
  created_at timestamptz NOT NULL
);

COMMENT ON TABLE public.admin_activity_logs IS 'Append-only admin audit trail.';

CREATE INDEX admin_activity_logs_created_at_idx ON public.admin_activity_logs (created_at DESC);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- assessment_generation_idempotency
-- Identifier format convention: ${ownerUid}_${idempotencyKeyHash}
-- -----------------------------------------------------------------------------
CREATE TABLE public.assessment_generation_idempotency (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  idempotency_key_hash text NOT NULL,
  request_fingerprint text NOT NULL,
  generation_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.assessment_generation_idempotency IS 'Duplicate-request protection for assessment generation create calls.';

CREATE INDEX assessment_generation_idempotency_owner_uid_idx
  ON public.assessment_generation_idempotency (owner_uid);

ALTER TABLE public.assessment_generation_idempotency ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- assessment_daily_credits
-- Identifier format convention: ${ownerUid}__${dayKey}
-- -----------------------------------------------------------------------------
CREATE TABLE public.assessment_daily_credits (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  day_key text NOT NULL,
  daily_limit integer NOT NULL,
  successful_generation_ids text[] NOT NULL DEFAULT '{}'::text[],
  pending_reservations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE public.assessment_daily_credits IS 'UTC day credit ledger with pending reservation tracking.';

CREATE INDEX assessment_daily_credits_owner_uid_day_key_idx
  ON public.assessment_daily_credits (owner_uid, day_key);

ALTER TABLE public.assessment_daily_credits ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- assessment_credit_accounts
-- owner_uid is the account identifier.
-- -----------------------------------------------------------------------------
CREATE TABLE public.assessment_credit_accounts (
  owner_uid text PRIMARY KEY,
  assessment_access text NOT NULL CHECK (assessment_access IN ('enabled', 'disabled')),
  daily_limit_override integer,
  manual_credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE public.assessment_credit_accounts IS 'Per-user assessment credit account settings.';

ALTER TABLE public.assessment_credit_accounts ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- assessment_credit_grants
-- -----------------------------------------------------------------------------
CREATE TABLE public.assessment_credit_grants (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  credits integer NOT NULL,
  consumed integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz,
  reason text,
  note text,
  created_by_uid text NOT NULL,
  created_by_role text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_uid text,
  revoke_reason text
);

COMMENT ON TABLE public.assessment_credit_grants IS 'Time-bounded assessment credit grants managed by admins.';

CREATE INDEX assessment_credit_grants_owner_uid_idx ON public.assessment_credit_grants (owner_uid);

ALTER TABLE public.assessment_credit_grants ENABLE ROW LEVEL SECURITY;
