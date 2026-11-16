-- BIEG WIRTUALNY, RANKING TYLKO Z ZEGARKA (decyzja 16.11; regulamin 2026-11-v2, § 5 ust. 5 i § 9 ust. 2).
-- Czas i miejsce na liście „ukończyli” dostaje wyłącznie wynik z treningu zapisanego zegarkiem albo aplikacją z GPS. REGUŁA (jedno miejsce: akcja_bieg_wynik_z_zegarka):
--   wynik wskazuje własny trening (wynik_log_id, training_logs.athlete_id = konto), nie był zaliczony ręcznie przez organizatora (zaliczony_przez is null)
--   i ten trening ma training_logs.source = 'intervals' (import z intervals.icu: intervals-sync, intervals-webhook; tam trafia zegarek i aplikacja z GPS).
--   Wszystko inne to wynik ręczny: source 'manual' (formularz na Dziś i w kalendarzu), 'ocr' (formularz wypełniony ze zdjęcia), każde przyszłe źródło (biała lista, nie czarna),
--   wpis ręczny wzbogacony importem (source zostaje 'manual', dystans i czas wpisał człowiek: _shared/kolizja-importu.mjs), trening usunięty po zaliczeniu (wynik_log_id → NULL),
--   zaliczenie ręczne w panelu trenera. Wynik ręczny daje ukończenie, dyplom i odznakę jak dotąd; na liście jest bez czasu i miejsca, z kluczem 'reczny': true (dopisek „wynik ręczny”).
-- Trzy funkcje bierzemy Z BAZY (pg_get_functiondef) i zmieniamy po jednej kotwicy, jak 20261130: reszta zostaje 1:1 z produkcji, create or replace zachowuje uprawnienia.
--   akcja_bieg_czas_rankingu: dodatkowy warunek;  akcja_bieg_ukonczyli: klucz 'reczny' (dorosły z wynikiem, który nie jest z zegarka);
--   akcja_bieg_moi: klucz 'wynik_reczny' (karta „Twój bieg” mówi, dlaczego nie ma miejsca w rankingu).
-- Dzieci bez zmian: nigdy w rankingu, bez dopisku (swój dystans zawsze wpisuje rodzic).
-- Test po skutku: tools/akcja-bieg-ranking-gps-test.sh (przed wdrożeniem AKCJA_BIEG_RANKING_GPS_Z_MIGRACJA=1). Wycofanie: 20261203_WYCOFANIE_akcja_bieg_ranking_tylko_gps.sql.
begin;

create function public.akcja_bieg_wynik_z_zegarka(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null
         and exists (select 1 from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id and l.source = 'intervals');
$function$;
revoke all on function public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$,
       $k$and public.akcja_bieg_wynik_z_zegarka(u) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas$k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'dziecko', p.rodzaj = 'dziecko')$k$,
       $k$'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny)$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null)$k$,
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null, 'wynik_reczny', (u.rodzaj = 'ja' and u.ukonczony_at is not null and not public.akcja_bieg_wynik_z_zegarka(u)))$k$)
    ) as t(funkcja, kotwica, nowe)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $migracja$;

commit;
notify pgrst, 'reload schema';
