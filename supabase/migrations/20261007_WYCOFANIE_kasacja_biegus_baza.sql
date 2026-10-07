-- WYCOFANIE 20261007_kasacja_biegus_baza.sql — odtwarza tabele (biegus_most, game_events), funkcje i granty w stanie
-- ZMIERZONYM na prod 7.10.2026 (po migracjach paczki 3, przed kasacją). DANYCH NIE ODTWARZA SAMO:
-- kroki 4 i 4b wymagają plików z tools/backup-biegus_most.sql (zapytania 2 i 4 → jeden jsonb każde).
--
-- ⚠️ Front po fazie 1 nie ma już gry — wycofanie bazy ma sens tylko razem z cofnięciem commita
--    fazy 1 (git revert) i deployem; sama baza bez klienta to martwa tabela z grantami.
-- ⚠️ Default privileges: `create table` w public nadaje anonowi ALL, `create function` — EXECUTE dla
--    anon/authenticated/service_role JAWNIE (LEKCJE #23) — dlatego revoke z NAZWY na końcu każdego kroku.

begin;

-- 1. tabela (0715 + 0716), RLS, polityki
create table if not exists public.biegus_most (
  athlete_id     uuid primary key references public.athletes(id) on delete cascade,
  ostatni_odbior timestamptz not null default now(),
  zapis          jsonb,
  zapis_ts       timestamptz
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

-- granty = migawka rls/biegus_most.txt z 7.10 po MOST-RPC: authenticated tabelowo bez INSERT/UPDATE,
-- UPDATE kolumnowo tylko zapis, zapis_ts; anon nic
revoke all on public.biegus_most from public;
revoke all on public.biegus_most from anon;
revoke all on public.biegus_most from authenticated;
grant select, delete, references, trigger, truncate on public.biegus_most to authenticated;
grant update (zapis, zapis_ts) on public.biegus_most to authenticated;

-- 2. biegus_ranking (migawka funkcje/biegus_ranking.sql)
CREATE OR REPLACE FUNCTION public.biegus_ranking()
 RETURNS TABLE(imie text, km numeric, gwiazdki integer, etapy integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    left(coalesce(nullif(zapis->>'imie',''),'Bieguś'),24)              as imie,
    coalesce((zapis->>'laczneKm')::numeric,0)                          as km,
    coalesce((select count(*)::int
              from jsonb_object_keys(coalesce(zapis->'gwiazdki','{}'::jsonb))),0) as gwiazdki,
    coalesce(jsonb_array_length(coalesce(zapis->'ukonczone','[]'::jsonb)),0)      as etapy
  from public.biegus_most
  where zapis is not null
  order by km desc, gwiazdki desc
  limit 20;
$function$;
revoke all on function public.biegus_ranking() from public;
revoke all on function public.biegus_ranking() from anon;
grant execute on function public.biegus_ranking() to authenticated, service_role;

-- 3. biegus_most_odbierz (migawka funkcje/biegus_most_odbierz.sql, 7.10)
create or replace function public.biegus_most_odbierz()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_aid uuid;
  v_od  timestamptz;
  v_km  numeric := 0;
  v_piora int := 0;
  v_logi jsonb := '[]'::jsonb;
begin
  select a.id into v_aid from public.athletes a where a.user_id = auth.uid() limit 1;
  if v_aid is null then
    raise exception 'brak wiersza athletes dla zalogowanego usera' using errcode = '42501';
  end if;

  insert into public.biegus_most (athlete_id, ostatni_odbior)
  values (v_aid, now() - interval '7 days')
  on conflict (athlete_id) do nothing;

  select m.ostatni_odbior into v_od
  from public.biegus_most m where m.athlete_id = v_aid
  for update;

  select coalesce(sum(coalesce(l.distance_km, 0)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'distance_km', l.distance_km,
           'training_type', l.training_type,
           'logged_at', l.logged_at) order by l.logged_at), '[]'::jsonb)
    into v_km, v_logi
  from public.training_logs l
  where l.athlete_id = v_aid
    and l.logged_at > v_od
    and (l.training_type is null or l.training_type not like '\_\_badge\_\_%');

  v_piora := floor(v_km * 5);

  if v_piora >= 1 then
    update public.biegus_most
       set ostatni_odbior = greatest(ostatni_odbior, now())
     where athlete_id = v_aid;
  end if;

  return jsonb_build_object('piora', v_piora, 'km', v_km, 'logi', v_logi, 'od', v_od);
end;
$fn$;
revoke all on function public.biegus_most_odbierz() from public;
revoke all on function public.biegus_most_odbierz() from anon;
grant execute on function public.biegus_most_odbierz() to authenticated, service_role;

-- 4. DANE z backupu: wkleić zawartość komórki z tools/backup-biegus_most.sql (zapytanie 2) w miejsce […]
-- insert into public.biegus_most (athlete_id, ostatni_odbior, zapis, zapis_ts)
-- select athlete_id, ostatni_odbior, zapis, zapis_ts
--   from jsonb_populate_recordset(null::public.biegus_most, '[…]'::jsonb)
-- on conflict (athlete_id) do nothing;

-- 4a. game_events — DDL zmierzone na prod 7.10 (kolumny, PK, RLS, polityka, granty kolumnowe) — BEZ anon, patrz niżej
create table if not exists public.game_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  athlete_id uuid default auth.uid(),
  anon_id    text,
  wersja     text,
  typ        text not null,
  dane       jsonb not null default '{}'::jsonb
);
alter table public.game_events enable row level security;
-- ⚠️ INSERT dla anon NIE JEST odtwarzany (świadomie, 7.10.2026): na prod przed kasacją anon miał INSERT
--    kolumnowy + politykę ge_insert dla {anon, authenticated} — bo gra pisała telemetrię także bez
--    logowania. Po fazie 1 nie ma producenta, a zapis dla niezalogowanego to decyzja o wycieku/spamie,
--    nie o rollbacku (bramka-commit: GRANT dla anon = blokada twarda, bez trailera). Jeśli gra kiedyś
--    wróci z anonimową telemetrią, grant i rola anon w polityce to OSOBNA migracja z własnym zwiadem.
create policy ge_insert on public.game_events for insert to authenticated with check (true);
revoke all on public.game_events from public;
revoke all on public.game_events from anon;
revoke all on public.game_events from authenticated;
grant insert (anon_id, athlete_id, dane, typ, wersja) on public.game_events to authenticated;

-- 4b. DANE game_events z backupu (zapytanie 4 w tools/backup-biegus_most.sql)
-- insert into public.game_events (id, created_at, athlete_id, anon_id, wersja, typ, dane)
-- select id, created_at, athlete_id, anon_id, wersja, typ, dane
--   from jsonb_populate_recordset(null::public.game_events, '[…]'::jsonb)
-- on conflict (id) do nothing;

-- 5. delete_my_account: przywrócić OBIE linie (CREATE OR REPLACE z migawki
--    supabase/schema/funkcje/delete_my_account.sql sprzed kasacji — suma 9b69c5ad6b9560e2 — albo wstawić
--    `DELETE FROM public.biegus_most WHERE athlete_id = v_athlete_id;` po delivered_moments
--    i `DELETE FROM public.game_events WHERE athlete_id = v_uid;` po radio_plays).

notify pgrst, 'reload schema';

commit;

-- KONTROLA: select (select count(*) from public.biegus_most), (select count(*) from public.game_events);  -- 14, 220 (7.10)
