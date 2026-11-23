-- 20261225_WYCOFANIE_dzis_przelacznik.sql — wycofanie przełącznika nowego Dziś (E0). Front bez funkcji dzis_wersja() dostaje błąd RPC
-- i zostaje na starym ekranie (blok DZIS-E0 1 w zawodnik.html: błąd RPC niczego nie włącza). Lista kont znika razem z tabelą.
-- Na co dzień wyłączenie NIE wymaga tego pliku: wystarczy update nowe_wlaczone = 'false' (nagłówek migracji 20261225).

begin;

do $$ begin
  if to_regclass('public.dzis_ustawienia') is null and to_regprocedure('public.dzis_wersja()') is null then
    raise exception '20261225 WYCOFANIE: przełącznik Dziś nie wszedł albo jest już wycofany';
  end if;
end $$;

drop function if exists public.dzis_wersja();
drop table if exists public.dzis_nowe_konta;
drop table if exists public.dzis_ustawienia;

do $$ begin
  if to_regclass('public.dzis_ustawienia') is not null or to_regclass('public.dzis_nowe_konta') is not null or to_regprocedure('public.dzis_wersja()') is not null then
    raise exception '20261225 WYCOFANIE: coś zostało';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
