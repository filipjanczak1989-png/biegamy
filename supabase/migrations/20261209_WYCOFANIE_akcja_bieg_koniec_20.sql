-- WYCOFANIE 20261209_akcja_bieg_koniec_20.sql: funkcje wracają 1:1 (odwrotne kotwice), kolumny koniec_at i zalicz_do znikają.
-- UWAGA: po 34e-koniec-20.sql bieg-mikolajki ma wynik_do = 6.12. Bez koniec_at bieg kończy się wtedy o północy 6.12 (fazą dniową), a organizator zalicza do 13.12.
--   Żeby wrócić do 8.12 i v2: najpierw wycofanie z nagłówka 34e (wynik_do, regulamin_wersja), potem ten plik.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_faza(public.akcja_biegi, date)',
       $k$when b.status = 'zakonczony' or p_dzis > b.wynik_do or (b.koniec_at is not null and (p_dzis > (b.koniec_at at time zone 'Europe/Warsaw')::date or (p_dzis = (now() at time zone 'Europe/Warsaw')::date and now() >= b.koniec_at))) then 'zakonczony'$k$,
       $k$when b.status = 'zakonczony' or p_dzis > b.wynik_do then 'zakonczony'$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do and (b.koniec_at is null or (x.logged_at < b.koniec_at and (now() < b.koniec_at or x.created_at < b.koniec_at or x.source is not distinct from 'intervals')))$k$,
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do$k$),
      ('public.akcja_bieg_treningi_z_okna(text)',
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do and (b.koniec_at is null or x.logged_at < b.koniec_at)), '[]'::jsonb);$k$,
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do), '[]'::jsonb);$k$),
      ('public.akcja_bieg_automat()',
       $k$(public.akcja_bieg_faza(b) in ('trwa', 'wyniki') or (b.koniec_at is not null and now() >= b.koniec_at and now() < b.koniec_at + interval '2 hours'))$k$,
       $k$public.akcja_bieg_faza(b) in ('trwa', 'wyniki')$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$),
      ('public.akcja_bieg_usun_wynik(uuid, text)',
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$),
      ('public.akcja_bieg_weryfikuj(uuid, text)',
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$),
      ('public.akcja_bieg_panel(text)',
       $k$'zalicz_do', coalesce(b.zalicz_do, b.wynik_do + 7), 'koniec_at', b.koniec_at,$k$,
       $k$'zalicz_do', b.wynik_do + 7,$k$),
      ('public.akcja_bieg_publiczny(text)',
       $k$'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do, 'koniec_at', b.koniec_at,$k$,
       $k$'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do,$k$),
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$'dni_do_konca', b.dzien_do - v_dzis, 'koniec_godz', to_char(b.koniec_at at time zone 'Europe/Warsaw', 'HH24:MI'),$k$,
       $k$'dni_do_konca', b.dzien_do - v_dzis,$k$)
    ) as t(funkcja, kotwica, nowe)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: fragment z 20261209 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

alter table public.akcja_biegi drop constraint akcja_biegi_zalicz_do;
alter table public.akcja_biegi drop column koniec_at, drop column zalicz_do;

commit;
notify pgrst, 'reload schema';
