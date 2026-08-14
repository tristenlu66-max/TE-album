-- TE Album Phase 4: let the authenticated owner read AI analysis in the web UI.
-- Run once after Phase 3. The browser never receives embeddings or AI provider keys.

grant select on public.photo_ai_analysis to authenticated;

alter table public.photo_ai_analysis enable row level security;

drop policy if exists "owner photo AI analysis read" on public.photo_ai_analysis;
create policy "owner photo AI analysis read"
on public.photo_ai_analysis
for select
to authenticated
using (
  exists (
    select 1 from public.photos p
    where p.id = photo_ai_analysis.photo_id
      and p.owner_user_id = (select auth.uid())
  )
);
