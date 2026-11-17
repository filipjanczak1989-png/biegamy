-- WYCOFANIE 20261203_akcja_bieg_ranking_tylko_gps.sql: odwrotna zamiana kotwic na definicjach z bazy (pięć funkcji wraca 1:1), potem dwie funkcje reguły i kolumna wynik_wskazany.
-- Po wycofaniu ranking znów bierze każdy wynik z czasem (także z wpisu ręcznego i z dłuższego treningu), automat wybiera trening po samym tempie, a lista,
-- „moje zapisy” i treningi do wskazania nie mają kluczy 'reczny', 'wynik_reczny', 'wynik_trening_km' i 'z_zegarka' (front działa dalej: brak klucza = brak dopisku,
-- dyplom pokazuje zaliczony dystans). Dane zapisów zostają; przepada tylko informacja, które wyniki uczestnik wskazał sam.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and public.akcja_bieg_wynik_do_rankingu(u) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$,
       $k$and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny)$k$,
       $k$'dziecko', p.rodzaj = 'dziecko')$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null, 'wynik_reczny', (u.rodzaj = 'ja' and u.ukonczony_at is not null and not public.akcja_bieg_wynik_z_zegarka(u)), 'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$,
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null)$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$wynik_dystans_km = l.d, zaliczony_przez = null, wynik_wskazany = (p_log_id is not null),$k$,
       $k$wynik_dystans_km = l.d, zaliczony_przez = null,$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc, (x.source is not distinct from 'intervals' and x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc,$k$,
       $k$order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc,$k$),
      ('public.akcja_bieg_treningi_z_okna(text)',
       $k$'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), 'z_zegarka', (x.source is not distinct from 'intervals' or x.external_source is not distinct from 'intervals'))$k$,
       $k$'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km))$k$)
    ) as t(funkcja, nowe, stare)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.nowe, ''))) / length(r.nowe);
    if n <> 1 then raise exception '%: fragment z 20261203 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.nowe, r.stare);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy);
alter table public.akcja_bieg_uczestnicy drop column wynik_wskazany;

commit;
notify pgrst, 'reload schema';
