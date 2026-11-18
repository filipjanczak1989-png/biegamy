-- BIEG WIRTUALNY: czas dłuższego treningu na liście „ukończyli” (bez miejsca) i szczegóły wyniku w panelu organizatora (decyzja Filipa 18.11). NIE wykonywać przed 20261212.
-- Odczyt 18.11 20:30 (transakcja tylko do odczytu, wycofana): na bieg-mikolajki ukończyło 2 dorosłych ze zgodą na ranking (nr 1: zegarek 10,01 km, nr 7: wpis ręczny 6 km);
--   obaj bez czasu na liście, bo trening dłuższy niż 5,49 km (§ 5 ust. 5: w rankingu liczy się trening 5–5,49 km).
-- 1. LISTA (akcja_bieg_ukonczyli, po kotwicach): pełnoletni ze zgodą na ranking i treningiem dłuższym niż dystans biegu + 0,49 km dostają 'czas_s' i 'trening_km'
--    (prawdziwy dystans), BEZ 'miejsce'. Miejsca jak dotąd tylko 5,00–5,49 km (akcja_bieg_czas_rankingu bez zmian). Te same warunki co ranking: zgoda, pełnoletni,
--    czas jest, tempo do weryfikacji tylko po zatwierdzeniu (akcja_bieg_czas_bez_miejsca). Bez zgody — bez czasu jak dotąd. Dzieci nigdy.
-- 2. PANEL (akcja_bieg_panel, tylko trener): przy uczestniku 'wynik_s', 'trening_km' (prawdziwy dystans treningu albo zaliczony bez treningu) i 'zrodlo'
--    ('zegarek' | 'wpis ręczny' | 'organizator'); tempo liczy strona. Publicznie nic z tego nie wychodzi.
-- REGULAMIN: v3 (§ 5 ust. 5, § 8 ust. 1) mówił o czasie dłuższego treningu tylko na dyplomie. Decyzja Filipa 18.11: v4 z nowym brzmieniem tych dwóch punktów
--   (js/bieg.mjs REGULAMIN_V4, dane: noc-1311\prawdziwy\34f-regulamin-v4.sql). Czas bez miejsca TYLKO przy biegu z regulaminem v4 lub nowszym:
--   na v1–v3 lista jak dotąd, więc kolejność wdrożenia nie wypuści czasu przed v4 w bazie. Bieg próbny (v2) bez zmian.
-- Test po skutku: tools/akcja-bieg-czas-bez-miejsca-test.sh (przed wdrożeniem AKCJA_BIEG_CZAS_Z_MIGRACJA=1). Wycofanie: 20261213_WYCOFANIE_akcja_bieg_czas_bez_miejsca.sql.
begin;

create function public.akcja_bieg_czas_bez_miejsca(u public.akcja_bieg_uczestnicy, b public.akcja_biegi)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.rodzaj = 'ja' and u.ranking_zgoda_at is not null and u.wycofany_at is null and u.ukonczony_at is not null
                   and u.wynik_s is not null and u.wynik_dystans_km is not null and u.wynik_dystans_km = any(b.dystanse_km)
                   and public.akcja_bieg_km_wyniku(u) > u.wynik_dystans_km + 0.49
                   and coalesce(u.weryfikacja = 'zatwierdzony', not public.akcja_bieg_do_weryfikacji(u))
                   and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)
                   and b.regulamin_wersja is not null and b.regulamin_wersja not in ('2026-11-v1', '2026-11-v2', '2026-11-v3')
              then u.wynik_s end;
$function$;

create function public.akcja_bieg_zrodlo_wyniku(u public.akcja_bieg_uczestnicy)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.rodzaj <> 'ja' or u.ukonczony_at is null then null
              when u.zaliczony_przez is not null then 'organizator'
              when public.akcja_bieg_wynik_z_zegarka(u) then 'zegarek'
              else 'wpis ręczny' end;
$function$;

revoke all on function public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi) from public, anon, authenticated;
revoke all on function public.akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, $k$,
       $k$public.akcja_bieg_czas_rankingu(u, b) as czas, public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_km_wyniku(u) as km_treningu, $k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$|| case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) else '{}'::jsonb end order by p.poz)$k$,
       $k$|| case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) when p.czas_bez_miejsca is not null then jsonb_build_object('czas_s', p.czas_bez_miejsca, 'trening_km', round(p.km_treningu, 2)) else '{}'::jsonb end order by p.poz)$k$),
      (3, 'public.akcja_bieg_panel(text)',
       $k$'weryfikacja', u.weryfikacja) order by u.numer)$k$,
       $k$'weryfikacja', u.weryfikacja, 'wynik_s', case when u.ukonczony_at is not null then u.wynik_s end, 'trening_km', case when u.rodzaj = 'ja' and u.ukonczony_at is not null then round(public.akcja_bieg_km_wyniku(u), 2) end, 'zrodlo', public.akcja_bieg_zrodlo_wyniku(u)) order by u.numer)$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if has_function_privilege('anon', 'public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_panel(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_panel(text)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') then
    raise exception 'akcja_bieg (20261213): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
