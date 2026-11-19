-- BIEG WIRTUALNY, REGULAMIN v7 (decyzja Filipa 19.11): bieg zalicza tylko trening z czasem. NIE wykonywać przed 20261216 i PRZED pushem frontu, który przyjmuje v7
-- (stary front przy v7 w bazie pokazałby „WKRÓTCE”).
--   1. Od v7 trening bez ważnego czasu (pusty, sama liczba, uszkodzony, poza 60 s – 24 h; akcja_bieg_sekundy jak dotąd) nie daje ukończenia ani dyplomu:
--      automat i wyzwalacz go pomijają, wskazanie zwraca powód 'bez_czasu'. „Zalicz ręcznie” i „Popraw” organizatora bez zmian.
--   2. „Usuń wynik” od v7 blokuje tylko usunięty trening w tej postaci (kolumna wynik_usuniete_treningi: „id:ślad”, ślad = akcja_bieg_slad z dystansu, czasu i daty).
--      Poprawiony (inny ślad) albo nowy trening przywraca ukończenie i dyplom (automat co godzinę, wejście na stronę biegu, wskazanie);
--      taki wynik ma w panelu „Do sprawdzenia: wynik po usunięciu” (akcja_bieg_po_usunieciu) i do rankingu trafia dopiero po „Zatwierdź” (akcja_bieg_do_weryfikacji).
--      Przy v6 i starszych „Usuń wynik” blokuje jak dotąd (do „Zalicz ręcznie”). Ponowny zapis po wycofaniu dziedziczy blokady z wycofanego zapisu.
--   3. akcja_bieg_moi: pole 'po_usunieciu' (karta: „Wynik wrócił…”); akcja_bieg_panel: 'regulamin_wersja' biegu (tekst potwierdzenia „Usuń wynik”).
-- DANE (ten plik): wcześniejsze usunięcia bez listy (sprzed tej migracji) dostają blokadę wszystkich treningów konta z okresu biegu w obecnej postaci;
--   bieg-mikolajki v6 → v7 (regulamin_od = dziś). Nikogo nie cofamy: wyniki ukończonych zostają (odczyt 19.11 wieczór: 4 ukończonych dorosłych, wszyscy z ważnym czasem;
--   nr 10 poprawił czas w treningu 14 km). Bramki: bieg-mikolajki przy dla-fabianka, otwarty, {5}, przed końcem, wersja v6 albo już v7. Bez bieg-mikolajki tylko funkcje.
-- Test po skutku: tools/akcja-bieg-v7-test.sh (przed wdrożeniem AKCJA_BIEG_V7_Z_MIGRACJA=1). Wycofanie: 20261217_WYCOFANIE_akcja_bieg_v7_czas_wymagany.sql.
begin;

alter table public.akcja_bieg_uczestnicy add column wynik_usuniete_treningi text[] not null default '{}';
comment on column public.akcja_bieg_uczestnicy.wynik_usuniete_treningi is 'Od v7 (20261217): treningi zablokowane przez „Usuń wynik” jako „id:ślad” (akcja_bieg_slad: dystans, czas, data). Ten trening w tej postaci nie wraca; poprawiony albo nowy przywraca wynik z flagą „wynik po usunięciu” (ranking po „Zatwierdź”). „bez_treningu:…” = usunięty wynik bez treningu. Nie wychodzi publicznie.';

create function public.akcja_bieg_slad(l public.training_logs)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select md5(coalesce(l.distance_km::numeric::text, '') || '|' || coalesce(l.duration, '') || '|' || coalesce(extract(epoch from l.logged_at)::text, ''));
$function$;

create function public.akcja_bieg_po_usunieciu(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(u.rodzaj = 'ja' and u.ukonczony_at is not null and u.zaliczony_przez is null and cardinality(u.wynik_usuniete_treningi) > 0, false);
$function$;

revoke all on function public.akcja_bieg_slad(public.training_logs) from public, anon, authenticated;
revoke all on function public.akcja_bieg_po_usunieciu(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; l record;$k$,
       $k$declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; l record; v_blok text[];$k$),
      (2, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and x.wynik_usuniety_at is not null) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$,
       $k$and x.wynik_usuniety_at is not null) and not public.akcja_bieg_wersja_od((select y.regulamin_wersja from public.akcja_biegi y where y.id = u.bieg_id), 7) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$),
      (3, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$select * into b from public.akcja_biegi where id = u.bieg_id;$k$,
       $k$select * into b from public.akcja_biegi where id = u.bieg_id; v_blok := coalesce((select array_agg(distinct e) from public.akcja_bieg_uczestnicy z cross join lateral unnest(z.wynik_usuniete_treningi) e where z.bieg_id = u.bieg_id and z.konto_id = u.konto_id and z.rodzaj = 'ja'), '{}'::text[]);$k$),
      (4, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$and (p_log_id is null or x.id = p_log_id)$k$,
       $k$and (p_log_id is null or x.id = p_log_id) and (not public.akcja_bieg_wersja_od(b.regulamin_wersja, 7) or (coalesce(public.akcja_bieg_sekundy(x.duration) between 60 and 86400, false) and not ((x.id::text || ':' || public.akcja_bieg_slad(x)) = any(v_blok))))$k$),
      (5, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'brak_treningu', 'dystans_km', u.dystans_km); end if;$k$,
       $k$if not found then return jsonb_build_object('ok', false, 'powod', coalesce(case when p_log_id is not null and public.akcja_bieg_wersja_od(b.regulamin_wersja, 7) then (select case when (y.id::text || ':' || public.akcja_bieg_slad(y)) = any(v_blok) then 'usuniety' when not coalesce(public.akcja_bieg_sekundy(y.duration) between 60 and 86400, false) then 'bez_czasu' end from public.training_logs y where y.id = p_log_id and y.athlete_id = u.konto_id) end, 'brak_treningu'), 'dystans_km', u.dystans_km); end if;$k$),
      (6, 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$set wynik_log_id = l.id, wynik_s = case when l.s between 60 and 86400 then l.s end,$k$,
       $k$set wynik_usuniete_treningi = v_blok, wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null, wynik_log_id = l.id, wynik_s = case when l.s between 60 and 86400 then l.s end,$k$),
      (7, 'public.akcja_bieg_usun_wynik(uuid, text)',
       $k$set ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false, zaliczony_przez = null, dystans_wlasny_km = null,$k$,
       $k$set wynik_usuniete_treningi = wynik_usuniete_treningi || coalesce((select l.id::text || ':' || public.akcja_bieg_slad(l) from public.training_logs l where l.id = u.wynik_log_id), 'bez_treningu:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS')), ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false, zaliczony_przez = null, dystans_wlasny_km = null,$k$),
      (8, 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)',
       $k$case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end], null) end$k$,
       $k$case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end, case when public.akcja_bieg_po_usunieciu(u) then 'wynik po usunięciu' end], null) end$k$),
      (9, 'public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy)',
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)))$k$,
       $k$(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160 or (k.km > 42.2 and public.akcja_bieg_wersja_od((select b.regulamin_wersja from public.akcja_biegi b where b.id = u.bieg_id), 6)) or public.akcja_bieg_po_usunieciu(u))$k$),
      (10, 'public.akcja_bieg_moi(text)',
       $k$'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja) order by u.numer)$k$,
       $k$'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja, 'po_usunieciu', public.akcja_bieg_po_usunieciu(u)) order by u.numer)$k$),
      (11, 'public.akcja_bieg_panel(text)',
       $k$'faza', public.akcja_bieg_faza(b), 'status', b.status,$k$,
       $k$'faza', public.akcja_bieg_faza(b), 'status', b.status, 'regulamin_wersja', b.regulamin_wersja,$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if exists (select 1 from unnest(array['public.akcja_bieg_slad(public.training_logs)', 'public.akcja_bieg_po_usunieciu(public.akcja_bieg_uczestnicy)',
                                        'public.akcja_bieg_wynik_z_treningu(uuid, uuid)', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)']) f
              where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute'))
     or has_function_privilege('anon', 'public.akcja_bieg_usun_wynik(uuid, text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_usun_wynik(uuid, text)', 'execute')
     or has_column_privilege('anon', 'public.akcja_bieg_uczestnicy', 'wynik_usuniete_treningi', 'select') or has_column_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'wynik_usuniete_treningi', 'select')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_panel(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_panel(text)', 'execute') then
    raise exception 'akcja_bieg (20261217): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

do $dane$
declare b public.akcja_biegi; n integer; v_dzis constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  update public.akcja_bieg_uczestnicy u
     set wynik_usuniete_treningi = array['bez_treningu:20261217'] || coalesce((select array_agg(l.id::text || ':' || public.akcja_bieg_slad(l) order by l.id) from public.training_logs l join public.akcja_biegi y on y.id = u.bieg_id
                                                                         where l.athlete_id = u.konto_id and (l.logged_at at time zone 'Europe/Warsaw')::date between y.dzien_od and y.dzien_do), '{}'::text[])
   where u.wynik_usuniety_at is not null and u.rodzaj = 'ja' and cardinality(u.wynik_usuniete_treningi) = 0;
  get diagnostics n = row_count;
  raise notice '20261217: wcześniejsze usunięcia z blokadą obecnych treningów: %', n;
  select * into b from public.akcja_biegi where slug = 'bieg-mikolajki';
  if not found then raise notice '20261217: brak bieg-mikolajki, tylko funkcje'; return; end if;
  if b.akcja_slug <> 'dla-fabianka' or b.status <> 'otwarty' or b.dystanse_km is distinct from '{5}'::integer[] then
    raise exception '20261217: bieg-mikolajki akcja % / status % / dystanse % inne niż oczekiwane, nic nie zmieniam', b.akcja_slug, b.status, b.dystanse_km; end if;
  if b.koniec_at is null or now() >= b.koniec_at then raise exception '20261217: bieg-mikolajki po końcu (albo bez koniec_at), nic nie zmieniam'; end if;
  if b.regulamin_wersja not in ('2026-11-v6', '2026-11-v7') then raise exception '20261217: bieg-mikolajki na wersji %, oczekiwano v6 (albo już v7), nic nie zmieniam', b.regulamin_wersja; end if;
  if b.regulamin_wersja = '2026-11-v6' then
    update public.akcja_biegi set regulamin_wersja = '2026-11-v7', regulamin_od = v_dzis where id = b.id and regulamin_wersja = '2026-11-v6';
    get diagnostics n = row_count;
    if n <> 1 then raise exception '20261217: zmieniono % wierszy biegu zamiast 1', n; end if;
  end if;
  select count(*) into n from public.akcja_bieg_uczestnicy u left join public.training_logs l on l.id = u.wynik_log_id
   where u.bieg_id = b.id and u.rodzaj = 'ja' and u.ukonczony_at is not null and u.wycofany_at is null and u.zaliczony_przez is null
     and not coalesce(public.akcja_bieg_sekundy(l.duration) between 60 and 86400, false);
  raise notice '20261217: bieg-mikolajki na 2026-11-v7 (od %); ukończeni bez ważnego czasu (zostają, nikogo nie cofamy): %', v_dzis, n;
end $dane$;

commit;
notify pgrst, 'reload schema';
