-- Phase 1: private Storage bucket for migrated object paths
-- -----------------------------------------------------------------------------
-- Mirrors app-owned object path namespaces:
--   documents/{ownerUid}/{documentId}/{fileName}
--   assessment-results/{ownerUid}/{generationId}/{fileName}
--   assessment-exports/{ownerUid}/{generationId}/{artifactKey}/{fileName}
--
-- Access in early phases: server-only via service role (same trust boundary as
-- backend privileged operations). Add `storage.objects` RLS policies when/if the browser
-- or authenticated role must touch Storage directly.
--
-- Idempotent: safe to re-run on fresh or existing projects where the bucket exists.
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('zootopia-app', 'zootopia-app', false, null, null)
ON CONFLICT (id) DO NOTHING;
