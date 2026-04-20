-- =============================================================================
-- Migration: 20260419200000_tool_usage_accounting_foundation
-- Purpose  : Establish the structured cross-tool accounting foundation.
--
-- Design intent:
--   - tool_accounting_accounts is the canonical per-owner accounting identity.
--   - tool_usage_events is the canonical per-user, per-tool usage event ledger.
--   - tool_accounting_entries is the canonical value-mutation ledger for grants,
--     adjustments, and deductions across tools.
--   - Assessment quota/enforcement stays assessment-specific for now, but shared
--     owner identity + shared entries let future tools plug into one foundation
--     without flattening tool boundaries.
--
-- Runtime cutover notes:
--   - platform-wide aggregation can now resolve owner email/role from structured
--     tool_accounting_accounts instead of legacy user reads.
--   - assessment_credit_mutations are backfilled into tool_accounting_entries so
--     the shared ledger starts with existing admin mutation history.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: tool_accounting_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tool_accounting_accounts (
  owner_uid   text        PRIMARY KEY,
  owner_email text,
  owner_role  text        NOT NULL DEFAULT 'user',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_accounting_accounts_owner_uid_nonempty
    CHECK (length(trim(owner_uid)) > 0),
  CONSTRAINT tool_accounting_accounts_owner_role_valid
    CHECK (owner_role IN ('user', 'admin'))
);

CREATE INDEX IF NOT EXISTS tool_accounting_accounts_owner_email_idx
  ON public.tool_accounting_accounts (owner_email);

CREATE INDEX IF NOT EXISTS tool_accounting_accounts_owner_role_idx
  ON public.tool_accounting_accounts (owner_role);

ALTER TABLE public.tool_accounting_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_accounting_accounts_owner_select"
  ON public.tool_accounting_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = owner_uid);

-- Backfill the structured owner-accounting identity from the current live user store.
INSERT INTO public.tool_accounting_accounts (
  owner_uid,
  owner_email,
  owner_role,
  created_at,
  updated_at
)
SELECT
  COALESCE(
    NULLIF(trim(body->>'uid'), ''),
    NULLIF(trim(owner_uid), ''),
    id
  ) AS owner_uid,
  NULLIF(lower(trim(body->>'email')), '') AS owner_email,
  CASE
    WHEN lower(trim(COALESCE(body->>'role', 'user'))) = 'admin' THEN 'admin'
    ELSE 'user'
  END AS owner_role,
  created_at,
  updated_at
FROM public.zc_entities
WHERE collection = 'users'
ON CONFLICT (owner_uid)
DO UPDATE SET
  owner_email = COALESCE(EXCLUDED.owner_email, public.tool_accounting_accounts.owner_email),
  owner_role = EXCLUDED.owner_role,
  updated_at = GREATEST(public.tool_accounting_accounts.updated_at, EXCLUDED.updated_at);

-- ---------------------------------------------------------------------------
-- Table: tool_usage_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tool_usage_events (
  id            text        PRIMARY KEY,
  owner_uid     text        NOT NULL,
  tool_id       text        NOT NULL,
  event_kind    text        NOT NULL,
  day_key       text        NOT NULL,
  generation_id text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_usage_events_tool_id_nonempty
    CHECK (length(trim(tool_id)) > 0),
  CONSTRAINT tool_usage_events_event_kind_nonempty
    CHECK (length(trim(event_kind)) > 0),
  CONSTRAINT tool_usage_events_day_key_nonempty
    CHECK (length(trim(day_key)) > 0)
);

CREATE INDEX IF NOT EXISTS tool_usage_events_owner_uid_created_at_idx
  ON public.tool_usage_events (owner_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS tool_usage_events_owner_tool_day_idx
  ON public.tool_usage_events (owner_uid, tool_id, day_key);

CREATE INDEX IF NOT EXISTS tool_usage_events_tool_day_idx
  ON public.tool_usage_events (tool_id, day_key);

ALTER TABLE public.tool_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_usage_events_owner_select"
  ON public.tool_usage_events
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = owner_uid);

CREATE POLICY "tool_usage_events_owner_insert"
  ON public.tool_usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = owner_uid);

-- ---------------------------------------------------------------------------
-- Table: tool_accounting_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tool_accounting_entries (
  id             text        PRIMARY KEY,
  owner_uid      text        NOT NULL,
  tool_id        text        NOT NULL,
  entry_kind     text        NOT NULL,
  amount         integer     NOT NULL DEFAULT 0,
  event_kind     text,
  usage_event_id text,
  generation_id  text,
  day_key        text,
  actor_uid      text,
  actor_email    text,
  actor_role     text,
  correlation_id text,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_accounting_entries_tool_id_nonempty
    CHECK (length(trim(tool_id)) > 0),
  CONSTRAINT tool_accounting_entries_entry_kind_nonempty
    CHECK (length(trim(entry_kind)) > 0)
);

CREATE INDEX IF NOT EXISTS tool_accounting_entries_owner_uid_created_at_idx
  ON public.tool_accounting_entries (owner_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS tool_accounting_entries_owner_tool_created_at_idx
  ON public.tool_accounting_entries (owner_uid, tool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tool_accounting_entries_tool_day_idx
  ON public.tool_accounting_entries (tool_id, day_key);

ALTER TABLE public.tool_accounting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_accounting_entries_owner_select"
  ON public.tool_accounting_entries
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = owner_uid);

-- Seed the shared accounting ledger from the existing structured assessment mutation history so
-- historical admin grants/adjustments are not lost when the shared ledger becomes canonical.
INSERT INTO public.tool_accounting_entries (
  id,
  owner_uid,
  tool_id,
  entry_kind,
  amount,
  actor_uid,
  actor_email,
  actor_role,
  correlation_id,
  metadata,
  created_at
)
SELECT
  'assessment-credit-mutation:' || id AS id,
  owner_uid,
  'assessment' AS tool_id,
  CASE
    WHEN mutation_type IN ('grant_credits', 'add_manual_credits') THEN 'grant'
    WHEN mutation_type IN ('subtract_manual_credits', 'revoke_grant') THEN 'deduction'
    ELSE 'adjustment'
  END AS entry_kind,
  COALESCE(amount, 0) AS amount,
  actor_uid,
  actor_email,
  actor_role,
  correlation_id,
  jsonb_build_object(
    'sourceTable', 'assessment_credit_mutations',
    'mutationType', mutation_type,
    'access', access,
    'dailyLimitOverride', daily_limit_override,
    'grantId', grant_id,
    'expiresAt', expires_at,
    'reason', reason,
    'note', note,
    'routeSource', route_source,
    'commitStatus', commit_status
  ) AS metadata,
  created_at
FROM public.assessment_credit_mutations
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Comments for future agents
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.tool_accounting_accounts IS
  'Canonical per-owner accounting identity for shared platform/accounting services. Runtime syncs owner email/role here so platform aggregation can stay on structured reads.';

COMMENT ON TABLE public.tool_usage_events IS
  'Central cross-tool usage-event ledger. One row per owner action (generation/export/view), tool-scoped and owner-scoped.';

COMMENT ON TABLE public.tool_accounting_entries IS
  'Central cross-tool accounting mutation ledger. One row per grant, adjustment, or deduction, with actor metadata for admin mutations and future tool extensibility.';
