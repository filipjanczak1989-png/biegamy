-- BIEG WIRTUALNY: wynik po usunięciu albo zmianie treningu, który był wynikiem (usterka z produkcji 18.11). NIE wykonywać przed 20261209.
-- ⚠️ Zmienia decyzję z 20261203 (16–17.11): „trening usunięty po zaliczeniu (wynik_log_id → NULL)” był celowo wynikiem ręcznym z dyplomem; decyzja Filipa 18.11:
--   wynik bez treningu znika. Regulamin biegu tego nie obiecywał. Test tools/akcja-bieg-ranking-gps-test.sql (krok 7) przepisany na nowe zachowanie.
-- Usterka: akcja_bieg_uczestnicy.wynik_log_id → training_logs ON DELETE SET NULL zerował tylko odnośnik; czas, dystans i ukończenie zostawały, więc po usunięciu
--   treningu w kalendarzu wynik (i dyplom) dalej był na liście „ukończyli”. Odczyt 18.11 18:48 (transakcja tylko do odczytu, wycofana): 1 taki zapis, bieg próbny
--   proba-bieg, numer 1; bieg-mikolajki: 0.
-- 1. USUNIĘCIE treningu-wyniku (trigger BEFORE DELETE na training_logs, przed SET NULL z klucza obcego): wynik „ja” czyszczony — czas, dystans, ukończenie,
--    wskazanie, weryfikacja; dyplom znika (bez ukończenia), odznaka w kolekcji i znacznik odznaki zostają. Bez „wynik usunięty” (to decyzja organizatora):
--    automat (cron :25) albo wejście na stronę mogą potem wziąć inny pasujący trening z okresu biegu.
-- 2. ZMIANA treningu-wyniku (AFTER UPDATE dystansu, czasu, daty albo typu): wynik przeliczany z nowych danych tą samą funkcją co automat
--    (akcja_bieg_wynik_z_treningu) z TEGO SAMEGO treningu; wskazanie przez zawodnika bez zmian (wynik z automatu zostaje automatowi, który jak dotąd może
--    potem wziąć lepszy trening). Trening już nie pasuje → wynik czyszczony jak w 1. Decyzję organizatora o weryfikacji przy zmianie wyniku kasuje jak dotąd trigger z 20261206
--    (akcja_bieg_weryfikacja_od_nowa: „decyzja dotyczy tego jednego wyniku”).
-- 3. Wynik zaliczony ręcznie przez organizatora (bez treningu, zaliczony_przez) i ukończenie dziecka: bez zmian.
-- 4. JEDNORAZOWO: wiszące wyniki „ja” (ukończenie bez treningu i bez zaliczenia przez organizatora, bez „wynik usunięty”) czyszczone jak w 1
--    (akcja_bieg_wiszace_wyczysc(), zostaje do testu). Licznik ulicy liczy treningi, nie wyniki: suma km i procent bez zmian.
-- Test po skutku: tools/akcja-bieg-trening-wynik-test.sh (przed wdrożeniem AKCJA_BIEG_TRENING_Z_MIGRACJA=1).
-- Wycofanie: 20261212_WYCOFANIE_akcja_bieg_wynik_bez_treningu.sql (triggery i funkcje; wyczyszczonych wyników nie przywraca — nie miały treningu).
begin;

create function public.akcja_bieg_wynik_wyczysc(p_uczestnik uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update public.akcja_bieg_uczestnicy
     set ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false,
         weryfikacja = null, weryfikacja_at = null, weryfikacja_przez = null
   where id = p_uczestnik and rodzaj = 'ja' and zaliczony_przez is null;
$function$;

create function public.akcja_bieg_trening_usuniety()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r record;
begin
  for r in select u.id from public.akcja_bieg_uczestnicy u where u.wynik_log_id = old.id and u.rodzaj = 'ja' loop
    perform public.akcja_bieg_wynik_wyczysc(r.id);
  end loop;
  return old;
end $function$;

create function public.akcja_bieg_trening_zmieniony()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r record; v jsonb;
begin
  for r in select u.id, u.wynik_wskazany from public.akcja_bieg_uczestnicy u
            where u.wynik_log_id = new.id and u.rodzaj = 'ja' and u.wycofany_at is null loop
    v := public.akcja_bieg_wynik_z_treningu(r.id, new.id);   -- ten sam trening z nowymi danymi; decyzję o weryfikacji przy zmianie wyniku kasuje trigger z 20261206
    if not coalesce((v->>'ok')::boolean, false) then perform public.akcja_bieg_wynik_wyczysc(r.id);
    elsif not r.wynik_wskazany then update public.akcja_bieg_uczestnicy set wynik_wskazany = false where id = r.id;   -- p_log_id ustawia „wskazany”: wynik z automatu zostaje automatowi
    end if;
  end loop;
  return null;
end $function$;

create function public.akcja_bieg_wiszace_wyczysc()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r record; n integer := 0;
begin
  for r in select u.id from public.akcja_bieg_uczestnicy u
            where u.rodzaj = 'ja' and u.ukonczony_at is not null and u.wynik_log_id is null and u.zaliczony_przez is null and u.wynik_usuniety_at is null loop
    perform public.akcja_bieg_wynik_wyczysc(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

revoke all on function public.akcja_bieg_wynik_wyczysc(uuid) from public, anon, authenticated;
revoke all on function public.akcja_bieg_trening_usuniety() from public, anon, authenticated;
revoke all on function public.akcja_bieg_trening_zmieniony() from public, anon, authenticated;
revoke all on function public.akcja_bieg_wiszace_wyczysc() from public, anon, authenticated;

create trigger trg_akcja_bieg_trening_usuniety before delete on public.training_logs
  for each row execute function public.akcja_bieg_trening_usuniety();
create trigger trg_akcja_bieg_trening_zmieniony after update of distance_km, duration, logged_at, training_type, external_type on public.training_logs
  for each row when (old.distance_km is distinct from new.distance_km or old.duration is distinct from new.duration or old.logged_at is distinct from new.logged_at
                     or old.training_type is distinct from new.training_type or old.external_type is distinct from new.external_type)
  execute function public.akcja_bieg_trening_zmieniony();
create index if not exists akcja_bieg_uczestnicy_wynik_log_idx on public.akcja_bieg_uczestnicy (wynik_log_id) where wynik_log_id is not null;

select public.akcja_bieg_wiszace_wyczysc();

do $kontrola$
begin
  if exists (select 1 from public.akcja_bieg_uczestnicy u where u.rodzaj = 'ja' and u.ukonczony_at is not null and u.wynik_log_id is null and u.zaliczony_przez is null and u.wynik_usuniety_at is null) then
    raise exception 'akcja_bieg (20261212): zostały wiszące wyniki, nic nie zmieniam';
  end if;
  if has_function_privilege('anon', 'public.akcja_bieg_wiszace_wyczysc()', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_wiszace_wyczysc()', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_wynik_wyczysc(uuid)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_wynik_wyczysc(uuid)', 'execute') then
    raise exception 'akcja_bieg (20261212): funkcje dostępne z przeglądarki, nic nie zmieniam';
  end if;
end $kontrola$;

commit;
notify pgrst, 'reload schema';
