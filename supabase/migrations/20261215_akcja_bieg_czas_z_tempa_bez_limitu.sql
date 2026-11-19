-- BIEG WIRTUALNY, REGULAMIN v6 (decyzja Filipa 19.11): górny limit 10,49 km znika. NIE wykonywać przed 20261214 i PRZED pushem frontu, który przyjmuje v6
-- (stary front przy v6 w bazie pokazałby „WKRÓTCE”).
--   trening d … d + 0,49 km  → czas treningu (jak dotąd);
--   trening od d + 0,50 km   → czas na dystans biegu z tempa: round(czas × d / km), w rankingu z miejscem i dopiskiem „z tempa”, ten sam czas na dyplomie;
--   trening dłuższy niż maraton (42,2 km) z czasem → do rankingu dopiero po „Zatwierdź” w panelu (akcja_bieg_do_weryfikacji, jak tempo spoza 3:00–36:00/km),
--     flaga „trening dłuższy niż maraton” (panel: „Do sprawdzenia: trening dłuższy niż maraton”); dyplom z czasem jak dotąd przy weryfikacji.
-- Automat (akcja_bieg_wynik_z_treningu bez wskazania): najlepszy czas na dystans spośród WSZYSTKICH treningów od dystansu biegu; wskazanie zawodnika ma pierwszeństwo.
-- TYLKO przy biegu z regulaminem v6 lub nowszym; v5 i starsze jak dotąd (test 20261214 zostaje zielony).
-- DANE (ten plik, nie osobny plik danych): bieg-mikolajki v5 → v6 (regulamin_od = dziś) i przeliczenie wyników ukończonych dorosłych bez wskazania,
--   bez zaliczenia przez organizatora i bez zatwierdzenia (akcja_bieg_przelicz: jak automat, bez powiadomień). Odczyt 19.11 przed migracją:
--   nr 1 24:32 → 24:26 (automat bierze trening 16 km), nr 2 bez czasu → 24:21 (16 km), nr 7 27:45 bez zmian. Bramki: bieg-mikolajki przy dla-fabianka,
--   otwarty, {5}, przed końcem, wersja v5 albo już v6. Bez bieg-mikolajki (bazy testowe) tylko funkcje.
-- Test po skutku: tools/akcja-bieg-czas-z-tempa-v6-test.sh (przed wdrożeniem AKCJA_BIEG_V6_Z_MIGRACJA=1). Wycofanie: 20261215_WYCOFANIE_akcja_bieg_czas_z_tempa_bez_limitu.sql.
begin;

create function public.akcja_bieg_czas_wersji(p_s integer, p_km numeric, p_d integer, p_wersja text)
 returns integer
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when public.akcja_bieg_wersja_od(p_wersja, 6) and p_s is not null and p_d > 0 and p_km > p_d + 0.49 then round(p_s * p_d / p_km)::integer
              else public.akcja_bieg_czas_na_dystans(p_s, p_km, p_d, public.akcja_bieg_wersja_od(p_wersja, 5)) end;
$function$;

create function public.akcja_bieg_przelicz(p_bieg uuid)
 returns integer
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare r record; v jsonb; n integer := 0;
begin
  for r in select u.id, u.wynik_log_id from public.akcja_bieg_uczestnicy u
            where u.bieg_id = p_bieg and u.rodzaj = 'ja' and u.wycofany_at is null and u.ukonczony_at is not null and u.wynik_usuniety_at is null
              and not coalesce(u.wynik_wskazany, false) and u.zaliczony_przez is null and u.weryfikacja is distinct from 'zatwierdzony'
            order by u.numer loop
    v := public.akcja_bieg_wynik_z_treningu(r.id, null);
    if coalesce((v->>'ok')::boolean, false) and (v->>'log_id')::uuid is distinct from r.wynik_log_id then n := n + 1; end if;
  end loop;
  return n;
end $function$;

revoke all on function public.akcja_bieg_czas_wersji(integer, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.akcja_bieg_przelicz(uuid) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$public.akcja_bieg_czas_na_dystans(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, public.akcja_bieg_wersja_od(b.regulamin_wersja, 5))$k$,
       $k$public.akcja_bieg_czas_wersji(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, b.regulamin_wersja)$k$),
      (2, 'public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy)',
       $k$select u.wynik_dystans_km + 0.49 + u.wynik_dystans_km * public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5)::integer;$k$,
       $k$select case when public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6) then 100000::numeric else u.wynik_dystans_km + 0.49 + u.wynik_dystans_km * public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5)::integer end;$k$),
      (3, 'public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy)',
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160)$k$,
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)))$k$),
      (4, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$ as v5) k;$k$,
       $k$ as v5, public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6) as v6) k;$k$),
      (5, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'ja' and k.v5 and k.km > $k$,
       $k$case when u.rodzaj = 'ja' and k.v6 and k.km > 42.2 then 'trening dłuższy niż maraton' when u.rodzaj = 'ja' and k.v6 then null when u.rodzaj = 'ja' and k.v5 and k.km > $k$),
      (6, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$,
       $k$(public.akcja_bieg_wersja_od(b.regulamin_wersja, 6) or x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$),
      (7, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$public.akcja_bieg_czas_na_dystans(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), true)$k$,
       $k$public.akcja_bieg_czas_wersji(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), b.regulamin_wersja)$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if exists (select 1 from unnest(array['public.akcja_bieg_czas_wersji(integer, numeric, integer, text)', 'public.akcja_bieg_przelicz(uuid)', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)']) f
              where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'))
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute') then
    raise exception 'akcja_bieg (20261215): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

do $dane$
declare b public.akcja_biegi; n integer; v_dzis constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  select * into b from public.akcja_biegi where slug = 'bieg-mikolajki';
  if not found then raise notice '20261215: brak bieg-mikolajki, tylko funkcje'; return; end if;
  if b.akcja_slug <> 'dla-fabianka' or b.status <> 'otwarty' or b.dystanse_km is distinct from '{5}'::integer[] then
    raise exception '20261215: bieg-mikolajki akcja % / status % / dystanse % inne niż oczekiwane, nic nie zmieniam', b.akcja_slug, b.status, b.dystanse_km; end if;
  if b.koniec_at is null or now() >= b.koniec_at then raise exception '20261215: bieg-mikolajki po końcu (albo bez koniec_at), nic nie zmieniam'; end if;
  if b.regulamin_wersja not in ('2026-11-v5', '2026-11-v6') then raise exception '20261215: bieg-mikolajki na wersji %, oczekiwano v5 (albo już v6), nic nie zmieniam', b.regulamin_wersja; end if;
  if b.regulamin_wersja = '2026-11-v5' then
    update public.akcja_biegi set regulamin_wersja = '2026-11-v6', regulamin_od = v_dzis where id = b.id and regulamin_wersja = '2026-11-v5';
    get diagnostics n = row_count;
    if n <> 1 then raise exception '20261215: zmieniono % wierszy biegu zamiast 1', n; end if;
  end if;
  n := public.akcja_bieg_przelicz(b.id);
  raise notice '20261215: bieg-mikolajki na 2026-11-v6 (od %), przeliczono: % zmian treningu', v_dzis, n;
end $dane$;

commit;
notify pgrst, 'reload schema';
