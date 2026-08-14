-- TE Album Phase 3: private AI descriptions, OCR and semantic search.
-- Run once in Supabase SQL Editor after Phase 1 and Phase 2.

create extension if not exists vector with schema extensions;

create table if not exists photo_ai_analysis (
  photo_id uuid primary key references photos(id) on delete cascade,
  model text not null,
  analysis jsonb not null,
  search_text text not null,
  response_id text,
  analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists photo_embeddings (
  photo_id uuid primary key references photos(id) on delete cascade,
  model text not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now()
);

create index if not exists photo_ai_analysis_analyzed_idx
  on photo_ai_analysis (analyzed_at desc);

-- A sequential scan is deliberate at this small, personal-album scale. Add an
-- HNSW index only when the album grows large enough to need it.

grant select, insert, update, delete on photo_ai_analysis, photo_embeddings to service_role;

alter table photo_ai_analysis enable row level security;
alter table photo_embeddings enable row level security;

create or replace function match_album_photo_embeddings(
  query_embedding extensions.vector(1536),
  match_count integer default 10,
  min_similarity double precision default 0.20
)
returns table (
  photo_id uuid,
  similarity double precision,
  content text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    e.photo_id,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.content
  from photo_embeddings e
  join photos p on p.id = e.photo_id
  where p.deleted_at is null
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 50));
$$;

revoke all on function match_album_photo_embeddings(extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function match_album_photo_embeddings(extensions.vector, integer, double precision) to service_role;
