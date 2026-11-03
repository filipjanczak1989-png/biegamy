-- 20261105_okienko_pamiec.sql — Okienko 2.0 ROZMOWA I PAMIĘĆ, etap R1 (OK Filipa 3.11; docs/projekt-okienko-rozmowa-pamiec-2026-11-03.md):
--   * okienko_v2_rozmowa + pytanie (≤ 300) + odpowiedz (≤ 400): pamięć krótka dostaje TREŚĆ (dotąd tylko intencja i sloty) — tabela
--     bez zmian poza tym: service-only, RLS zero, cron okienko-v2-rozmowa-1d kasuje > 1 dzień, cascade z athletes;
--   * okienko_pamiec — pamięć DŁUGA: fakt (≤ 200) + kategoria (cel|preferencje|sprzet|rytm|zdrowie|inne), tylko WŁAŚCICIEL (RLS),
--     trener NIE; z przeglądarki właściciel może dodać/zmienić/usunąć tylko fakty ręczne (zrodlo='profil') i NIE zdrowotne;
--     zapisy z okienka (po potwierdzeniu „Tak”) i zdrowie (osobna zgoda) wyłącznie EF kluczem service; limit 30 faktów/osobę (trigger).
-- Wycofanie: 20261105_WYCOFANIE_okienko_pamiec.sql. Test: OP_Z_MIGRACJA=1 bash tools/okienko-pamiec-test.sh (10 asercji, transakcja wycofana).
begin;

alter table public.okienko_v2_rozmowa
  add column if not exists pytanie   text check (pytanie is null or char_length(pytanie) <= 300),
  add column if not exists odpowiedz text check (odpowiedz is null or char_length(odpowiedz) <= 400);
comment on column public.okienko_v2_rozmowa.pytanie is 'treść pytania tej tury (R1, 3.11) — dopytania „a dlaczego?” mają do czego sięgnąć; kasowane po 1 dniu';
comment on column public.okienko_v2_rozmowa.odpowiedz is 'skrót odpowiedzi (zdania bez kart i źródeł) — kontekst trybu ROZMOWA; kasowane po 1 dniu';

create table if not exists public.okienko_pamiec (
  id            bigint generated always as identity primary key,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  fakt          text not null check (char_length(fakt) between 2 and 200),
  kategoria     text not null check (kategoria in ('cel', 'preferencje', 'sprzet', 'rytm', 'zdrowie', 'inne')),
  utworzono     timestamptz not null default now(),
  potwierdzono  timestamptz,
  zrodlo        text not null default 'profil' check (zrodlo in ('okienko', 'okienko-zdrowie', 'profil'))
);
comment on table public.okienko_pamiec is 'Pamięć długa Okienka: fakty o zawodniku zapisane po jego potwierdzeniu (okienko) albo ręcznie (Profil → „Co Okienko o mnie wie”). Czyta/zmienia TYLKO właściciel; trener nie. Zdrowie tylko z osobną zgodą (EF).';
create index if not exists okienko_pamiec_athlete on public.okienko_pamiec (athlete_id);

alter table public.okienko_pamiec enable row level security;
revoke all on public.okienko_pamiec from public, anon, authenticated;
grant select, insert, update, delete on public.okienko_pamiec to authenticated;

drop policy if exists okienko_pamiec_wlasciciel_czyta on public.okienko_pamiec;
create policy okienko_pamiec_wlasciciel_czyta on public.okienko_pamiec for select to authenticated
  using (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
drop policy if exists okienko_pamiec_wlasciciel_dodaje on public.okienko_pamiec;
create policy okienko_pamiec_wlasciciel_dodaje on public.okienko_pamiec for insert to authenticated
  with check (zrodlo = 'profil' and kategoria <> 'zdrowie'
    and exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
drop policy if exists okienko_pamiec_wlasciciel_zmienia on public.okienko_pamiec;
create policy okienko_pamiec_wlasciciel_zmienia on public.okienko_pamiec for update to authenticated
  using (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()))
  with check (kategoria <> 'zdrowie' and exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
drop policy if exists okienko_pamiec_wlasciciel_usuwa on public.okienko_pamiec;
create policy okienko_pamiec_wlasciciel_usuwa on public.okienko_pamiec for delete to authenticated
  using (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

create or replace function public.okienko_pamiec_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.okienko_pamiec where athlete_id = new.athlete_id) >= 30 then
    raise exception 'okienko_pamiec: limit 30 faktów — usuń coś w Profilu („Co Okienko o mnie wie”)' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.okienko_pamiec_limit() from public, anon, authenticated;
drop trigger if exists okienko_pamiec_limit_trg on public.okienko_pamiec;
create trigger okienko_pamiec_limit_trg before insert on public.okienko_pamiec for each row execute function public.okienko_pamiec_limit();

-- ── asercje ──
do $$
begin
  if has_table_privilege('anon', 'public.okienko_pamiec', 'SELECT, INSERT, UPDATE, DELETE') then raise exception 'okienko_pamiec: anon ma grant — nie wdrażamy'; end if;
  if has_table_privilege('authenticated', 'public.okienko_v2_rozmowa', 'SELECT') then raise exception 'okienko_v2_rozmowa: authenticated czyta — treść rozmowy ma czytać tylko EF'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'okienko_pamiec') <> 4 then raise exception 'okienko_pamiec: ma być dokładnie 4 polityki właściciela'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'okienko_v2_rozmowa' and column_name = 'odpowiedz') then raise exception 'okienko_v2_rozmowa.odpowiedz nie powstała'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
