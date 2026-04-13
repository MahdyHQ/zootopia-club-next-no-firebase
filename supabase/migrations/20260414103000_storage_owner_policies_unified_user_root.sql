-- Expand zootopia-private storage owner policies to support canonical user-root paths.
-- Keeps legacy path compatibility while new writes move to users/{ownerUid}/... layout.

DO $$
BEGIN
  DROP POLICY IF EXISTS zootopia_private_owner_select ON storage.objects;
  DROP POLICY IF EXISTS zootopia_private_owner_insert ON storage.objects;
  DROP POLICY IF EXISTS zootopia_private_owner_update ON storage.objects;
  DROP POLICY IF EXISTS zootopia_private_owner_delete ON storage.objects;

  CREATE POLICY zootopia_private_owner_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'zootopia-private'
      AND (
        (
          split_part(name, '/', 1) IN ('documents', 'assessment-results', 'assessment-exports')
          AND split_part(name, '/', 2) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'uploads'
          AND split_part(name, '/', 2) = 'temp'
          AND split_part(name, '/', 3) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'users'
          AND split_part(name, '/', 2) = auth.uid()::text
          AND (
            split_part(name, '/', 3) IN ('documents', 'assessment-results', 'assessment-exports')
            OR (
              split_part(name, '/', 3) = 'uploads'
              AND split_part(name, '/', 4) = 'temp'
            )
          )
        )
      )
    );

  CREATE POLICY zootopia_private_owner_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'zootopia-private'
      AND (
        (
          split_part(name, '/', 1) IN ('documents', 'assessment-results', 'assessment-exports')
          AND split_part(name, '/', 2) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'uploads'
          AND split_part(name, '/', 2) = 'temp'
          AND split_part(name, '/', 3) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'users'
          AND split_part(name, '/', 2) = auth.uid()::text
          AND (
            split_part(name, '/', 3) IN ('documents', 'assessment-results', 'assessment-exports')
            OR (
              split_part(name, '/', 3) = 'uploads'
              AND split_part(name, '/', 4) = 'temp'
            )
          )
        )
      )
    );

  CREATE POLICY zootopia_private_owner_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'zootopia-private'
      AND (
        (
          split_part(name, '/', 1) IN ('documents', 'assessment-results', 'assessment-exports')
          AND split_part(name, '/', 2) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'uploads'
          AND split_part(name, '/', 2) = 'temp'
          AND split_part(name, '/', 3) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'users'
          AND split_part(name, '/', 2) = auth.uid()::text
          AND (
            split_part(name, '/', 3) IN ('documents', 'assessment-results', 'assessment-exports')
            OR (
              split_part(name, '/', 3) = 'uploads'
              AND split_part(name, '/', 4) = 'temp'
            )
          )
        )
      )
    )
    WITH CHECK (
      bucket_id = 'zootopia-private'
      AND (
        (
          split_part(name, '/', 1) IN ('documents', 'assessment-results', 'assessment-exports')
          AND split_part(name, '/', 2) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'uploads'
          AND split_part(name, '/', 2) = 'temp'
          AND split_part(name, '/', 3) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'users'
          AND split_part(name, '/', 2) = auth.uid()::text
          AND (
            split_part(name, '/', 3) IN ('documents', 'assessment-results', 'assessment-exports')
            OR (
              split_part(name, '/', 3) = 'uploads'
              AND split_part(name, '/', 4) = 'temp'
            )
          )
        )
      )
    );

  CREATE POLICY zootopia_private_owner_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'zootopia-private'
      AND (
        (
          split_part(name, '/', 1) IN ('documents', 'assessment-results', 'assessment-exports')
          AND split_part(name, '/', 2) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'uploads'
          AND split_part(name, '/', 2) = 'temp'
          AND split_part(name, '/', 3) = auth.uid()::text
        )
        OR (
          split_part(name, '/', 1) = 'users'
          AND split_part(name, '/', 2) = auth.uid()::text
          AND (
            split_part(name, '/', 3) IN ('documents', 'assessment-results', 'assessment-exports')
            OR (
              split_part(name, '/', 3) = 'uploads'
              AND split_part(name, '/', 4) = 'temp'
            )
          )
        )
      )
    );
END
$$;
