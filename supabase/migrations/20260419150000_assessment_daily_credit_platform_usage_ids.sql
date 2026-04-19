-- =============================================================================
-- assessment_daily_credits: platform-wide successful generation ids
-- =============================================================================
-- WHY:
-- - successful_generation_ids is intentionally tied to daily-quota-backed usage.
-- - platform-wide UI lock must count successful generations across both daily and
--   extra/manual/grant credit sources.
-- - this additive column preserves existing per-user daily-limit semantics while
--   enabling truthful platform-wide daily usage aggregation.

ALTER TABLE public.assessment_daily_credits
ADD COLUMN IF NOT EXISTS platform_successful_generation_ids text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.assessment_daily_credits.platform_successful_generation_ids
IS 'Successful assessment generation ids for platform-wide daily usage aggregation across all credit sources.';

-- Backfill existing rows from legacy daily-only ids so historical platform lock
-- behavior is preserved at least to prior daily-backed records.
UPDATE public.assessment_daily_credits
SET platform_successful_generation_ids = successful_generation_ids
WHERE COALESCE(array_length(platform_successful_generation_ids, 1), 0) = 0
  AND COALESCE(array_length(successful_generation_ids, 1), 0) > 0;
