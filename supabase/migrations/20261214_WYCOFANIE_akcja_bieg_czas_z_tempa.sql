-- WYCOFANIE 20261214_akcja_bieg_czas_z_tempa.sql: kotwice z powrotem (odwrotna kolejność), potem nowe funkcje usunięte. Po nim lista, ranking, dyplom i automat jak po 20261213.
-- Wycofanie danych (v5 → v4) osobno: na końcu 34g-regulamin-v5.sql. Bez v5 w bazie czas z tempa i tak nie działa.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$case when public.akcja_bieg_wersja_od(b.regulamin_wersja, 5) then public.akcja_bieg_czas_na_dystans(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), true) end asc, public.akcja_bieg_sekundy(x.duration)::numeric / x.distance_km asc,$k$,
       $k$public.akcja_bieg_sekundy(x.duration)::numeric / x.distance_km asc,$k$),
      (2, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$,
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc$k$),
      (3, 'public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'czas_biegu_s', public.akcja_bieg_czas_biegu(u, b), 'z_tempa', public.akcja_bieg_z_tempa(u, b), $k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), $k$),
      (4, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) || case when p.z_tempa then jsonb_build_object('z_tempa', true) else '{}'::jsonb end when$k$,
       $k$jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) when$k$),
      (5, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_z_tempa(u, b) as z_tempa, $k$,
       $k$public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, $k$),
      (6, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'ja' and k.v5 and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) + 0.49 then 'trening dłuższy niż ' || replace(to_char(2 * coalesce(u.wynik_dystans_km, u.dystans_km) + 0.49, 'FM99990.00'), '.', ',') || ' km: bez czasu w rankingu' when u.rodzaj = 'ja' and not k.v5 and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,$k$,
       $k$case when u.rodzaj = 'ja' and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,$k$),
      (7, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$from (select public.akcja_bieg_km_wyniku(u) as km, public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5) as v5) k;$k$,
       $k$from (select public.akcja_bieg_km_wyniku(u) as km) k;$k$),
      (8, 'public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$and public.akcja_bieg_wersja_od(b.regulamin_wersja, 4) and not public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)$k$,
       $k$and b.regulamin_wersja is not null and b.regulamin_wersja not in ('2026-11-v1', '2026-11-v2', '2026-11-v3')$k$),
      (9, 'public.akcja_bieg_czeka_na_weryfikacje(public.akcja_bieg_uczestnicy)',
       $k$public.akcja_bieg_km_wyniku(u) <= public.akcja_bieg_gorna_rankingu(u)$k$,
       $k$public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49$k$),
      (10, 'public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$public.akcja_bieg_km_wyniku(u) <= public.akcja_bieg_gorna_rankingu(u)$k$,
       $k$public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49$k$),
      (11, 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$then public.akcja_bieg_czas_biegu(u, b) end;$k$,
       $k$then u.wynik_s end;$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_z_tempa(public.akcja_bieg_uczestnicy, public.akcja_biegi);
drop function public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi);
drop function public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_czas_na_dystans(integer, numeric, integer, boolean);
drop function public.akcja_bieg_wersja_od(text, integer);

commit;
notify pgrst, 'reload schema';
