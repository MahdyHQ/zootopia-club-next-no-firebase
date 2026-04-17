-- Preserve assessment prompt entitlement in the canonical credit account table.
-- -----------------------------------------------------------------------------
-- The hybrid credit bridge now reads/writes assessment credit accounts through
-- `public.assessment_credit_accounts`. This column keeps the existing prompt
-- entitlement feature on the same account row so future credit-table reads do
-- not regress admin-managed prompt access while zc_entities remains a mirror.
-- -----------------------------------------------------------------------------

ALTER TABLE public.assessment_credit_accounts
  ADD COLUMN IF NOT EXISTS assessment_prompt_entitlement text NOT NULL DEFAULT 'disabled'
    CHECK (assessment_prompt_entitlement IN ('enabled', 'disabled'));

COMMENT ON COLUMN public.assessment_credit_accounts.assessment_prompt_entitlement IS
  'Admin-managed assessment prompt entitlement stored alongside canonical credit account settings.';
