-- Testy 20261233_akcja_bieg_wyniki_organizatora.sql (wyniki biegu spoza aplikacji, wpisuje organizator). Jedna transakcja, zawsze wycofana
-- (runner: tools/akcja-bieg-org-test.sh). Bieg: najnowszy otwarty bieg w fazie, w której organizator może wpisywać (trwa, wyniki, zakończony
-- przed zalicz_do). Konta: dwa konta trenerów (organizator i drugi trener) i jedno konto zawodnika bez trenerstwa; claims z ich user_id,
-- identyfikatory nie wychodzą na wyjście. Wpisy testowe giną przy rollback.
-- Sprawdza: organizator może, zawodnik i gość nie; zgody wymagane; imię „Anna” / „Anna K.” (inicjał poprawiany), nic więcej; dystans z listy
-- biegu; czas 1:00–24:00:00; ranking pokazuje wpis z czasem, miejscem i „organizator”, bez numeru; licznik ulicy bez zmian; liczby biegu:
-- „ukończyli” = poprzednio + wpisy organizatora TEGO biegu = liczba wierszy listy (decyzja 27.11), także na stronie (akcja_bieg_publiczny), reszta
-- bez zmian; poprawka i usunięcie tylko własnego wpisu; sprzątanie po 90 dniach usuwa wpisy (podsumowanie je liczy); uprawnienia tabeli i funkcji.
create or replace function pg_temp.org_jako(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.org_wpisz(p_uid uuid, p_slug text, p_imie text, p_km integer, p_s integer, p_pel boolean, p_zg boolean, p_id uuid default null) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
  perform pg_temp.org_jako(p_uid);
  r := public.akcja_bieg_org_wpisz(p_slug, p_imie, p_km, p_s, p_pel, p_zg, p_id);
  execute 'reset role';
  return r;
end $f$;

do $T$
declare
  n int := 0; b public.akcja_biegi; org uuid; org2 uuid; zaw uuid; r jsonb; r2 jsonb; rk0 jsonb; rk1 jsonb; rk2 jsonb; e jsonb; v_id uuid; v_id2 uuid; km0 numeric; km1 numeric; lb0 jsonb; lb1 jsonb;
  pw oid := to_regprocedure('public.akcja_bieg_org_wpisz(text,text,integer,integer,boolean,boolean,uuid)');
  pu oid := to_regprocedure('public.akcja_bieg_org_usun(uuid)'); pl oid := to_regprocedure('public.akcja_bieg_org_lista(text)');
  d integer; fb uuid;
begin
  if pw is null or pu is null or pl is null or to_regclass('public.akcja_bieg_wyniki_org') is null then raise exception 'FAIL 0: brak tabeli albo funkcji (bez wdrożenia: AO_Z_MIGRACJA=1)'; end if;
  select x.* into b from public.akcja_biegi x where x.status <> 'szkic' and public.akcja_bieg_faza(x) in ('trwa', 'wyniki', 'zakonczony')
     and (now() at time zone 'Europe/Warsaw')::date <= coalesce(x.zalicz_do, x.wynik_do + 7) order by x.dzien_od desc limit 1;
  if not found then raise exception 'FAIL 0b: nie ma biegu, w którym organizator może dziś wpisywać'; end if;
  d := b.dystanse_km[1];
  select id into org from public.coaches order by id limit 1;
  select id into org2 from public.coaches where id <> org order by id limit 1;
  select a.user_id into zaw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  if org is null or zaw is null then raise exception 'FAIL 0c: brak konta trenera albo zawodnika'; end if;

  -- stan wyjściowy: ranking, licznik ulicy, liczby biegu
  rk0 := public.akcja_bieg_ukonczyli(b.slug, 0, 100, null);
  km0 := ((public.akcja_licznik(b.akcja_slug))->>'suma_km')::numeric;
  lb0 := public.akcja_bieg_liczby(b.id);
  if (lb0->>'ukonczyli_n')::int is distinct from (rk0->>'razem')::int then raise exception 'FAIL 0d: przed wpisami liczba „ukończyli” % ≠ wierszy listy %', lb0->>'ukonczyli_n', rk0->>'razem'; end if;
  -- drugi bieg (sprzed pół roku, do sprzątania w kroku 7) z wpisem organizatora: jego wpis NIE może wejść do liczb biegu b
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, wsparcie_kwoty_zl, limit_dzieci, utworzono)
  values (b.akcja_slug, 'test-org-sprzatanie', 'Test sprzątania', current_date - 200, current_date - 199, current_date - 198, array[5], 'zakonczony', b.regulamin_wersja, array[20], 6, now()) returning id into fb;
  insert into public.akcja_bieg_wyniki_org (bieg_id, imie, dystans_km, wynik_s, pelnoletnia, zgoda_imie, wpisal) values (fb, 'Stara', 5, 1500, true, true, org);

  -- 1. organizator wpisuje; inicjał poprawiany do „X.”
  r := pg_temp.org_wpisz(org, b.slug, '  Próbna   q ', d, 1500, true, true);
  if r->>'ok' is distinct from 'true' or r->>'imie' is distinct from 'Próbna Q.' then raise exception 'FAIL 1: wpis organizatora: %', r; end if;
  v_id := (r->>'id')::uuid;
  r := pg_temp.org_wpisz(org, b.slug, 'Zenobia', d, 1440, true, true);
  if r->>'ok' is distinct from 'true' or r->>'imie' is distinct from 'Zenobia' then raise exception 'FAIL 1b: samo imię: %', r; end if;
  v_id2 := (r->>'id')::uuid;
  n := n + 2;

  -- 2. walidacja: zgody, imię, dystans, czas, nieznany bieg
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 1500, true, false)->>'powod' is distinct from 'zgoda' then raise exception 'FAIL 2a: bez zgody na imię'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 1500, false, true)->>'powod' is distinct from 'zgoda' then raise exception 'FAIL 2b: bez pełnoletności'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 1500, null, true)->>'powod' is distinct from 'zgoda' then raise exception 'FAIL 2c: pełnoletność null'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna Kowalska', d, 1500, true, true)->>'powod' is distinct from 'imie' then raise exception 'FAIL 2d: nazwisko przeszło'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'A', d, 1500, true, true)->>'powod' is distinct from 'imie' then raise exception 'FAIL 2e: jedna litera'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna 7', d, 1500, true, true)->>'powod' is distinct from 'imie' then raise exception 'FAIL 2f: cyfra'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna@x', d, 1500, true, true)->>'powod' is distinct from 'imie' then raise exception 'FAIL 2g: znak spoza liter'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', 7, 1500, true, true)->>'powod' is distinct from 'dystans' or 7 = any(b.dystanse_km) then raise exception 'FAIL 2h: dystans spoza biegu'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 59, true, true)->>'powod' is distinct from 'czas' then raise exception 'FAIL 2i: czas < 1:00'; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 86401, true, true)->>'powod' is distinct from 'czas' then raise exception 'FAIL 2j: czas > doby'; end if;
  if pg_temp.org_wpisz(org, 'nie-ma-takiego-biegu', 'Anna', d, 1500, true, true)->>'powod' is distinct from 'nie_ma_biegu' then raise exception 'FAIL 2k: nieznany bieg'; end if;
  if (select count(*) from public.akcja_bieg_wyniki_org where bieg_id = b.id and wpisal = org) <> 2 then raise exception 'FAIL 2l: odrzucony wpis jednak zapisany'; end if;
  n := n + 12;

  -- 3. ranking: oba wpisy z czasem, miejscem i „organizator”, bez numeru; zakładka dystansu też; licznik ulicy i liczby biegu bez zmian
  rk1 := public.akcja_bieg_ukonczyli(b.slug, 0, 100, null);
  if (rk1->>'razem')::int <> (rk0->>'razem')::int + 2 or (rk1->>'w_rankingu')::int <> (rk0->>'w_rankingu')::int + 2 then raise exception 'FAIL 3a: razem/w_rankingu %→%', rk0->>'razem', rk1->>'razem'; end if;
  select x into e from jsonb_array_elements(rk1->'lista') x where x->>'imie' = 'Próbna Q.';
  if e is null or e->>'organizator' is distinct from 'true' or (e->>'czas_s')::int is distinct from 1500 or e->'miejsce' is null or jsonb_typeof(e->'numer') is distinct from 'null' or e ? 'profil' or coalesce((e->>'reczny')::boolean, true) then raise exception 'FAIL 3b: wiersz w rankingu: %', e; end if;
  if (select (x->>'miejsce')::int from jsonb_array_elements(rk1->'lista') x where x->>'imie' = 'Zenobia') >= (e->>'miejsce')::int then raise exception 'FAIL 3c: szybszy czas nie jest wyżej'; end if;
  if not exists (select 1 from jsonb_array_elements(rk1->'lista') x where coalesce((x->>'organizator')::boolean, false) is false) and (rk0->>'razem')::int > 0 then raise exception 'FAIL 3d: zwykłe wiersze zgubiły się'; end if;
  if not exists (select 1 from jsonb_array_elements((public.akcja_bieg_ukonczyli(b.slug, 0, 100, d))->'lista') x where x->>'imie' = 'Próbna Q.') then raise exception 'FAIL 3e: brak w zakładce dystansu'; end if;
  km1 := ((public.akcja_licznik(b.akcja_slug))->>'suma_km')::numeric;
  if km1 is distinct from km0 then raise exception 'FAIL 3f: licznik ulicy zmienił się % → %', km0, km1; end if;
  lb1 := public.akcja_bieg_liczby(b.id);
  if (lb1 - 'ukonczyli_n') is distinct from (lb0 - 'ukonczyli_n') then raise exception 'FAIL 3g: zapisani, dzieci albo złote zmieniły się'; end if;
  if (lb1->>'ukonczyli_n')::int is distinct from (lb0->>'ukonczyli_n')::int + 2 then raise exception 'FAIL 3h: „ukończyli” % → % (ma być +2, bez wpisu z innego biegu)', lb0->>'ukonczyli_n', lb1->>'ukonczyli_n'; end if;
  if (lb1->>'ukonczyli_n')::int is distinct from (rk1->>'razem')::int then raise exception 'FAIL 3i: liczba „ukończyli” % ≠ wierszy listy %', lb1->>'ukonczyli_n', rk1->>'razem'; end if;
  if b.podsumowanie is null and ((public.akcja_bieg_publiczny(b.akcja_slug))->>'ukonczyli_n')::int is distinct from (rk1->>'razem')::int then raise exception 'FAIL 3j: strona biegu (akcja_bieg_publiczny) ≠ wierszy listy'; end if;
  n := n + 10;

  -- 4. poprawka własnego wpisu; cudzy (drugi trener) nie poprawi i nie usunie; lista
  r := pg_temp.org_wpisz(org, b.slug, 'Próbna Q.', d, 1600, true, true, v_id);
  if r->>'ok' is distinct from 'true' or (select wynik_s from public.akcja_bieg_wyniki_org where id = v_id) is distinct from 1600 or (select zmieniono from public.akcja_bieg_wyniki_org where id = v_id) is null then raise exception 'FAIL 4a: poprawka: %', r; end if;
  if pg_temp.org_wpisz(org, b.slug, 'Anna', d, 1600, true, true, gen_random_uuid())->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 4b: poprawka nieistniejącego'; end if;
  if org2 is not null then
    if pg_temp.org_wpisz(org2, b.slug, 'Obca', d, 1700, true, true, v_id)->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 4c: drugi trener poprawił cudzy wpis'; end if;
    perform pg_temp.org_jako(org2); r := public.akcja_bieg_org_usun(v_id); execute 'reset role';
    if r->>'powod' is distinct from 'nie_ma' or not exists (select 1 from public.akcja_bieg_wyniki_org where id = v_id) then raise exception 'FAIL 4d: drugi trener usunął cudzy wpis'; end if;
    perform pg_temp.org_jako(org2); r := public.akcja_bieg_org_lista(b.slug); execute 'reset role';
    if exists (select 1 from jsonb_array_elements(r) x where (x->>'moj')::boolean) then raise exception 'FAIL 4e: cudze wpisy jako „moje”'; end if;
  end if;
  perform pg_temp.org_jako(org); r := public.akcja_bieg_org_lista(b.slug); execute 'reset role';
  if (select count(*) from jsonb_array_elements(r) x where (x->>'moj')::boolean and x->>'imie' in ('Próbna Q.', 'Zenobia')) <> 2 then raise exception 'FAIL 4f: lista organizatora'; end if;
  if exists (select 1 from jsonb_array_elements(r) x, jsonb_object_keys(x) k where k not in ('id', 'imie', 'dystans_km', 'wynik_s', 'moj', 'utworzono')) then raise exception 'FAIL 4g: lista z polami spoza zestawu'; end if;
  n := n + 7;

  -- 5. zawodnik i gość: ani wpis, ani lista, ani usunięcie, ani tabela
  perform pg_temp.org_jako(zaw);
  begin perform public.akcja_bieg_org_wpisz(b.slug, 'Anna', d, 1500, true, true, null); raise exception 'FAIL 5a: zawodnik wpisał'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_bieg_org_lista(b.slug); raise exception 'FAIL 5b: zawodnik czyta listę'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_bieg_org_usun(v_id); raise exception 'FAIL 5c: zawodnik usuwa'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.akcja_bieg_wyniki_org limit 1; raise exception 'FAIL 5d: zawodnik czyta tabelę'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_bieg_wyniki_org (bieg_id, imie, dystans_km, wynik_s, pelnoletnia, zgoda_imie) values (b.id, 'Anna', d, 1500, true, true); raise exception 'FAIL 5e: zawodnik wstawia do tabeli'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform public.akcja_bieg_org_wpisz(b.slug, 'Anna', d, 1500, true, true, null); raise exception 'FAIL 5f: gość wpisał'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.akcja_bieg_wyniki_org limit 1; raise exception 'FAIL 5g: gość czyta tabelę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if exists (select 1 from public.akcja_bieg_wyniki_org where imie = 'Anna') then raise exception 'FAIL 5h: coś się zapisało'; end if;
  n := n + 8;

  -- 6. usunięcie własnego; ranking wraca
  perform pg_temp.org_jako(org); r := public.akcja_bieg_org_usun(v_id); r2 := public.akcja_bieg_org_usun(v_id2); execute 'reset role';
  if r->>'ok' is distinct from 'true' or r2->>'ok' is distinct from 'true' or exists (select 1 from public.akcja_bieg_wyniki_org where id in (v_id, v_id2)) then raise exception 'FAIL 6a: usunięcie własnych'; end if;
  rk2 := public.akcja_bieg_ukonczyli(b.slug, 0, 100, null);
  if rk2 is distinct from rk0 then raise exception 'FAIL 6b: ranking po usunięciu inny niż wyjściowy'; end if;
  if public.akcja_bieg_liczby(b.id) is distinct from lb0 then raise exception 'FAIL 6c: liczby biegu po usunięciu inne niż wyjściowe'; end if;
  n := n + 3;

  -- 7. sprzątanie po 90 dniach (bieg testowy sprzed pół roku z kroku 0): podsumowanie liczy wpis organizatora, potem wpis znika
  perform public.akcja_bieg_sprzatanie();
  if exists (select 1 from public.akcja_bieg_wyniki_org where bieg_id = fb) then raise exception 'FAIL 7: sprzątanie zostawiło wpis organizatora'; end if;
  if (select (podsumowanie->>'ukonczyli_n')::int from public.akcja_biegi where id = fb) is distinct from 1 then raise exception 'FAIL 7b: podsumowanie bez wpisu organizatora'; end if;
  n := n + 2;

  -- 8. uprawnienia i ustawienia
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'akcja_bieg_wyniki_org' and grantee in ('anon', 'authenticated', 'PUBLIC')) then raise exception 'FAIL 8a: tabela z uprawnieniami dla anon/authenticated'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.akcja_bieg_wyniki_org'::regclass) then raise exception 'FAIL 8b: RLS wyłączone'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_bieg_wyniki_org') then raise exception 'FAIL 8c: tabela ma polityki'; end if;
  if exists (select 1 from unnest(array[pw, pu, pl]) f where has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')) then raise exception 'FAIL 8d: uprawnienia funkcji'; end if;
  if exists (select 1 from pg_proc, aclexplode(proacl) x where pg_proc.oid in (pw, pu, pl) and x.grantee = 0 and x.privilege_type = 'EXECUTE') then raise exception 'FAIL 8e: PUBLIC ma EXECUTE'; end if;
  if exists (select 1 from pg_proc where oid in (pw, pu, pl) and not (prosecdef and 'search_path=""' = any (proconfig))) then raise exception 'FAIL 8f: SECURITY DEFINER i pusty search_path'; end if;
  n := n + 6;

  create temp table _org_wynik as select 'TESTY AKCJA_BIEG_ORG ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _org_wynik;
