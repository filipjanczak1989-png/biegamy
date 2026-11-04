-- 20261105_akcja_sciezka.sql — ŚCIEŻKA FABIANKA, pełna próba od zera na akcji proba (Filip 4.11). Prawdziwa akcja nietknięta: każda funkcja działa wyłącznie na wierszu slug = 'proba' i tylko dla trenera (auth_is_coach, tabela coaches).
--   akcje.proba_sym_km          — symulowane km próby. CHECK: tylko akcja testowa. Licznik bierze je zamiast km z treningów; null = prawdziwe km konta testowego.
--   akcja_sciezka_stan()        — stan próby dla panelu ścieżki. Przy okazji: odmowa = to konto nie widzi panelu.
--   akcja_proba_od_zera()       — stan sprzed naciśnięcia: start, push, dotarcie i koniec puste, licznik 0, ulica i mur puste, firmy próby ukryte, ślad, deklaracje i odznaki akcji konta testowego skasowane.
--   akcja_proba_symuluj(km, %)  — suwak: km i procent zbiórki próby.
--   akcja_proba_firmy(dodaj)    — 3 firmy testowe próby albo usunięcie wszystkich firm próby. Oddaje pliki logo do skasowania.
--   Limit dobowy km: konta wyprawy dostają własny, wyższy limit (akcje.cap_km_doba_wyprawa). Reszta bez zmian (cap_km_doba = 100).
-- WDRAŻAĆ PO 20261105_akcja_firmy_zgloszenia.sql. Test: tools/akcja-sciezka-test.sh. Wycofanie: 20261105_WYCOFANIE_akcja_sciezka.sql.
begin;

alter table public.akcje add column proba_sym_km numeric(10,2) constraint akcje_sym_tylko_proba check (proba_sym_km is null or (testowa and proba_sym_km >= 0));
comment on column public.akcje.proba_sym_km is 'Symulowane km akcji testowej (Ścieżka Fabianka). CHECK: tylko testowa. Zmienia wyłącznie akcja_proba_symuluj i akcja_proba_od_zera.';
alter table public.akcje add column cap_km_doba_wyprawa integer not null default 300 check (cap_km_doba_wyprawa > 0);
comment on column public.akcje.cap_km_doba_wyprawa is 'Limit km na dobę dla kont z wyprawa_athlete_ids. Pozostali: cap_km_doba.';

-- Licznik: symulacja tylko dla akcji testowej. Reszta odpowiedzi bez zmian.
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_stare text := 'v_suma := public.akcja_km_okna(a.id, a.start, v_dzis);';
  j_przed jsonb; j_po jsonb;
begin
  if (select count(*) from regexp_matches(v_def, 'v_suma := public\.akcja_km_okna\(a\.id, a\.start, v_dzis\);', 'g')) <> 1 then raise exception 'akcja_sciezka: licznik inny, niż oczekiwany'; end if;
  j_przed := public.akcja_licznik('dla-fabianka');
  execute replace(v_def, v_stare, 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, public.akcja_km_okna(a.id, a.start, v_dzis));');
  j_po := public.akcja_licznik('dla-fabianka');
  if j_po is distinct from j_przed then raise exception 'akcja_sciezka: odpowiedź licznika prawdziwej akcji się zmieniła'; end if;
end $$;

-- Limit dobowy: konta wyprawy biegną więcej niż 100 km na dobę razem z pauzami i zegarkiem na dwa dni. Tylko one.
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_km_okna(uuid, date, date, uuid[])'::regprocedure);
  v_stare text := 'least(dz.km, a.cap_km_doba)';
begin
  if (select count(*) from regexp_matches(v_def, 'least\(dz\.km, a\.cap_km_doba\)', 'g')) <> 1 then raise exception 'akcja_sciezka: akcja_km_okna inna, niż oczekiwana'; end if;
  execute replace(v_def, v_stare, 'least(dz.km, case when dz.athlete_id = any(coalesce(a.wyprawa_athlete_ids, ''{}''::uuid[])) then a.cap_km_doba_wyprawa else a.cap_km_doba end)');
end $$;

create function public.akcja_sciezka_stan()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare a public.akcje; u public.akcja_ulica;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_sciezka_stan: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa;
  if not found then raise exception 'akcja_sciezka_stan: brak akcji próbnej' using errcode = 'P0002'; end if;
  select * into u from public.akcja_ulica where akcja_slug = 'proba';
  return jsonb_build_object('wystartowala', a.wystartowala_at is not null, 'wystartowala_at', a.wystartowala_at, 'dotarla', a.wyprawa_dotarla_at is not null, 'sym_km', a.proba_sym_km,
    'kwota_proc', case when u.cel_zl > 0 then round(coalesce(u.kwota_zl, 0) / u.cel_zl * 100) end,
    'firmy', (select count(*) from public.akcja_firmy f where f.akcja_slug = 'proba' and not f.ukryta),
    'firmy_ukryte', (select count(*) from public.akcja_firmy f where f.akcja_slug = 'proba' and f.ukryta),
    'zgloszenia_nowe', (select count(*) from public.akcja_firmy_zgloszenia z where z.status = 'nowe'),
    'formularz', a.firmy_zgloszenia);
end $$;

create function public.akcja_proba_od_zera()
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare a public.akcje;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_od_zera: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa for update;
  if not found then raise exception 'akcja_proba_od_zera: brak akcji próbnej' using errcode = 'P0002'; end if;
  update public.akcje set wystartowala_at = null, push_start_at = null, push_zamkniecie_at = null, wyprawa_dotarla_at = null, koniec = null, proba_sym_km = 0 where id = a.id;
  delete from public.akcja_cegielki where akcja_slug = 'proba';
  delete from public.akcja_ulica where akcja_slug = 'proba';
  update public.akcja_firmy set ukryta = true where akcja_slug = 'proba';
  delete from public.akcja_wyprawa_slad where akcja_id = a.id;
  delete from public.akcja_sponsorzy where akcja_id = a.id;
  delete from public.achievements where athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])) and badge_id like 'akcja-%';
  return public.akcja_sciezka_stan();
end $$;

create function public.akcja_proba_symuluj(p_km numeric, p_proc integer)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare CEL_ZL constant numeric := 100000; a public.akcje;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_symuluj: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa for update;
  if not found then raise exception 'akcja_proba_symuluj: brak akcji próbnej' using errcode = 'P0002'; end if;
  if p_km is not null and (p_km < 0 or p_km > a.cel_km) then raise exception 'akcja_proba_symuluj: km poza zakresem' using errcode = '22023'; end if;
  if p_proc is not null and (p_proc < 0 or p_proc > 100) then raise exception 'akcja_proba_symuluj: procent poza zakresem' using errcode = '22023'; end if;
  update public.akcje set proba_sym_km = p_km where id = a.id;
  if p_proc is not null then
    insert into public.akcja_ulica (akcja_slug, kwota_zl, cel_zl) values ('proba', CEL_ZL * p_proc / 100, CEL_ZL)
    on conflict (akcja_slug) do update set kwota_zl = excluded.kwota_zl, cel_zl = excluded.cel_zl;
  end if;
  return public.akcja_sciezka_stan();
end $$;

-- Firmy testowe tylko na akcji proba: slug wpisany na stałe, parametru nie ma. Licznik prawdziwej akcji czyta wyłącznie swoje wiersze.
create function public.akcja_proba_firmy(p_dodaj boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_logo text; v_pliki jsonb;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_firmy: tylko trener' using errcode = '42501'; end if;
  if p_dodaj then
    delete from public.akcja_firmy where akcja_slug = 'proba' and nazwa in ('Partner Próbny', 'Wieżowiec Próbny', 'Domek Próbny');
    select f.logo_url into v_logo from public.akcja_firmy f where f.logo_url is not null order by f.dodano limit 1;
    insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values
      ('proba', 'Partner Próbny', 'https://biegamy.run/', v_logo, 'wiezowiec', 'rzeczowe', false, true),
      ('proba', 'Wieżowiec Próbny', 'https://biegamy.run/', null, 'wiezowiec', 'wplata', true, true),
      ('proba', 'Domek Próbny', 'https://biegamy.run/', v_logo, 'domek', 'wplata', true, true);
    return public.akcja_sciezka_stan();
  end if;
  select coalesce(jsonb_agg(distinct regexp_replace(f.logo_url, '^.*/akcja-firmy-logo/', '')), '[]'::jsonb) into v_pliki
    from public.akcja_firmy f
   where f.akcja_slug = 'proba' and f.logo_url is not null
     and not exists (select 1 from public.akcja_firmy i where i.akcja_slug <> 'proba' and i.logo_url = f.logo_url);
  delete from public.akcja_firmy where akcja_slug = 'proba';
  return public.akcja_sciezka_stan() || jsonb_build_object('pliki', v_pliki);
end $$;

revoke all on function public.akcja_sciezka_stan() from public, anon;
revoke all on function public.akcja_proba_od_zera() from public, anon;
revoke all on function public.akcja_proba_symuluj(numeric, integer) from public, anon;
revoke all on function public.akcja_proba_firmy(boolean) from public, anon;
grant execute on function public.akcja_sciezka_stan() to authenticated;
grant execute on function public.akcja_proba_od_zera() to authenticated;
grant execute on function public.akcja_proba_symuluj(numeric, integer) to authenticated;
grant execute on function public.akcja_proba_firmy(boolean) to authenticated;
comment on function public.akcja_sciezka_stan() is 'Stan próby dla panelu Ścieżki Fabianka. Tylko trener.';
comment on function public.akcja_proba_od_zera() is 'Próba do stanu sprzed naciśnięcia. Tylko trener, tylko slug proba.';
comment on function public.akcja_proba_symuluj(numeric, integer) is 'Suwak km i procentu zbiórki próby. Tylko trener, tylko slug proba.';
comment on function public.akcja_proba_firmy(boolean) is 'Firmy testowe próby: dodaj 3 albo usuń wszystkie. Tylko trener, tylko slug proba.';

do $$
declare f text;
begin
  foreach f in array array['public.akcja_sciezka_stan()', 'public.akcja_proba_od_zera()', 'public.akcja_proba_symuluj(numeric, integer)', 'public.akcja_proba_firmy(boolean)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'akcja_sciezka: anon woła %', f; end if;
  end loop;
  if exists (select 1 from public.akcje where proba_sym_km is not null) then raise exception 'akcja_sciezka: symulacja ma być pusta'; end if;
  if has_column_privilege('authenticated', 'public.akcje', 'proba_sym_km', 'UPDATE') or has_column_privilege('anon', 'public.akcje', 'proba_sym_km', 'SELECT') then raise exception 'akcja_sciezka: klient ma dostęp do kolumny'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
