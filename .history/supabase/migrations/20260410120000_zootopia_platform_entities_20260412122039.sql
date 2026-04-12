-- Zootopia platform persistence for core application entities in Postgres.
-- Apply via Supabase SQL editor or `supabase db push` after linking the project.
-- Server access uses the service role from Next.js API routes (bypasses RLS).

create table if not exists public.zc_entities (
  collection text not null,
  id text not null,
  owner_uid text,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists zc_entities_owner_collection_idx
  on public.zc_entities (collection, owner_uid);

create index if not exists zc_entities_body_expires_idx
  on public.zc_entities ((body ->> 'expiresAt'))
  where collection = 'documents';

comment on table public.zc_entities is
  'Generic JSON document store for collection-shaped records; owner_uid duplicates body.ownerUid for indexed queries.';

alter table public.zc_entities enable row level security;

-- Private object storage bucket for PDFs, assessment artifacts, and exports.
-- The Next.js server uses the Supabase service role for uploads/downloads (bypasses Storage RLS).
insert into storage.buckets (id, name, public)
values ('zootopia-private', 'zootopia-private', false)
on conflict (id) do nothing;
