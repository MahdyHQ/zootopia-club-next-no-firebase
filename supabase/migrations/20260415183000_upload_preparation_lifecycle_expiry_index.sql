-- Track direct-upload preparations through the existing zc_entities document store.
-- -------------------------------------------------------------------------------
-- Why this migration exists:
-- - The signed browser upload flow can persist an owner-scoped Storage object before the
--   final document row is saved.
-- - This pass adds a dedicated `uploadPreparations` collection so abandoned prepare/upload
--   attempts can be cleaned deterministically.
-- - Cleanup queries filter by `expiresAt`, so this partial index keeps maintenance sweeps
--   bounded without scanning unrelated zc_entities collections.

CREATE INDEX IF NOT EXISTS zc_entities_upload_preparations_expires_at_idx
  ON public.zc_entities (((body ->> 'expiresAt')))
  WHERE collection = 'uploadPreparations';
