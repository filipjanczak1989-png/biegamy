-- BIEG WIRTUALNY: KONIEC BIEGU I WYNIKÓW O GODZINIE (decyzja Filipa 18.11: bieg i wyniki kończą się 6.12.2026 o 20:00 czasu polskiego, bez dopisywania do 8.12;
--   ręczne zaliczanie przez organizatora w panelu zostaje do 15.12). NIE wykonywać przed 20261207.
-- 1. KOLUMNY akcja_biegi: koniec_at = chwila końca biegu i wyników dla uczestników (NULL = jak dotąd, dniami); zalicz_do = ostatni dzień okna organizatora
--    (NULL = wynik_do + 7, jak dotąd).
-- 2. FAZA (akcja_bieg_faza): od koniec_at 'zakonczony'. Przez fazę zamykają się zapis siebie i dzieci, zgoda na e-mail, wynik z treningu na stronie
--    („Wskaż trening”, wynik_ustal) i dystans dziecka. Przy wynik_do = dzien_do faza 'wyniki' nie występuje.
-- 3. TRENINGI: wynik tylko z treningu z logged_at < koniec_at (akcja_bieg_wynik_z_treningu, lista „Wskaż trening”). Po końcu trening utworzony po koniec_at liczy się
--    wyłącznie z importu zegarka (source 'intervals': spóźniona synchronizacja biegu zrobionego przed 20:00); wpis ręczny dodany po końcu się nie liczy.
--    Automat (cron :25) działa jeszcze 2 godziny po koniec_at, potem stop.
-- 4. ORGANIZATOR: zaliczanie, usunięcie wyniku i weryfikacja do coalesce(zalicz_do, wynik_do + 7); panel oddaje to samo i koniec_at.
-- 5. Licznik (akcja_bieg_publiczny) oddaje koniec_at, lista e-maili (akcja_bieg_do_przypomnienia) koniec_godz: strona i e-mail mówią „do 6.12, godz. 20:00”.
-- Dane bieg-mikolajki (wynik_do 6.12, koniec_at, zalicz_do 15.12, regulamin 2026-11-v3) osobnym plikiem: noc-1311\prawdziwy\34e-koniec-20.sql, po tej migracji i pushu frontu.
-- Funkcje bierzemy Z BAZY i zmieniamy po kotwicy (wzór 20261207). Test po skutku: tools/akcja-bieg-koniec-test.sh (przed wdrożeniem AKCJA_BIEG_KONIEC_Z_MIGRACJA=1).
-- Wycofanie: 20261209_WYCOFANIE_akcja_bieg_koniec_20.sql.
begin;

alter table public.akcja_biegi add column koniec_at timestamptz, add column zalicz_do date;
alter table public.akcja_biegi add constraint akcja_biegi_zalicz_do check (zalicz_do is null or zalicz_do between dzien_do and dzien_do + 31);
comment on column public.akcja_biegi.koniec_at is 'Koniec biegu i wyników dla uczestników (np. 2026-12-06 20:00 Europe/Warsaw): od tej chwili faza zakonczony; wynik tylko z treningu przed tą chwilą. NULL = dniami (wynik_do).';
comment on column public.akcja_biegi.zalicz_do is 'Ostatni dzień okna organizatora (zaliczanie, usunięcie wyniku, weryfikacja). NULL = wynik_do + 7.';

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_faza(public.akcja_biegi, date)',
       $k$when b.status = 'zakonczony' or p_dzis > b.wynik_do then 'zakonczony'$k$,
       $k$when b.status = 'zakonczony' or p_dzis > b.wynik_do or (b.koniec_at is not null and (p_dzis > (b.koniec_at at time zone 'Europe/Warsaw')::date or (p_dzis = (now() at time zone 'Europe/Warsaw')::date and now() >= b.koniec_at))) then 'zakonczony'$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do$k$,
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do and (b.koniec_at is null or (x.logged_at < b.koniec_at and (now() < b.koniec_at or x.created_at < b.koniec_at or x.source is not distinct from 'intervals')))$k$),
      ('public.akcja_bieg_treningi_z_okna(text)',
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do), '[]'::jsonb);$k$,
       $k$and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do and (b.koniec_at is null or x.logged_at < b.koniec_at)), '[]'::jsonb);$k$),
      ('public.akcja_bieg_automat()',
       $k$public.akcja_bieg_faza(b) in ('trwa', 'wyniki')$k$,
       $k$(public.akcja_bieg_faza(b) in ('trwa', 'wyniki') or (b.koniec_at is not null and now() >= b.koniec_at and now() < b.koniec_at + interval '2 hours'))$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$),
      ('public.akcja_bieg_usun_wynik(uuid, text)',
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$),
      ('public.akcja_bieg_weryfikuj(uuid, text)',
       $k$(now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then$k$,
       $k$(now() at time zone 'Europe/Warsaw')::date > coalesce(b.zalicz_do, b.wynik_do + 7) then$k$),
      ('public.akcja_bieg_panel(text)',
       $k$'zalicz_do', b.wynik_do + 7,$k$,
       $k$'zalicz_do', coalesce(b.zalicz_do, b.wynik_do + 7), 'koniec_at', b.koniec_at,$k$),
      ('public.akcja_bieg_publiczny(text)',
       $k$'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do,$k$,
       $k$'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do, 'koniec_at', b.koniec_at,$k$),
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$'dni_do_konca', b.dzien_do - v_dzis,$k$,
       $k$'dni_do_konca', b.dzien_do - v_dzis, 'koniec_godz', to_char(b.koniec_at at time zone 'Europe/Warsaw', 'HH24:MI'),$k$)
    ) as t(funkcja, kotwica, nowe)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if has_column_privilege('anon', 'public.akcja_biegi', 'koniec_at', 'SELECT') or has_column_privilege('authenticated', 'public.akcja_biegi', 'koniec_at', 'SELECT')
     or has_column_privilege('anon', 'public.akcja_biegi', 'zalicz_do', 'SELECT') or has_column_privilege('authenticated', 'public.akcja_biegi', 'zalicz_do', 'SELECT') then
    raise exception 'nowe kolumny akcja_biegi widoczne z przeglądarki: nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
