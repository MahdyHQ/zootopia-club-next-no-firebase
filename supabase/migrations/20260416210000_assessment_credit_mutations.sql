-- Canonical assessment credit mutation history for the hybrid credit bridge.
-- -----------------------------------------------------------------------------
-- Credit summaries remain server-owned in repository.ts, but mutation history now
-- needs its own relational table so admin actions, before/after snapshots, and
-- user-visible credit history no longer depend on zc_entities as primary truth.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assessment_credit_mutations (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  actor_uid text NOT NULL,
  actor_email text,
  actor_role text,
  mutation_type text NOT NULL,
  amount integer,
  access text,
  daily_limit_override integer,
  grant_id text,
  expires_at timestamptz,
  reason text,
  note text,
  message_to_user text,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_manual_credits integer,
  after_manual_credits integer,
  before_remaining_count integer,
  after_remaining_count integer,
  before_daily_remaining_count integer,
  after_daily_remaining_count integer,
  before_grant_credits_available integer,
  after_grant_credits_available integer,
  correlation_id text,
  route_source text,
  commit_status text NOT NULL DEFAULT 'committed'
    CHECK (commit_status IN ('committed', 'committed_with_warning')),
  created_at timestamptz NOT NULL
);

COMMENT ON TABLE public.assessment_credit_mutations IS
  'Canonical credit mutation history with before/after snapshots, actor attribution, and route correlation.';

CREATE INDEX IF NOT EXISTS assessment_credit_mutations_owner_uid_created_idx
  ON public.assessment_credit_mutations (owner_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS assessment_credit_mutations_actor_uid_created_idx
  ON public.assessment_credit_mutations (actor_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS assessment_credit_mutations_correlation_idx
  ON public.assessment_credit_mutations (correlation_id)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE public.assessment_credit_mutations ENABLE ROW LEVEL SECURITY;
