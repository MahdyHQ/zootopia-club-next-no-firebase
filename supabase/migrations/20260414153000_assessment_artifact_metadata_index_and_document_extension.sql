-- Durable metadata index for assessment artifacts + upload file-extension backfill.
--
-- Why this migration exists:
-- 1) Assessment artifacts were persisted inside assessmentGenerations.body.artifacts map keys,
--    which is durable but awkward to query for retention/admin/reporting.
-- 2) Upload records did not consistently persist a normalized fileExtension field for
--    cross-format reporting and retention filters.
--
-- This migration keeps backward compatibility:
-- - Existing assessment generation rows remain untouched and continue to be the source of truth.
-- - We mirror artifact metadata into a dedicated zc_entities collection
--   (assessmentArtifactMetadata) using deterministic IDs.
-- - We backfill fileExtension only when missing and derivable from fileName.

CREATE INDEX IF NOT EXISTS zc_entities_assessment_artifact_owner_generation_idx
  ON public.zc_entities (owner_uid, ((body ->> 'generationId')))
  WHERE collection = 'assessmentArtifactMetadata';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_artifact_owner_kind_status_idx
  ON public.zc_entities (owner_uid, ((body ->> 'kind')), ((body ->> 'status')))
  WHERE collection = 'assessmentArtifactMetadata';

CREATE INDEX IF NOT EXISTS zc_entities_assessment_artifact_expires_at_idx
  ON public.zc_entities (((body ->> 'expiresAt')))
  WHERE collection = 'assessmentArtifactMetadata';

CREATE INDEX IF NOT EXISTS zc_entities_documents_file_extension_idx
  ON public.zc_entities (((body ->> 'fileExtension')))
  WHERE collection = 'documents';

WITH assessment_artifact_source AS (
  SELECT
    generation_row.id AS generation_id,
    generation_row.owner_uid,
    generation_row.body AS generation_body,
    artifact_entry.key AS artifact_map_key,
    artifact_entry.value AS artifact_body,
    COALESCE(NULLIF(artifact_entry.value ->> 'key', ''), artifact_entry.key) AS artifact_key
  FROM public.zc_entities AS generation_row
  CROSS JOIN LATERAL jsonb_each(
    CASE
      WHEN jsonb_typeof(generation_row.body -> 'artifacts') = 'object'
        THEN generation_row.body -> 'artifacts'
      ELSE '{}'::jsonb
    END
  ) AS artifact_entry(key, value)
  WHERE generation_row.collection = 'assessmentGenerations'
    AND generation_row.owner_uid IS NOT NULL
    AND NULLIF(artifact_entry.value ->> 'storagePath', '') IS NOT NULL
    AND NULLIF(artifact_entry.value ->> 'kind', '') IS NOT NULL
    AND NULLIF(artifact_entry.value ->> 'fileName', '') IS NOT NULL
    AND NULLIF(artifact_entry.value ->> 'contentType', '') IS NOT NULL
)
INSERT INTO public.zc_entities (collection, id, owner_uid, body)
SELECT
  'assessmentArtifactMetadata' AS collection,
  (assessment_artifact_source.generation_id || '::' || assessment_artifact_source.artifact_key) AS id,
  assessment_artifact_source.owner_uid,
  jsonb_strip_nulls(
    jsonb_build_object(
      'id', (assessment_artifact_source.generation_id || '::' || assessment_artifact_source.artifact_key),
      'ownerUid', assessment_artifact_source.owner_uid,
      'ownerRole', assessment_artifact_source.generation_body ->> 'ownerRole',
      'generationId', assessment_artifact_source.generation_id,
      'generationStatus', assessment_artifact_source.generation_body ->> 'status',
      'generationCreatedAt', assessment_artifact_source.generation_body ->> 'createdAt',
      'generationUpdatedAt', assessment_artifact_source.generation_body ->> 'updatedAt',
      'generationExpiresAt', assessment_artifact_source.generation_body ->> 'expiresAt',
      'artifactKey', assessment_artifact_source.artifact_key,
      'key', assessment_artifact_source.artifact_key,
      'kind', assessment_artifact_source.artifact_body ->> 'kind',
      'locale', assessment_artifact_source.artifact_body ->> 'locale',
      'themeMode', NULLIF(assessment_artifact_source.artifact_body ->> 'themeMode', ''),
      'contentType', assessment_artifact_source.artifact_body ->> 'contentType',
      'fileName', assessment_artifact_source.artifact_body ->> 'fileName',
      'versionTag', NULLIF(assessment_artifact_source.artifact_body ->> 'versionTag', ''),
      'storagePath', assessment_artifact_source.artifact_body ->> 'storagePath',
      'storageDataClass', NULLIF(assessment_artifact_source.artifact_body ->> 'storageDataClass', ''),
      'storageOwnerUid', NULLIF(assessment_artifact_source.artifact_body ->> 'storageOwnerUid', ''),
      'storageLayoutVersion', NULLIF(assessment_artifact_source.artifact_body ->> 'storageLayoutVersion', ''),
      'status', COALESCE(
        NULLIF(assessment_artifact_source.artifact_body ->> 'status', ''),
        NULLIF(assessment_artifact_source.generation_body ->> 'status', ''),
        'ready'
      ),
      'createdAt', COALESCE(
        NULLIF(assessment_artifact_source.artifact_body ->> 'createdAt', ''),
        NULLIF(assessment_artifact_source.generation_body ->> 'createdAt', '')
      ),
      'expiresAt', CASE
        WHEN assessment_artifact_source.artifact_body ? 'expiresAt'
          THEN assessment_artifact_source.artifact_body -> 'expiresAt'
        WHEN assessment_artifact_source.generation_body ? 'expiresAt'
          THEN to_jsonb(assessment_artifact_source.generation_body ->> 'expiresAt')
        ELSE NULL
      END,
      'updatedAt', COALESCE(
        NULLIF(assessment_artifact_source.generation_body ->> 'updatedAt', ''),
        NULLIF(assessment_artifact_source.artifact_body ->> 'createdAt', '')
      )
    )
  ) AS body
FROM assessment_artifact_source
ON CONFLICT (collection, id)
DO UPDATE
SET
  owner_uid = EXCLUDED.owner_uid,
  body = EXCLUDED.body,
  updated_at = now();

UPDATE public.zc_entities AS document_row
SET
  body = jsonb_set(
    document_row.body,
    '{fileExtension}',
    to_jsonb(
      lower(
        regexp_replace(
          document_row.body ->> 'fileName',
          '^.*\\.',
          ''
        )
      )
    ),
    true
  ),
  updated_at = now()
WHERE document_row.collection = 'documents'
  AND COALESCE(NULLIF(document_row.body ->> 'fileExtension', ''), '') = ''
  AND COALESCE(document_row.body ->> 'fileName', '') LIKE '%.%';
