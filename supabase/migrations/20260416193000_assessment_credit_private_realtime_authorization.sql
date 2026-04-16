-- Enforce owner-only access for private assessment-credit Realtime topics.
-- Topic contract: assessment-credit:owner:{auth.uid}

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'Skipping assessment-credit realtime authorization policy; realtime.messages not found.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS zootopia_assessment_credit_owner_select ON realtime.messages';

  EXECUTE '
    CREATE POLICY zootopia_assessment_credit_owner_select
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      realtime.messages.extension = ''broadcast''
      AND split_part(realtime.topic(), '':'' , 1) = ''assessment-credit''
      AND split_part(realtime.topic(), '':'' , 2) = ''owner''
      AND split_part(realtime.topic(), '':'' , 3) = auth.uid()::text
    )
  ';
END
$$;
