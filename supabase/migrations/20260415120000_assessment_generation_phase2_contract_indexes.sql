-- Phase 2 assessment-generation contract hardening.
--
-- Why this migration exists:
-- 1) assessmentGenerations now persist rawModelResult plus a richer normalizedResult envelope
--    inside the existing zc_entities JSONB document body.
-- 2) We want those new versioned/result-shape fields to remain queryable for diagnostics,
--    auditing, analytics preparation, and future grouped-render evolution without moving away
--    from the current zc_entities-backed persistence model.
--
-- This pass is intentionally additive:
-- - zc_entities remains the source-of-truth store for assessment generation records.
-- - No rows are rewritten and no legacy fields are removed.
-- - Existing preview/export/auth ownership stays unchanged.

CREATE INDEX IF NOT EXISTS zc_entities_assessment_generation_raw_provider_idx
  ON public.zc_entities (((body #>> '{rawModelResult,provider}')))
  WHERE collection = 'assessmentGenerations';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_generation_prompt_contract_version_idx
  ON public.zc_entities (((body #>> '{normalizedResult,promptContractVersion}')))
  WHERE collection = 'assessmentGenerations';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_generation_normalization_version_idx
  ON public.zc_entities (((body #>> '{normalizedResult,normalizationVersion}')))
  WHERE collection = 'assessmentGenerations';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_generation_render_model_version_idx
  ON public.zc_entities (((body #>> '{normalizedResult,renderModelVersion}')))
  WHERE collection = 'assessmentGenerations';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_generation_selected_types_gin_idx
  ON public.zc_entities
  USING gin ((body #> '{normalizedResult,selectedQuestionTypes}'))
  WHERE collection = 'assessmentGenerations';
