-- Backfill legacy credit-bridge documents into the canonical relational tables.
-- -----------------------------------------------------------------------------
-- Why this migration exists:
-- 1) The repository already dual-writes current credit state into relational tables and
--    legacy `zc_entities` collections inside the same transaction.
-- 2) Older rows can still exist only in the legacy collections until a fresh mutation or
--    credit-consuming write touches that owner again.
-- 3) This migration closes that historical drift by inserting any missing account, ledger,
--    grant, and mutation-history rows into the structured tables without overwriting newer
--    relational truth.
--
-- Safety contract:
-- - Mutable tables (accounts, daily ledgers, grants) use timestamp-gated upserts, so a legacy
--   row can refresh the structured copy only when the legacy mirror is newer.
-- - Append-only mutation history inserts only missing relational rows.
-- - Legacy collections remain in place as compatibility mirrors for the current hybrid reads.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS assessment_credit_grants_owner_uid_created_idx
  ON public.assessment_credit_grants (owner_uid, created_at DESC);

WITH legacy_accounts AS (
  SELECT
    COALESCE(NULLIF(body ->> 'ownerUid', ''), owner_uid, NULLIF(id, '')) AS resolved_owner_uid,
    CASE
      WHEN body ->> 'assessmentAccess' = 'disabled' THEN 'disabled'
      ELSE 'enabled'
    END AS assessment_access,
    CASE
      WHEN body ->> 'assessmentPromptEntitlement' = 'enabled' THEN 'enabled'
      ELSE 'disabled'
    END AS assessment_prompt_entitlement,
    CASE
      WHEN COALESCE(body ->> 'dailyLimitOverride', '') ~ '^-?[0-9]+$'
        THEN (body ->> 'dailyLimitOverride')::integer
      ELSE NULL
    END AS daily_limit_override,
    CASE
      WHEN COALESCE(body ->> 'manualCredits', '') ~ '^-?[0-9]+$'
        THEN GREATEST((body ->> 'manualCredits')::integer, 0)
      ELSE 0
    END AS manual_credits,
    CASE
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS created_at,
    CASE
      WHEN COALESCE(body ->> 'updatedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'updatedAt')::timestamptz
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS updated_at
  FROM public.zc_entities
  WHERE collection = 'assessmentCreditAccounts'
)
INSERT INTO public.assessment_credit_accounts (
  owner_uid,
  assessment_access,
  assessment_prompt_entitlement,
  daily_limit_override,
  manual_credits,
  created_at,
  updated_at
)
SELECT
  resolved_owner_uid,
  assessment_access,
  assessment_prompt_entitlement,
  daily_limit_override,
  manual_credits,
  created_at,
  updated_at
FROM legacy_accounts
WHERE resolved_owner_uid IS NOT NULL
ON CONFLICT (owner_uid)
DO UPDATE SET
  assessment_access = EXCLUDED.assessment_access,
  assessment_prompt_entitlement = EXCLUDED.assessment_prompt_entitlement,
  daily_limit_override = EXCLUDED.daily_limit_override,
  manual_credits = EXCLUDED.manual_credits,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at > public.assessment_credit_accounts.updated_at;

WITH legacy_daily_credits AS (
  SELECT
    id,
    COALESCE(
      NULLIF(body ->> 'ownerUid', ''),
      owner_uid,
      NULLIF(split_part(id, '__', 1), '')
    ) AS resolved_owner_uid,
    COALESCE(
      NULLIF(body ->> 'dayKey', ''),
      NULLIF(split_part(id, '__', 2), '')
    ) AS day_key,
    CASE
      WHEN COALESCE(body ->> 'dailyLimit', '') ~ '^[0-9]+$'
        THEN (body ->> 'dailyLimit')::integer
      ELSE 3
    END AS daily_limit,
    CASE
      WHEN jsonb_typeof(body -> 'successfulGenerationIds') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(body -> 'successfulGenerationIds'))
      ELSE '{}'::text[]
    END AS successful_generation_ids,
    CASE
      WHEN jsonb_typeof(body -> 'pendingReservations') = 'array'
        THEN body -> 'pendingReservations'
      ELSE '[]'::jsonb
    END AS pending_reservations,
    CASE
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS created_at,
    CASE
      WHEN COALESCE(body ->> 'updatedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'updatedAt')::timestamptz
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS updated_at
  FROM public.zc_entities
  WHERE collection = 'assessmentDailyCredits'
)
INSERT INTO public.assessment_daily_credits (
  id,
  owner_uid,
  day_key,
  daily_limit,
  successful_generation_ids,
  pending_reservations,
  created_at,
  updated_at
)
SELECT
  id,
  resolved_owner_uid,
  day_key,
  daily_limit,
  successful_generation_ids,
  pending_reservations,
  created_at,
  updated_at
FROM legacy_daily_credits
WHERE NULLIF(id, '') IS NOT NULL
  AND resolved_owner_uid IS NOT NULL
  AND day_key IS NOT NULL
ON CONFLICT (id)
DO UPDATE SET
  owner_uid = EXCLUDED.owner_uid,
  day_key = EXCLUDED.day_key,
  daily_limit = EXCLUDED.daily_limit,
  successful_generation_ids = EXCLUDED.successful_generation_ids,
  pending_reservations = EXCLUDED.pending_reservations,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at > public.assessment_daily_credits.updated_at;

WITH legacy_grants AS (
  SELECT
    id,
    COALESCE(NULLIF(body ->> 'ownerUid', ''), owner_uid) AS resolved_owner_uid,
    CASE
      WHEN COALESCE(body ->> 'credits', '') ~ '^[0-9]+$'
        THEN (body ->> 'credits')::integer
      ELSE NULL
    END AS credits,
    CASE
      WHEN COALESCE(body ->> 'consumed', '') ~ '^[0-9]+$'
        THEN (body ->> 'consumed')::integer
      ELSE 0
    END AS consumed,
    CASE
      WHEN body ->> 'status' = 'revoked' THEN 'revoked'
      ELSE 'active'
    END AS status,
    CASE
      WHEN COALESCE(body ->> 'expiresAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'expiresAt')::timestamptz
      ELSE NULL
    END AS expires_at,
    NULLIF(body ->> 'reason', '') AS reason,
    NULLIF(body ->> 'note', '') AS note,
    COALESCE(NULLIF(body ->> 'createdByUid', ''), 'system') AS created_by_uid,
    NULLIF(body ->> 'createdByRole', '') AS created_by_role,
    CASE
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS created_at,
    CASE
      WHEN COALESCE(body ->> 'updatedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'updatedAt')::timestamptz
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS updated_at,
    CASE
      WHEN COALESCE(body ->> 'revokedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'revokedAt')::timestamptz
      ELSE NULL
    END AS revoked_at,
    NULLIF(body ->> 'revokedByUid', '') AS revoked_by_uid,
    NULLIF(body ->> 'revokeReason', '') AS revoke_reason
  FROM public.zc_entities
  WHERE collection = 'assessmentCreditGrants'
)
INSERT INTO public.assessment_credit_grants (
  id,
  owner_uid,
  credits,
  consumed,
  status,
  expires_at,
  reason,
  note,
  created_by_uid,
  created_by_role,
  created_at,
  updated_at,
  revoked_at,
  revoked_by_uid,
  revoke_reason
)
SELECT
  id,
  resolved_owner_uid,
  credits,
  consumed,
  status,
  expires_at,
  reason,
  note,
  created_by_uid,
  created_by_role,
  created_at,
  updated_at,
  revoked_at,
  revoked_by_uid,
  revoke_reason
FROM legacy_grants
WHERE NULLIF(id, '') IS NOT NULL
  AND resolved_owner_uid IS NOT NULL
  AND credits IS NOT NULL
ON CONFLICT (id)
DO UPDATE SET
  owner_uid = EXCLUDED.owner_uid,
  credits = EXCLUDED.credits,
  consumed = EXCLUDED.consumed,
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  reason = EXCLUDED.reason,
  note = EXCLUDED.note,
  created_by_uid = EXCLUDED.created_by_uid,
  created_by_role = EXCLUDED.created_by_role,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at,
  revoked_at = EXCLUDED.revoked_at,
  revoked_by_uid = EXCLUDED.revoked_by_uid,
  revoke_reason = EXCLUDED.revoke_reason
WHERE EXCLUDED.updated_at > public.assessment_credit_grants.updated_at;

WITH legacy_mutations AS (
  SELECT
    id,
    COALESCE(NULLIF(body ->> 'ownerUid', ''), owner_uid) AS resolved_owner_uid,
    COALESCE(NULLIF(body ->> 'adminUid', ''), 'system') AS actor_uid,
    NULLIF(body ->> 'adminEmail', '') AS actor_email,
    NULLIF(body ->> 'adminRole', '') AS actor_role,
    CASE
      WHEN body ->> 'action' IN (
        'set_access',
        'set_daily_override',
        'clear_daily_override',
        'add_manual_credits',
        'subtract_manual_credits',
        'set_manual_credits',
        'grant_credits',
        'revoke_grant'
      ) THEN body ->> 'action'
      ELSE NULL
    END AS mutation_type,
    CASE
      WHEN COALESCE(body ->> 'amount', '') ~ '^-?[0-9]+$'
        THEN (body ->> 'amount')::integer
      ELSE NULL
    END AS amount,
    CASE
      WHEN body ->> 'access' IN ('enabled', 'disabled')
        THEN body ->> 'access'
      ELSE NULL
    END AS access,
    CASE
      WHEN COALESCE(body ->> 'dailyLimitOverride', '') ~ '^-?[0-9]+$'
        THEN (body ->> 'dailyLimitOverride')::integer
      ELSE NULL
    END AS daily_limit_override,
    NULLIF(body ->> 'grantId', '') AS grant_id,
    CASE
      WHEN COALESCE(body ->> 'expiresAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'expiresAt')::timestamptz
      ELSE NULL
    END AS expires_at,
    NULLIF(body ->> 'reason', '') AS reason,
    NULLIF(body ->> 'note', '') AS note,
    CASE
      WHEN jsonb_typeof(body -> 'before') = 'object'
        THEN body -> 'before'
      ELSE '{}'::jsonb
    END AS before_snapshot,
    CASE
      WHEN jsonb_typeof(body -> 'after') = 'object'
        THEN body -> 'after'
      ELSE '{}'::jsonb
    END AS after_snapshot,
    CASE
      WHEN COALESCE(body #>> '{before,manualCredits}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{before,manualCredits}')::integer
      ELSE NULL
    END AS before_manual_credits,
    CASE
      WHEN COALESCE(body #>> '{after,manualCredits}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{after,manualCredits}')::integer
      ELSE NULL
    END AS after_manual_credits,
    CASE
      WHEN COALESCE(body #>> '{before,remainingCount}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{before,remainingCount}')::integer
      ELSE NULL
    END AS before_remaining_count,
    CASE
      WHEN COALESCE(body #>> '{after,remainingCount}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{after,remainingCount}')::integer
      ELSE NULL
    END AS after_remaining_count,
    CASE
      WHEN COALESCE(body #>> '{before,dailyLimit}', '') ~ '^-?[0-9]+$'
        AND COALESCE(body #>> '{before,usedCount}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{before,dailyLimit}')::integer - (body #>> '{before,usedCount}')::integer
      ELSE NULL
    END AS before_daily_remaining_count,
    CASE
      WHEN COALESCE(body #>> '{after,dailyLimit}', '') ~ '^-?[0-9]+$'
        AND COALESCE(body #>> '{after,usedCount}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{after,dailyLimit}')::integer - (body #>> '{after,usedCount}')::integer
      ELSE NULL
    END AS after_daily_remaining_count,
    CASE
      WHEN COALESCE(body #>> '{before,grantCreditsAvailable}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{before,grantCreditsAvailable}')::integer
      ELSE NULL
    END AS before_grant_credits_available,
    CASE
      WHEN COALESCE(body #>> '{after,grantCreditsAvailable}', '') ~ '^-?[0-9]+$'
        THEN (body #>> '{after,grantCreditsAvailable}')::integer
      ELSE NULL
    END AS after_grant_credits_available,
    NULLIF(body ->> 'correlationId', '') AS correlation_id,
    NULLIF(body ->> 'routeSource', '') AS route_source,
    CASE
      WHEN body ->> 'commitStatus' IN ('committed', 'committed_with_warning')
        THEN body ->> 'commitStatus'
      ELSE 'committed'
    END AS commit_status,
    CASE
      WHEN COALESCE(body ->> 'createdAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (body ->> 'createdAt')::timestamptz
      ELSE updated_at
    END AS created_at
  FROM public.zc_entities
  WHERE collection = 'assessmentCreditMutationHistory'
)
INSERT INTO public.assessment_credit_mutations (
  id,
  owner_uid,
  actor_uid,
  actor_email,
  actor_role,
  mutation_type,
  amount,
  access,
  daily_limit_override,
  grant_id,
  expires_at,
  reason,
  note,
  before_snapshot,
  after_snapshot,
  before_manual_credits,
  after_manual_credits,
  before_remaining_count,
  after_remaining_count,
  before_daily_remaining_count,
  after_daily_remaining_count,
  before_grant_credits_available,
  after_grant_credits_available,
  correlation_id,
  route_source,
  commit_status,
  created_at
)
SELECT
  id,
  resolved_owner_uid,
  actor_uid,
  actor_email,
  actor_role,
  mutation_type,
  amount,
  access,
  daily_limit_override,
  grant_id,
  expires_at,
  reason,
  note,
  before_snapshot,
  after_snapshot,
  before_manual_credits,
  after_manual_credits,
  before_remaining_count,
  after_remaining_count,
  before_daily_remaining_count,
  after_daily_remaining_count,
  before_grant_credits_available,
  after_grant_credits_available,
  correlation_id,
  route_source,
  commit_status,
  created_at
FROM legacy_mutations
WHERE NULLIF(id, '') IS NOT NULL
  AND resolved_owner_uid IS NOT NULL
  AND mutation_type IS NOT NULL
ON CONFLICT (id) DO NOTHING;
