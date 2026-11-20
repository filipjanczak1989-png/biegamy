-- BIEG WIRTUALNY, REGULAMIN v8 (decyzja Filipa 20.11): imię na liście „Ukończyli” prowadzi do publicznego profilu w BiegaMy. NIE wykonywać przed 20261217
-- i PRZED pushem frontu, który przyjmuje v8 (stary front przy v8 w bazie pokazałby „WKRÓTCE”).
--   akcja_bieg_ukonczyli (dwie jednoliniowe kotwice): wiersz dostaje 'profil' (athletes.id, jak w profil.html?id=) tylko gdy:
--     zapis „ja” (nie dziecko), zgoda na imię, bieg od v8, profil publiczny (athletes.is_public, liczony na bieżąco),
--     pełnoletni: data urodzenia → 18+ w dniu startu biegu (akcja_bieg_niepelnoletni), bez daty → zgoda na ranking (oświadczenie „mam 18 lat”).
--   Id publicznych profili jest już widoczne w publicznym widoku profili; nowe jest tylko powiązanie wpisu na liście z profilem (§ 8 ust. 1 v8).
--   Pozostałe pola, kolejność, liczby, stronicowanie i uprawnienia (tylko service_role) bez zmian. EF bieg-ukonczyli przekazuje dalej (pamięć 60 s).
-- DANE (ten plik): bieg-mikolajki v7 → v8 (regulamin_od = dziś). Bramki: przy dla-fabianka, otwarty, {5}, przed końcem, wersja v7 albo już v8. Bez bieg-mikolajki tylko funkcja.
-- Test po skutku: tools/akcja-bieg-profil-test.sh (przed wdrożeniem AKCJA_BIEG_PROFIL_Z_MIGRACJA=1). Wycofanie: 20261218_WYCOFANIE_akcja_bieg_v8_profil.sql.
begin;

do $migracja$
declare v_def text; n integer; r record;
begin
  -- nowe teksty zawierają kotwice: drugie uruchomienie zdublowałoby pole „profil” (błąd dopiero przy wywołaniu listy), więc odmawiamy od razu
  if position(' as profil' in pg_get_functiondef('public.akcja_bieg_ukonczyli(text, integer, integer, integer)'::regprocedure)) > 0 then
    raise exception '20261218: lista ma już pole profil (migracja wykonana), nic nie zmieniam'; end if;
  for r in select * from (values
      (1, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$(u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny$k$,
       $k$(u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny, case when u.rodzaj = 'ja' and u.zgoda_imie and public.akcja_bieg_wersja_od(b.regulamin_wersja, 8) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od) and exists (select 1 from public.athletes a where a.id = u.konto_id and a.is_public and (a.date_of_birth is not null or u.ranking_zgoda_at is not null)) then u.konto_id end as profil$k$),
      (2, 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)',
       $k$'reczny', p.reczny)$k$,
       $k$'reczny', p.reczny) || case when p.profil is not null then jsonb_build_object('profil', p.profil) else '{}'::jsonb end$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if has_function_privilege('anon', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') then
    raise exception 'akcja_bieg (20261218): uprawnienia listy inne niż zamierzone (tylko service_role), nic nie zmieniam';
  end if;
end $migracja$;

do $dane$
declare b public.akcja_biegi; n integer; v_dzis constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  select * into b from public.akcja_biegi where slug = 'bieg-mikolajki';
  if not found then raise notice '20261218: brak bieg-mikolajki, tylko funkcja'; return; end if;
  if b.akcja_slug <> 'dla-fabianka' or b.status <> 'otwarty' or b.dystanse_km is distinct from '{5}'::integer[] then
    raise exception '20261218: bieg-mikolajki akcja % / status % / dystanse % inne niż oczekiwane, nic nie zmieniam', b.akcja_slug, b.status, b.dystanse_km; end if;
  if b.koniec_at is null or now() >= b.koniec_at then raise exception '20261218: bieg-mikolajki po końcu (albo bez koniec_at), nic nie zmieniam'; end if;
  if b.regulamin_wersja not in ('2026-11-v7', '2026-11-v8') then raise exception '20261218: bieg-mikolajki na wersji %, oczekiwano v7 (albo już v8), nic nie zmieniam', b.regulamin_wersja; end if;
  if b.regulamin_wersja = '2026-11-v7' then
    update public.akcja_biegi set regulamin_wersja = '2026-11-v8', regulamin_od = v_dzis where id = b.id and regulamin_wersja = '2026-11-v7';
    get diagnostics n = row_count;
    if n <> 1 then raise exception '20261218: zmieniono % wierszy biegu zamiast 1', n; end if;
  end if;
  raise notice '20261218: bieg-mikolajki na 2026-11-v8 (od %); na liście z linkiem do profilu: %', v_dzis,
    (select count(*) from jsonb_array_elements(public.akcja_bieg_ukonczyli('bieg-mikolajki', 0, 100, null)->'lista') x where x ? 'profil');
end $dane$;

commit;
notify pgrst, 'reload schema';
