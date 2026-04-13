-- Repair zc_entities schema drift where legacy bootstrap created table without created_at.
-- Safe to run repeatedly in all environments.

ALTER TABLE public.zc_entities
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_zc_entities_created
  ON public.zc_entities (collection, created_at DESC);

COMMENT ON COLUMN public.zc_entities.created_at IS
  'Document creation timestamp used by adapter metadata and stable ordering.';
