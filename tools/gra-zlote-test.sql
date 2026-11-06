-- ZŁOTE CEGŁY NA PRAWDZIWEJ AKCJI (zgłoszenie testera 6.11), PO SKUTKU na bazie: runda zwykłego konta przez gra_start_rundy i gra_zapisz_wynik,
-- jak front gry (js/cegielki-konto.js). Saldo (złote 1:1), mur (tylko zwykłe cegły), punkty (cegły × mnożnik poziomu), ranking, pułap złotych, km akcji bez zmian.
-- Przed startem akcji gra_aktywna = false: start rundy odmawia („wylaczona”). Test włącza grę tylko w tej transakcji (bez wystartowala_at, więc bez pushu startu).
-- Jedna transakcja, zawsze wycofana (tools/gra-zlote-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; zw uuid; ak uuid; j jsonb; j2 jsonb; r uuid; r2 uuid; poz int; s0 int; s1 int; mur0 bigint; mur1 bigint; km0 text; mn numeric; pkt int; t text;
begin
  select a.user_id, a.id into zw, ak from public.athletes a
   where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  if zw is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  km0 := public.akcja_licznik('dla-fabianka')->>'suma_km';

  -- 1. przed startem (stan produkcji): gra wyłączona, start rundy odmawia i nic nie zapisuje
  update public.akcje set gra_aktywna = false where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_start_rundy(null);
  execute 'reset role';
  if (j->>'powod') is distinct from 'wylaczona' then raise exception 'FAIL 1: przed startem start rundy nie odmawia: %', j; end if;
  n := n + 1;

  -- 2. po starcie: runda 60 s z 3 złotymi i 120 cegłami
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  mur0 := public.gra_mur();
  execute 'set local role authenticated';
  j := public.gra_start_rundy(null);
  execute 'reset role';
  if not coalesce((j->>'ok')::boolean, false) then raise exception 'FAIL 2a: start rundy: %', j; end if;
  r := (j->>'runda')::uuid; s0 := coalesce((j->>'saldo')::int, 0); poz := (j->>'poziom')::int; mn := public.gra_mnoznik_poziomu(poz);
  update public.gra_rundy set start_at = now() - interval '62 seconds' where id = r;   -- runda trwała minutę
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r, 'kasia', 120, 60, jsonb_build_object('zlote', 3, 'salta', 2, 'seria', 4, 'upadki', 0, 'bidony', 0, 'poziom', poz));
  execute 'reset role';
  if not coalesce((j->>'ok')::boolean, false) then raise exception 'FAIL 2b: zapis rundy: %', j; end if;
  s1 := (j->>'saldo')::int; pkt := (j->>'punkty')::int; mur1 := public.gra_mur();
  if s1 - s0 <> 3 then raise exception 'FAIL 3: złote na saldzie % → % (oczekiwane +3)', s0, s1; end if;
  if (select k.saldo from public.gra_konto k where k.athlete_id = ak) <> s1 then raise exception 'FAIL 3b: saldo w odpowiedzi ≠ gra_konto'; end if;
  if mur1 - mur0 <> 120 then raise exception 'FAIL 4: mur % → % (oczekiwane +120, złote nie idą do muru)', mur0, mur1; end if;
  if pkt <> round(120 * mn) then raise exception 'FAIL 5: punkty % (oczekiwane 120 × %)', pkt, mn; end if;
  if not exists (select 1 from public.gra_wyniki w where w.runda_id = r and w.zlote = 3 and w.cegly = 120 and w.punkty = pkt) then raise exception 'FAIL 6: wiersz gra_wyniki'; end if;
  if (j -> 'miejsca') is null or (j -> 'miejsca' -> 'dzien') is null then raise exception 'FAIL 7: brak miejsca w rankingu: %', j -> 'miejsca'; end if;
  n := n + 6;

  -- 3. pułap złotych: ponad 0,5 na sekundę = runda odrzucona, saldo bez zmian
  execute 'set local role authenticated';
  j2 := public.gra_start_rundy(null);
  execute 'reset role';
  r2 := (j2->>'runda')::uuid;
  update public.gra_rundy set start_at = now() - interval '62 seconds' where id = r2;
  execute 'set local role authenticated';
  j2 := public.gra_zapisz_wynik(r2, 'kasia', 100, 60, jsonb_build_object('zlote', 31, 'salta', 0, 'seria', 0, 'upadki', 0, 'bidony', 0, 'poziom', poz));
  execute 'reset role';
  if (j2->>'powod') is distinct from 'podejrzany' or (select k.saldo from public.gra_konto k where k.athlete_id = ak) <> s1 then raise exception 'FAIL 8: 31 złotych w minutę przeszło: %', j2; end if;
  n := n + 1;

  -- 4. licznik km akcji bez zmian
  if public.akcja_licznik('dla-fabianka')->>'suma_km' is distinct from km0 then raise exception 'FAIL 9: gra zmieniła km akcji'; end if;
  n := n + 1;

  t := format('saldo %s → %s (złote +3, mnożnik 1), mur %s → %s (+120 zwykłych, złote 0), punkty %s = 120 × %s (poziom %s), miejsce dziś %s',
              s0, s1, mur0, mur1, pkt, mn, poz, j -> 'miejsca' -> 'dzien' ->> 'miejsce');
  raise exception 'TESTY ZLOTYCH ZIELONE: % asercji | %', n, t;
end $T$;
