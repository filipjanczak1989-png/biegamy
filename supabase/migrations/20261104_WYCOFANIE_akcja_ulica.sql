-- 20261104_WYCOFANIE_akcja_ulica.sql — cofa 20261104_akcja_ulica.sql. ⚠️ KASUJE wpisane cegiełki, kwotę i progi: przed wykonaniem zrób kopię
-- (select * from public.akcja_cegielki; select * from public.akcja_ulica;). akcja_licznik nietknięty, licznik i reszta akcji działają dalej.
-- Front przeżywa brak tych obiektów: ulica rysuje drogę bez cegiełek i bez elementów z progów.
-- Jeśli wdrożono 20261104_akcja_ulica_licznik.sql, NAJPIERW jej wycofanie: licznik woła funkcję, którą tu kasujemy.
begin;
do $$
begin
  if position('akcja_ulica_publiczna' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then
    raise exception 'najpierw 20261104_WYCOFANIE_akcja_ulica_licznik.sql: licznik wciąż woła akcja_ulica_publiczna';
  end if;
end $$;
drop function if exists public.akcja_ulica_publiczna(text);
drop table if exists public.akcja_ulica;
drop table if exists public.akcja_cegielki;
drop function if exists public.akcja_ulica_zmiana();
do $$
begin
  if to_regclass('public.akcja_cegielki') is not null or to_regclass('public.akcja_ulica') is not null
     or to_regprocedure('public.akcja_ulica_publiczna(text)') is not null then
    raise exception 'wycofanie akcja_ulica: coś zostało';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
