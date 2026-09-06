-- WYCOFANIE 20260906_kasacja_community_stats.sql
--
-- ⚠️ ODTWARZA STAN ZASTANY, NIE „podobna tabele". Ponizsze jest zrzucone
--    z produkcji 6.09.2026 BEZPOSREDNIO PRZED kasacja — lacznie z RLS
--    i grantami, bo bez nich rollback dalby tabele w INNYM stanie dostepu
--    niz ta, ktora usunelismy. To jest ta sama zasada co przy migawce
--    `supabase/schema/rls/`: sam ksztalt tabeli to nie caly jej stan.
--
-- ⚠️ CZEGO NIE ODTWORZY: WIERSZY. Tabela byla pusta (0 wierszy zmierzone przed
--    kasacja), wiec nie ma czego przywracac — ale gdyby kiedys przy podobnej
--    operacji bylo inaczej, kopie robi sie PRZED, nie z rollbacku.
--
-- ⚠️ GRANTU DLA `anon` SWIADOMIE NIE ODTWARZAMY. Cofnelismy go osobno
--    (`20260906_szostka_bez_anon.sql`) jako „zaladowana bron" — pelne DML dla
--    niezalogowanego, zamkniete wylacznie brakiem polityki. Wycofanie KASACJI
--    nie ma prawa cofac tamtej decyzji; gdyby ktos chcial oba, musi wykonac
--    oba rollbacki swiadomie.
--    (Stan przed kasacja mial juz anona zdjetego, wiec to ODTWORZENIE ZASTANEGO,
--     nie samowolne zawezenie.)

create table if not exists public.community_stats (
  klucz         text                     not null,
  wartosc       numeric                  not null,
  obliczone_at  timestamp with time zone not null default now(),
  constraint community_stats_pkey primary key (klucz)
);

-- RLS bylo WLACZONE, ale bez ANI JEDNEJ polityki — czyli tabela byla zamknieta
-- dla wszystkich poza `service_role`. Odtwarzamy dokladnie to.
alter table public.community_stats enable row level security;

grant delete, insert, references, select, trigger, truncate, update
  on public.community_stats to authenticated;
grant delete, insert, references, select, trigger, truncate, update
  on public.community_stats to service_role;

-- ⚠️ TA LINIA NIE JEST NADMIAROWA — BEZ NIEJ ROLLBACK ODDAJE TABELE ANONOWI.
--    Supabase ma `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`,   bramka:przyklad
--    ⚠️ ZNACZNIK POWYZEJ JEST TU NA MIEJSCU, w odroznieniu od migracji z tego
--       samego dnia, gdzie go ODMOWILEM. Tam `revoke` byl PRAWDZIWA instrukcja
--       i nazwanie jej „przykladem" zamienialoby marker w furtke. Tutaj linia
--       CYTUJE domyslne uprawnienie Supabase w wyjasnieniu — niczego nie nadaje.
--       To jest dokladnie to, po co ten znacznik powstal (LEKCJE #19).
--    wiec KAZDY nowy `create table` w schemacie `public` dostaje pelne DML dla
--    niezalogowanego SAM Z SIEBIE — nie trzeba niczego nadawac.
--    ZMIERZONE 6.09.2026 proba okrezna (drop + ten rollback w jednej transakcji,
--    cofnietej): odtworzona tabela miala granty dla `anon, authenticated,
--    postgres, service_role`, mimo ze ten plik anonowi nic nie nadaje.
--    Bez tego `revoke` wycofanie kasacji CICHO cofaloby tez
--    `20260906_szostka_bez_anon.sql` — czyli rollback jednej decyzji
--    odwracalby drugą, o ktorej autor rollbacku nawet nie wiedzial.
revoke all on public.community_stats from anon;

-- KONTROLA PO WYCOFANIU — oczekiwane: rls=true, force=false, 0 polityk,
-- granty dla authenticated i service_role, BRAK anona.
-- select c.relrowsecurity, c.relforcerowsecurity,
--        (select count(*) from pg_policies where tablename='community_stats')
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='community_stats';
