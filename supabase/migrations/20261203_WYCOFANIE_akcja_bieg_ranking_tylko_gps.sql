-- WYCOFANIE 20261203_akcja_bieg_ranking_tylko_gps.sql: odwrotna zamiana kotwic na definicjach z bazy (funkcje wracają 1:1), potem funkcja reguły.
-- Po wycofaniu ranking znów bierze każdy wynik z czasem (także z wpisu ręcznego), a lista i „moje zapisy” nie mają kluczy 'reczny' i 'wynik_reczny'
-- (front z dopiskiem „wynik ręczny” działa dalej: brak klucza = brak dopisku). Dane zapisów zostają.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and public.akcja_bieg_wynik_z_zegarka(u) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$,
       $k$and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas$k$),
      ('public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny)$k$,
       $k$'dziecko', p.rodzaj = 'dziecko')$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null, 'wynik_reczny', (u.rodzaj = 'ja' and u.ukonczony_at is not null and not public.akcja_bieg_wynik_z_zegarka(u)))$k$,
       $k$'ranking_zgoda', u.ranking_zgoda_at is not null)$k$)
    ) as t(funkcja, nowe, stare)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.nowe, ''))) / length(r.nowe);
    if n <> 1 then raise exception '%: fragment z 20261203 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.nowe, r.stare);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy);

commit;
notify pgrst, 'reload schema';
