-- WYCOFANIE 20261215_akcja_bieg_czas_z_tempa_bez_limitu.sql (regulamin v6). Po nim reguły jak po 20261214 (v5: czas z tempa do 10,49 km).
-- Kolejność: bieg-mikolajki v6 → v5 (regulamin_od jak przed migracją: 2026-11-18), kotwice z powrotem (odwrotna kolejność), przeliczenie wyników po regułach v5
-- (akcja_bieg_przelicz: bez wskazanych, zaliczonych przez organizatora i zatwierdzonych), na końcu nowe funkcje usunięte.
-- Front z v6 przy v5 w bazie działa (strona przyjmuje v2–v6). Zatwierdzenia maratonów (weryfikacja) zostają w wierszach, przy v5 nic nie znaczą dla długich treningów.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  update public.akcja_biegi set regulamin_wersja = '2026-11-v5', regulamin_od = date '2026-11-18' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v6';
  for r in select * from (values
      (1, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$public.akcja_bieg_czas_wersji(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), b.regulamin_wersja)$k$,
       $k$public.akcja_bieg_czas_na_dystans(public.akcja_bieg_sekundy(x.duration), x.distance_km, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km), true)$k$),
      (2, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(public.akcja_bieg_wersja_od(b.regulamin_wersja, 6) or x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$,
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) * (1 + public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)::integer) + 0.49) desc$k$),
      (3, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'ja' and k.v6 and k.km > 42.2 then 'trening dłuższy niż maraton' when u.rodzaj = 'ja' and k.v6 then null when u.rodzaj = 'ja' and k.v5 and k.km > $k$,
       $k$case when u.rodzaj = 'ja' and k.v5 and k.km > $k$),
      (4, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$ as v5, public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6) as v6) k;$k$,
       $k$ as v5) k;$k$),
      (5, 'public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy)',
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)))$k$,
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160)$k$),
      (6, 'public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy)',
       $k$select case when public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6) then 100000::numeric else u.wynik_dystans_km + 0.49 + u.wynik_dystans_km * public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5)::integer end;$k$,
       $k$select u.wynik_dystans_km + 0.49 + u.wynik_dystans_km * public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 5)::integer;$k$),
      (7, 'public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)',
       $k$public.akcja_bieg_czas_wersji(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, b.regulamin_wersja)$k$,
       $k$public.akcja_bieg_czas_na_dystans(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, public.akcja_bieg_wersja_od(b.regulamin_wersja, 5))$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  perform public.akcja_bieg_przelicz(b.id) from public.akcja_biegi b where b.slug = 'bieg-mikolajki';
end $wycofanie$;

drop function public.akcja_bieg_przelicz(uuid);
drop function public.akcja_bieg_czas_wersji(integer, numeric, integer, text);

commit;
notify pgrst, 'reload schema';
