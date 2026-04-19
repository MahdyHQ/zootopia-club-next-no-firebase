-- =============================================================================
-- assessment_daily_credits: recover platform-wide successful generation ids
-- =============================================================================
-- WHY:
-- - rollout-compatible application code can write `platformSuccessfulGenerationIds`
--   into legacy `assessmentDailyCredits` mirrors before the structured SQL column
--   exists.
-- - the additive column migration backfills only `successful_generation_ids`,
--   which can miss extra/manual/grant-backed successful generations from that
--   overlap window.
-- - this repair pass copies the richer legacy platform lane into the structured
--   table so platform-wide daily usage remains truthful after the SQL column exists.

WITH legacy_platform_usage AS (
  SELECT
    id,
    updated_at AS legacy_updated_at,
    COALESCE(
      ARRAY(
        SELECT DISTINCT trimmed_value
        FROM (
          SELECT NULLIF(BTRIM(raw_value), '') AS trimmed_value
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(body -> 'platformSuccessfulGenerationIds') = 'array'
                THEN body -> 'platformSuccessfulGenerationIds'
              WHEN jsonb_typeof(body -> 'successfulGenerationIds') = 'array'
                THEN body -> 'successfulGenerationIds'
              ELSE '[]'::jsonb
            END
          ) AS value(raw_value)
        ) AS normalized_values
        WHERE trimmed_value IS NOT NULL
      ),
      '{}'::text[]
    ) AS platform_successful_generation_ids
  FROM public.zc_entities
  WHERE collection = 'assessmentDailyCredits'
)
UPDATE public.assessment_daily_credits AS structured
SET
  platform_successful_generation_ids = legacy.platform_successful_generation_ids,
  updated_at = GREATEST(structured.updated_at, legacy.legacy_updated_at)
FROM legacy_platform_usage AS legacy
WHERE structured.id = legacy.id
  AND COALESCE(array_length(legacy.platform_successful_generation_ids, 1), 0) > 0
  AND structured.platform_successful_generation_ids IS DISTINCT FROM legacy.platform_successful_generation_ids;
