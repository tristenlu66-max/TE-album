-- TE Album Phase 2: AI resident permissions, albums, recovery and audit.
-- Run once in Supabase SQL Editor after the Phase 1 schema.

create table if not exists albums (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  cover_photo_id uuid references photos(id),
  created_by_actor_id uuid references actors(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists album_photos (
  album_id uuid not null references albums(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  position integer,
  added_by_actor_id uuid references actors(id),
  added_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references actors(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists photos_owner_active_uploaded_idx
  on photos (owner_user_id, uploaded_at desc)
  where deleted_at is null;
create index if not exists photo_comments_photo_active_created_idx
  on photo_comments (photo_id, created_at)
  where deleted_at is null;
create index if not exists albums_owner_active_updated_idx
  on albums (owner_user_id, updated_at desc)
  where deleted_at is null;
create index if not exists album_photos_photo_idx on album_photos (photo_id);
create index if not exists audit_log_entity_created_idx
  on audit_log (entity_type, entity_id, created_at desc);

grant select, insert, update, delete on albums, album_photos to authenticated;
grant select, insert, update, delete on albums, album_photos, audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table albums enable row level security;
alter table album_photos enable row level security;
alter table audit_log enable row level security;

drop policy if exists "owner albums" on albums;
create policy "owner albums" on albums for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists "owner album photos" on album_photos;
create policy "owner album photos" on album_photos for all to authenticated
using (exists (
  select 1 from albums a
  where a.id = album_id and a.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from albums a
  where a.id = album_id and a.owner_user_id = (select auth.uid())
));

-- The browser may edit or soft-delete only its own comments.
drop policy if exists "owner comments write" on photo_comments;
create policy "owner comments write" on photo_comments for insert to authenticated
with check (
  exists (select 1 from photos p where p.id = photo_id and p.owner_user_id = (select auth.uid()))
  and exists (select 1 from actors a where a.id = author_actor_id and a.auth_user_id = (select auth.uid()))
);

drop policy if exists "owner comments update" on photo_comments;
create policy "owner comments update" on photo_comments for update to authenticated
using (exists (
  select 1 from actors a
  where a.id = author_actor_id and a.auth_user_id = (select auth.uid())
))
with check (exists (
  select 1 from actors a
  where a.id = author_actor_id and a.auth_user_id = (select auth.uid())
));

drop policy if exists "owner comments delete" on photo_comments;
create policy "owner comments delete" on photo_comments for delete to authenticated
using (exists (
  select 1 from actors a
  where a.id = author_actor_id and a.auth_user_id = (select auth.uid())
));
