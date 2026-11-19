-- WYCOFANIE 20261217_akcja_bieg_v7_czas_wymagany.sql (regulamin v7). Po nim reguły jak po 20261216 (v6: trening bez czasu zalicza, „Usuń wynik” blokuje do „Zalicz ręcznie”).
-- Kolejność: bieg-mikolajki v7 → v6 (regulamin_od jak przed migracją: 2026-11-19), kotwice z powrotem (odwrotna kolejność), potem nowe funkcje i kolumna.
-- Wyniki przywrócone po „Usuń wynik” zostają ukończone (bez flagi); zapisy, którym usunięto wynik i go nie przywrócono, mają dalej wynik_usuniety_at, więc przy v6 blokada wraca w pełni.
-- Front z v7 przy v6 w bazie działa (strona przyjmuje v2–v7, teksty v7 tylko przy v7).
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  update public.akcja_biegi set regulamin_wersja = '2026-11-v6', regulamin_od = date '2026-11-19' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v7';
  for r in select * from (values
      (1, 'public.akcja_bieg_panel(text)',
       $k$'faza', public.akcja_bieg_faza(b), 'status', b.status, 'regulamin_wersja', b.regulamin_wersja,$k$,
       $k$'faza', public.akcja_bieg_faza(b), 'status', b.status,$k$),
      (2, 'public.akcja_bieg_moi(text)',
       $k$'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja, 'po_usunieciu', public.akcja_bieg_po_usunieciu(u)) order by u.numer)$k$,
       $k$'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja) order by u.numer)$k$),
      (3, 'public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy)',
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)) or public.akcja_bieg_po_usunieciu(u))$k$,
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)))$k$),
      (4, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end, case when public.akcja_bieg_po_usunieciu(u) then 'wynik po usunięciu' end], null) end$k$,
       $k$case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end], null) end$k$),
      (5, 'public.akcja_bieg_usun_wynik(uuid, text)',
       $k$set wynik_usuniete_treningi = wynik_usuniete_treningi || coalesce((select l.id::text || ':' || public.akcja_bieg_slad(l) from public.training_logs l where l.id = u.wynik_log_id), 'bez_treningu:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS')), ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false, zaliczony_przez = null, dystans_wlasny_km = null,$k$,
       $k$set ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false, zaliczony_przez = null, dystans_wlasny_km = null,$k$),
      (6, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$set wynik_usuniete_treningi = v_blok, wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null, wynik_log_id = l.id, wynik_s = case when l.s between 60 and 86400 then l.s end,$k$,
       $k$set wynik_log_id = l.id, wynik_s = case when l.s between 60 and 86400 then l.s end,$k$),
      (7, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$if not found then return jsonb_build_object('ok', false, 'powod', coalesce(case when p_log_id is not null and public.akcja_bieg_wersja_od(b.regulamin_wersja, 7) then (select case when (y.id::text || ':' || public.akcja_bieg_slad(y)) = any(v_blok) then 'usuniety' when not coalesce(public.akcja_bieg_sekundy(y.duration) between 60 and 86400, false) then 'bez_czasu' end from public.training_logs y where y.id = p_log_id and y.athlete_id = u.konto_id) end, 'brak_treningu'), 'dystans_km', u.dystans_km); end if;$k$,
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'brak_treningu', 'dystans_km', u.dystans_km); end if;$k$),
      (8, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and (p_log_id is null or x.id = p_log_id) and (not public.akcja_bieg_wersja_od(b.regulamin_wersja, 7) or (coalesce(public.akcja_bieg_sekundy(x.duration) between 60 and 86400, false) and not ((x.id::text || ':' || public.akcja_bieg_slad(x)) = any(v_blok))))$k$,
       $k$and (p_log_id is null or x.id = p_log_id)$k$),
      (9, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$select * into b from public.akcja_biegi where id = u.bieg_id; v_blok := coalesce((select array_agg(distinct e) from public.akcja_bieg_uczestnicy z cross join lateral unnest(z.wynik_usuniete_treningi) e where z.bieg_id = u.bieg_id and z.konto_id = u.konto_id and z.rodzaj = 'ja'), '{}'::text[]);$k$,
       $k$select * into b from public.akcja_biegi where id = u.bieg_id;$k$),
      (10, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and x.wynik_usuniety_at is not null) and not public.akcja_bieg_wersja_od((select y.regulamin_wersja from public.akcja_biegi y where y.id = u.bieg_id), 7) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$,
       $k$and x.wynik_usuniety_at is not null) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$),
      (11, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; l record; v_blok text[];$k$,
       $k$declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; l record;$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_po_usunieciu(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_slad(public.training_logs);
alter table public.akcja_bieg_uczestnicy drop column wynik_usuniete_treningi;

commit;
notify pgrst, 'reload schema';
