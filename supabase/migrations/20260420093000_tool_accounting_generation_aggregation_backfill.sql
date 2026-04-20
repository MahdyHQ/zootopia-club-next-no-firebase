-- =============================================================================
-- Migration: 20260420093000_tool_accounting_generation_aggregation_backfill
-- Purpose  : Make central platform generation aggregation complete from shared tables.
--
-- Design intent:
--   - Assessment credits remain assessment-specific and keep their current tables.
--   - Platform/global generation totals are derived from the shared accounting/event layer.
--   - Existing assessment generation usage is backfilled into tool_accounting_entries so the
--     shared aggregation layer does not need to read assessment_daily_credits as hidden truth.
-- =============================================================================

CREATE INDEX IF NOT EXISTS tool_accounting_entries_generation_aggregation_idx
  ON public.tool_accounting_entries (
    day_key,
    tool_id,
    event_kind,
    entry_kind,
    generation_id
  )
  WHERE event_kind = 'generation';

CREATE INDEX IF NOT EXISTS tool_usage_events_generation_aggregation_idx
  ON public.tool_usage_events (
    day_key,
    tool_id,
    event_kind,
    generation_id
  )
  WHERE event_kind = 'generation';

WITH source_assessment_generations AS (
  SELECT DISTINCT ON (generation_id)
    adc.owner_uid,
    adc.day_key,
    generation_id,
    adc.created_at,
    adc.updated_at
  FROM public.assessment_daily_credits AS adc
  CROSS JOIN LATERAL unnest(
    CASE
      WHEN COALESCE(array_length(adc.platform_successful_generation_ids, 1), 0) > 0
        THEN adc.platform_successful_generation_ids
      ELSE adc.successful_generation_ids
    END
  ) AS generation_id
  WHERE NULLIF(trim(generation_id), '') IS NOT NULL
  ORDER BY generation_id, adc.updated_at DESC, adc.created_at DESC
)
INSERT INTO public.tool_accounting_entries (
  id,
  owner_uid,
  tool_id,
  entry_kind,
  amount,
  event_kind,
  generation_id,
  day_key,
  metadata,
  created_at
)
SELECT
  'assessment-generation-deduction:' || generation_id AS id,
  owner_uid,
  'assessment' AS tool_id,
  'deduction' AS entry_kind,
  1 AS amount,
  'generation' AS event_kind,
  generation_id,
  day_key,
  jsonb_build_object(
    'sourceTable', 'assessment_daily_credits',
    'sourceColumn', 'platform_successful_generation_ids',
    'backfill', '20260420093000_tool_accounting_generation_aggregation_backfill'
  ) AS metadata,
  COALESCE(updated_at, created_at, now()) AS created_at
FROM source_assessment_generations AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tool_accounting_entries AS existing
  WHERE existing.tool_id = 'assessment'
    AND existing.entry_kind = 'deduction'
    AND existing.event_kind = 'generation'
    AND existing.generation_id = source.generation_id
)
ON CONFLICT (id) DO NOTHING;
