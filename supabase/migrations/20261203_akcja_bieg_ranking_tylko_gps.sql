-- BIEG WIRTUALNY, RANKING TYLKO Z ZEGARKA I TYLKO Z TRENINGU NA DYSTANSIE BIEGU (decyzje 16 i 17.11; regulamin 2026-11-v2, § 5 ust. 5 i § 9 ust. 2).
-- 1. ŹRÓDŁO (akcja_bieg_wynik_z_zegarka). Wynik jest „z zegarka”, gdy wskazuje własny trening (wynik_log_id, training_logs.athlete_id = konto), nie był zaliczony ręcznie
--    przez organizatora (zaliczony_przez is null) i ten trening:
--      a) ma training_logs.source = 'intervals' (import z intervals.icu: intervals-sync, intervals-webhook; tam trafia zegarek i aplikacja z GPS), albo
--      b) jest wpisem ręcznym, do którego import dopisał zapis z zegarka (external_source = 'intervals': _shared/kolizja-importu.mjs), I uczestnik sam go wskazał
--         („Wskaż trening”: wynik_wskazany = true). Bez wskazania taki wynik zostaje ręczny (decyzja 17.11).
--    Wszystko inne to wynik ręczny: source 'manual' (formularz na Dziś i w kalendarzu), 'ocr' (formularz wypełniony ze zdjęcia), każde przyszłe źródło (biała lista),
--    trening usunięty po zaliczeniu (wynik_log_id → NULL), zaliczenie w panelu trenera. Wynik ręczny daje ukończenie, dyplom i odznakę jak dotąd;
--    na liście jest bez czasu i miejsca, z kluczem 'reczny': true (dopisek „wynik ręczny”).
-- 2. DŁUGOŚĆ (akcja_bieg_wynik_do_rankingu). Czas i miejsce dostaje tylko wynik z zegarka z treningu nie dłuższego niż dystans biegu + 0,49 km
--    (bieg na 5 km: do 5,49 km włącznie). Dolna granica zaliczenia bez zmian (tolerancja 2 %: akcja_bieg_dystans_zaliczony). Trening dłuższy daje ukończenie;
--    na liście jest bez czasu, bez dopisku. „Moje zapisy” dostają 'wynik_trening_km': prawdziwy dystans treningu na dyplom i do karty (10 km · 48:20, nie 5 km · 48:20).
-- 3. WYBÓR TRENINGU przez automat: przy tym samym zaliczonym dystansie najpierw trening, który wejdzie do rankingu (z zegarka, w zakresie długości), potem jak dotąd najlepsze tempo.
--    Wynik już ustalony zmienia tylko uczestnik („Wskaż inny trening”); lista treningów do wskazania dostaje klucz 'z_zegarka'.
-- Funkcje bierzemy Z BAZY (pg_get_functiondef) i zmieniamy po jednej kotwicy, jak 20261130: reszta zostaje 1:1 z produkcji, create or replace zachowuje uprawnienia.
-- Dzieci bez zmian: nigdy w rankingu, bez dopisku (swój dystans zawsze wpisuje rodzic).
-- Test po skutku: tools/akcja-bieg-ranking-gps-test.sh (przed wdrożeniem AKCJA_BIEG_RANKING_GPS_Z_MIGRACJA=1). Wycofanie: 20261203_WYCOFANIE_akcja_bieg_ranking_tylko_gps.sql.
begin;

alter table public.akcja_bieg_uczestnicy add column wynik_wskazany boolean not null default false;
comment on column public.akcja_bieg_uczestnicy.wynik_wskazany is 'Wynik z treningu wskazanego przez uczestnika („Wskaż trening”), nie z automatu. Wskazany wpis ręczny z dopisanym zapisem z zegarka liczy się do rankingu (decyzja 17.11).';

create function public.akcja_bieg_wynik_z_zegarka(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select u.rodzaj = 'ja' and u.wynik_log_id is not null and u.zaliczony_przez is null
         and exists (select 1 from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id
                        and (l.source = 'intervals' or (u.wynik_wskazany and l.external_source = 'intervals')));
$function$;
revoke all on function public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

create function public.akcja_bieg_wynik_do_rankingu(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select public.akcja_bieg_wynik_z_zegarka(u) and u.wynik_dystans_km is not null
         and exists (select 1 from public.training_logs l where l.id = u.wynik_log_id and l.distance_km <= u.wynik_dystans_km + 0.49);
$function$;
revoke all on function public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$,
       $k$and public.akcja_bieg_wynik_do_rankingu(u) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas$k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'dziecko', p.rodzaj = 'dziecko')$k$,
       $k$'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny)$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null)$k$,
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null, 'wynik_reczny', (u.rodzaj = 'ja' and u.ukonczony_at is not null and not public.akcja_bieg_wynik_z_zegarka(u)), 'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$wynik_dystans_km = l.d, zaliczony_przez = null,$k$,
       $k$wynik_dystans_km = l.d, zaliczony_przez = null, wynik_wskazany = (p_log_id is not null),$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc,$k$,
       $k$order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc, (x.source is not distinct from 'intervals' and x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc,$k$),
      ('public.akcja_bieg_treningi_z_okna(text)',
       $k$'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km))$k$,
       $k$'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), 'z_zegarka', (x.source is not distinct from 'intervals' or x.external_source is not distinct from 'intervals'))$k$)
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
