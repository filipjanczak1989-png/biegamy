-- BIEG WIRTUALNY: czas na dystans biegu „z tempa” (decyzja Filipa 18.11, regulamin v5). NIE wykonywać przed 20261213.
-- Bieg jest na 5 km, więc lista, ranking i dyplom pokazują CZAS NA 5 KM (ogólnie: na dystans biegu d):
--   trening d … d + 0,49 km      → czas treningu (jak dotąd);
--   trening d + 0,49 … 2d + 0,49 → czas z tempa: round(czas × d / km), w rankingu Z MIEJSCEM, dopisek „z tempa”;
--   trening dłuższy niż 2d + 0,49 → ukończenie i dyplom bez czasu, poza rankingiem; flaga „do sprawdzenia” w panelu.
-- Te same warunki co ranking: zgoda, pełnoletni, tempo spoza 3:00–36:00/km dopiero po zatwierdzeniu. Dyplom (akcja_bieg_moi): czas na dystans bez względu na zgodę.
-- Automat (akcja_bieg_wynik_z_treningu bez wskazania): najlepszy czas na dystans spośród treningów d … 2d + 0,49 km, także z tempa; wskazanie zawodnika ma pierwszeństwo.
-- TYLKO przy biegu z regulaminem v5 lub nowszym (akcja_bieg_wersja_od): na v1–v4 wszystko jak dotąd, także czas bez miejsca z 20261213, który od v5 znika
--   (akcja_bieg_czas_bez_miejsca tylko dla v4). Kolejność wdrożenia nie wypuści czasu z tempa przed v5 w bazie (dane: noc-1311\prawdziwy\34g-regulamin-v5.sql).
-- Panel organizatora bez zmian: prawdziwy dystans, czas, tempo i źródło (20261213).
-- Test po skutku: tools/akcja-bieg-czas-z-tempa-test.sh (przed wdrożeniem AKCJA_BIEG_TEMPO_Z_MIGRACJA=1). Wycofanie: 20261214_WYCOFANIE_akcja_bieg_czas_z_tempa.sql.
begin;

create function public.akcja_bieg_wersja_od(p_wersja text, p_min integer)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(substring(p_wersja from '^2026-11-v([0-9]{1,4})$')::integer >= p_min, false);
$function$;

create function public.akcja_bieg_czas_na_dystans(p_s integer, p_km numeric, p_d integer, p_z_tempa boolean)
 returns integer
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when p_s is null or p_km is null or p_km <= 0 or p_d is null or p_d <= 0 then null
              when p_km <= p_d + 0.49 then p_s
              when p_z_tempa and p_km <= 2 * p_d + 0.49 then round(p_s * p_d / p_km)::integer end;
$function$;

create function public.akcja_bieg_gorna_rankingu(u public.akcja_bieg_uczestnicy)
 returns numeric
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select u.wynik_dystans_km + 0.49 + u.wynik_dystans_km * public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5)::integer;
$function$;

create function public.akcja_bieg_czas_biegu(u public.akcja_bieg_uczestnicy, b public.akcja_biegi)
 returns integer
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.rodzaj = 'ja' and u.wycofany_at is null and u.ukonczony_at is not null and u.wynik_s is not null
                   and u.wynik_dystans_km > 0 and u.wynik_dystans_km = any(b.dystanse_km)
              then public.akcja_bieg_czas_na_dystans(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)) end;
$function$;

create function public.akcja_bieg_z_tempa(u public.akcja_bieg_uczestnicy, b public.akcja_biegi)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(public.akcja_bieg_czas_biegu(u, b) is not null and public.akcja_bieg_km_wyniku(u) > u.wynik_dystans_km + 0.49, false);
$function$;

revoke all on function public.akcja_bieg_wersja_od(text, integer) from public, anon, authenticated;
revoke all on function public.akcja_bieg_czas_na_dystans(integer, numeric, integer, boolean) from public, anon, authenticated;
revoke all on function public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy) from public, anon, authenticated;
revoke all on function public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi) from public, anon, authenticated;
revoke all on function public.akcja_bieg_z_tempa(public.akcja_bieg_uczestnicy, public.akcja_biegi) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$then u.wynik_s end;$k$,
       $k$then public.akcja_bieg_czas_biegu(u, b) end;$k$),
      (2, 'public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49$k$,
       $k$public.akcja_bieg_km_wyniku(u) <= public.akcja_bieg_gorna_rankingu(u)$k$),
      (3, 'public.akcja_bieg_czeka_na_weryfikacje(public.akcja_bieg_uczestnicy)',
       $k$public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49$k$,
       $k$public.akcja_bieg_km_wyniku(u) <= public.akcja_bieg_gorna_rankingu(u)$k$),
      (4, 'public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and b.regulamin_wersja is not null and b.regulamin_wersja not in ('2026-11-v1', '2026-11-v2', '2026-11-v3')$k$,
       $k$and public.akcja_bieg_wersja_od(b.regulamin_wersja, 4) and not public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)$k$),
      (5, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$from (select public.akcja_bieg_km_wyniku(u) as km) k;$k$,
       $k$from (select public.akcja_bieg_km_wyniku(u) as km, public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5) as v5) k;$k$),
      (6, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'ja' and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,$k$,
       $k$case when u.rodzaj = 'ja' and k.v5 and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) + 0.49 then 'trening dłuższy niż ' || replace(to_char(2 * coalesce(u.wynik_dystans_km, u.dystans_km) + 0.49, 'FM99990.00'), '.', ',') || ' km: bez czasu w rankingu' when u.rodzaj = 'ja' and not k.v5 and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,$k$),
      (7, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, $k$,
       $k$public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_z_tempa(u, b) as z_tempa, $k$),
      (8, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) when$k$,
       $k$jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) || case when p.z_tempa then jsonb_build_object('z_tempa', true) else '{}'::jsonb end when$k$),
      (9, 'public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), $k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'czas_biegu_s', public.akcja_bieg_czas_biegu(u, b), 'z_tempa', public.akcja_bieg_z_tempa(u, b), $k$),
      (10, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc$k$,
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$),
      (11, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$public.akcja_bieg_sekundy(x.duration)::numeric / x.distance_km asc,$k$,
       $k$case when public.akcja_bieg_wersja_od(b.regulamin_wersja, 5) then public.akcja_bieg_czas_na_dystans(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), true) end asc, public.akcja_bieg_sekundy(x.duration)::numeric / x.distance_km asc,$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if exists (select 1 from unnest(array['public.akcja_bieg_wersja_od(text, integer)', 'public.akcja_bieg_czas_na_dystans(integer, numeric, integer, boolean)', 'public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy)',
                                        'public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'public.akcja_bieg_z_tempa(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
                                        'public.akcja_bieg_ukonczyli(text, integer, integer, integer)']) f
              where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'))
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_wynik_ustal(uuid, uuid)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_wynik_ustal(uuid, uuid)', 'execute') then
    raise exception 'akcja_bieg (20261214): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
