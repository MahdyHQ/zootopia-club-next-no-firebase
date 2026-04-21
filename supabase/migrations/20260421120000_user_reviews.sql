-- =============================================================================
-- Migration: 20260421120000_user_reviews
-- Purpose  : Add the canonical dynamic public user reviews/testimonials domain.
--
-- Design intent:
--   - user_reviews is the structured truth for public testimonial cards.
--   - Review photos live in the existing private bucket under reviews/{reviewId}/...
--   - Public visitors read sanitized review DTOs through the Next.js backend.
--   - Admin writes stay server-authoritative through Auth.js-gated route handlers.
--
-- Security notes:
--   - RLS is enabled because this table lives in the public schema.
--   - No anon/authenticated table policies are added here. The service-role-backed
--     Next.js server reads/writes the table and returns only intentional public fields.
--   - Storage objects remain in zootopia-private; no direct public storage policy is added.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_reviews (
  id                 text        PRIMARY KEY,
  person_name        text        NOT NULL,
  review_text        text        NOT NULL,
  photo_storage_path text        NOT NULL,
  photo_mime_type    text        NOT NULL,
  photo_size_bytes   integer     NOT NULL,
  photo_width        integer,
  photo_height       integer,
  is_published       boolean     NOT NULL DEFAULT true,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_by_uid     text,
  updated_by_uid     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,
  CONSTRAINT user_reviews_id_nonempty
    CHECK (length(trim(id)) > 0),
  CONSTRAINT user_reviews_person_name_length
    CHECK (length(trim(person_name)) BETWEEN 1 AND 160),
  CONSTRAINT user_reviews_review_text_length
    CHECK (length(trim(review_text)) BETWEEN 1 AND 4000),
  CONSTRAINT user_reviews_photo_path_prefix
    CHECK (photo_storage_path LIKE 'reviews/%'),
  CONSTRAINT user_reviews_photo_mime_type_valid
    CHECK (photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT user_reviews_photo_size_positive
    CHECK (photo_size_bytes > 0),
  CONSTRAINT user_reviews_photo_width_positive
    CHECK (photo_width IS NULL OR photo_width > 0),
  CONSTRAINT user_reviews_photo_height_positive
    CHECK (photo_height IS NULL OR photo_height > 0)
);

CREATE INDEX IF NOT EXISTS user_reviews_published_sort_idx
  ON public.user_reviews (is_published, sort_order DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS user_reviews_created_at_idx
  ON public.user_reviews (created_at DESC);

CREATE INDEX IF NOT EXISTS user_reviews_updated_at_idx
  ON public.user_reviews (updated_at DESC);

ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_reviews IS
  'Canonical structured table for public testimonial/review cards. Public reads and admin writes are mediated by Auth.js-gated Next.js server routes; direct browser table access is intentionally not granted.';

COMMENT ON COLUMN public.user_reviews.photo_storage_path IS
  'Private-bucket object path under reviews/{reviewId}/... served publicly only through the server image route for published reviews.';

COMMENT ON COLUMN public.user_reviews.created_by_uid IS
  'Admin actor uid that originally created the review. This is admin metadata and must not be exposed in public review DTOs.';

COMMENT ON COLUMN public.user_reviews.updated_by_uid IS
  'Admin actor uid for the latest review mutation. This is admin metadata and must not be exposed in public review DTOs.';
