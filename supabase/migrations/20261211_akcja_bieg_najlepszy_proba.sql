-- BIEG WIRTUALNY (decyzje Filipa 18.11): powiadomienie o nowym najlepszym wyniku z automatu i bramka zapisu na bieg akcji testowej. NIE wykonywać przed 20261209.
-- 1. NOWY NAJLEPSZY WYNIK: gdy akcja_bieg_automat (cron :25) podmieni ISTNIEJĄCY wynik „ja” na inny trening, woła akcja_bieg_najlepszy_powiadom → dzwonek 'bieg_wynik'
--    „Masz nowy najlepszy wynik w biegu. Dyplom jest już zaktualizowany.” BEZ czasu (decyzja 17.11: czasu w powiadomieniach nie ma). Raz na podmianę, tylko „ja”
--    (automat innych nie rusza). Nie przy pierwszym wyniku (wtedy jest dzwonek odznaki) i nie, gdy stary trening zniknął albo nowy zalicza krótszy dystans
--    (podmiana z musu, nie „lepszy”). Wyjątek w powiadomieniu nie zatrzymuje automatu (własny blok; ostrzeżenie w cron.job_run_details).
-- 2. BIEG PRÓBNY: akcja_bieg_zapisz i akcja_bieg_dopisz_dziecko na biegu akcji testowej (akcje.testowa) przyjmują tylko konta z akcje.konta_testowe; inne konta → powód
--    'tylko_test' (strona: „Bieg próbny jest tylko dla kont testowych.”). Prawdziwy bieg bez zmian. Istniejące zapisy zostają.
-- Funkcje z bazy, kotwice jednoliniowe (wzór 20261209). Testy biegu (tools/akcja-bieg*-test.sql) dopisują swoje konta do konta_testowe akcji 'proba' w swojej transakcji.
-- Test po skutku: tools/akcja-bieg-najlepszy-test.sh (przed wdrożeniem AKCJA_BIEG_NAJLEPSZY_Z_MIGRACJA=1). Wycofanie: 20261211_WYCOFANIE_akcja_bieg_najlepszy_proba.sql.
begin;

create function public.akcja_bieg_najlepszy_powiadom(p_uczestnik uuid, p_stary_log uuid, p_stary_dystans numeric, p_byl_wynik boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy;
begin
  if not coalesce(p_byl_wynik, false) or p_stary_log is null then return false; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_uczestnik;
  if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null or u.ukonczony_at is null or u.wynik_log_id is null or u.wynik_log_id = p_stary_log then return false; end if;
  if not exists (select 1 from public.training_logs l where l.id = p_stary_log and l.athlete_id = u.konto_id) then return false; end if;
  if u.wynik_dystans_km < p_stary_dystans then return false; end if;
  insert into public.notifications (athlete_id, type, from_athlete_id, message, read, created_at)
    values (u.konto_id, 'bieg_wynik', null, 'Masz nowy najlepszy wynik w biegu. Dyplom jest już zaktualizowany.', false, now());
  return true;
end $function$;
revoke all on function public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean) from public, anon, authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_automat()',
       $k$for r in select u.id, u.wynik_log_id from public.akcja_bieg_uczestnicy u$k$,
       $k$for r in select u.id, u.wynik_log_id, u.wynik_dystans_km, u.ukonczony_at from public.akcja_bieg_uczestnicy u$k$),
      (2, 'public.akcja_bieg_automat()',
       $k$is distinct from r.wynik_log_id then n := n + 1; end if;$k$,
       $k$is distinct from r.wynik_log_id then n := n + 1; begin perform public.akcja_bieg_najlepszy_powiadom(r.id, r.wynik_log_id, r.wynik_dystans_km, r.ukonczony_at is not null); exception when others then raise warning 'akcja_bieg_automat: powiadomienie %: %', r.id, sqlerrm; end; end if;$k$),
      (3, 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)',
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;$k$,
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if; if exists (select 1 from public.akcje a where a.slug = b.akcja_slug and a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then return jsonb_build_object('ok', false, 'powod', 'tylko_test'); end if;$k$),
      (4, 'public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)',
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;$k$,
       $k$if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if; if exists (select 1 from public.akcje a where a.slug = b.akcja_slug and a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then return jsonb_build_object('ok', false, 'powod', 'tylko_test'); end if;$k$)
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
  if has_function_privilege('anon', 'public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_automat()', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_automat()', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)', 'execute') then
    raise exception 'akcja_bieg (20261211): uprawnienia inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

commit;
notify pgrst, 'reload schema';
