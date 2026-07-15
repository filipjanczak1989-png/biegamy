-- MOST v2: realne treningi BiegaMy → pióra w grze Bieguś (5🪶/km)
-- Tabela znacznika ostatniego odbioru per athlete; RLS self-only (Phase 1: kolumnowy GRANT).
-- Konsument: biegus.html (gra) przez REST na sesji appki (ten sam origin biegamy.run).
-- anon: NIC (świadomie). Do comiesięcznej checklisty RLS.

create table if not exists public.biegus_most (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  ostatni_odbior timestamptz not null default now()
);
alter table public.biegus_most enable row level security;

create policy biegus_most_self_select on public.biegus_most
  for select to authenticated
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));

create policy biegus_most_self_insert on public.biegus_most
  for insert to authenticated
  with check (athlete_id in (select id from public.athletes where user_id = auth.uid()));

create policy biegus_most_self_update on public.biegus_most
  for update to authenticated
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where user_id = auth.uid()));

-- RLS Phase 1 pattern: kolumnowy GRANT (Postgres NIE nadaje SELECT sam po REVOKE)
grant select (athlete_id, ostatni_odbior) on public.biegus_most to authenticated;
grant insert (athlete_id, ostatni_odbior) on public.biegus_most to authenticated;
grant update (ostatni_odbior)             on public.biegus_most to authenticated;

-- anon: NIC (świadomie). KRYTYCZNE: CREATE TABLE dziedziczy anon=ALL z pg_default_acl
-- mimo GRANT tylko authenticated (pamięć: default-priv anon=ALL). Jawny REVOKE domyka.
-- Zweryfikowane REST: anon GET → 401 permission denied (RLS + brak grantu).
revoke all on public.biegus_most from anon;

notify pgrst, 'reload schema';
