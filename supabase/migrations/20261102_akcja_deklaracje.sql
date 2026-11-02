-- DEKLARACJE SPONSORÓW + ODZNAKA akcja-sponsor (projekt F, finał zasad Filipa 2.11 15:16).
--   akcja_deklaruj(slug, stawka_gr)   — zapis/zmiana własnej stawki w groszach za kilometr akcji, WYŁĄCZNIE w oknie akcji
--                                       (po starcie, do dnia zamknięcia włącznie; akcja testowa — tylko jej konta testowe);
--                                       w TEJ SAMEJ transakcji przyznaje odznakę akcja-sponsor (achievements, on conflict nic).
--   akcja_wycofaj_deklaracje(slug)    — usuwa własną deklarację (w oknie). ODZNAKA ZOSTAJE na zawsze — achievements nietknięte.
-- Formularz (bez zmian, decyzja Filipa): „Wpłacasz sam na oficjalną zbiórkę po zakończeniu akcji. Aplikacja tylko liczy."
-- Aplikacja nie zbiera pieniędzy: deklaracja to liczba, publiczna jest suma stawek i liczba sponsorów (akcja_licznik), nigdy osoby.
-- Rola anonimowa: nic. Zapis do akcja_sponsorzy z przeglądarki: nadal brak (tylko te RPC).
begin;

create function public.akcja_deklaruj(p_slug text, p_stawka_gr integer)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_deklaruj: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then raise exception 'akcja_deklaruj: nie ma takiej akcji' using errcode = '22023'; end if;
  if p_stawka_gr is null or p_stawka_gr < 1 or p_stawka_gr > 10000 then
    raise exception 'akcja_deklaruj: stawka % gr poza zakresem 1–10000', p_stawka_gr using errcode = '22023'; end if;
  if a.wystartowala_at is null or v_dzis < a.start or (a.koniec is not null and v_dzis > a.koniec)
     or (a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then
    raise exception 'akcja_deklaruj: poza oknem akcji' using errcode = '22023'; end if;
  insert into public.akcja_sponsorzy (akcja_id, athlete_id, stawka_gr) values (a.id, v_ja, p_stawka_gr)
    on conflict (akcja_id, athlete_id) do update set stawka_gr = excluded.stawka_gr;
  insert into public.achievements (athlete_id, badge_id) values (v_ja, 'akcja-sponsor')
    on conflict (athlete_id, badge_id) do nothing;
  return public.akcja_moj_wklad(p_slug);
end $fn$;

create function public.akcja_wycofaj_deklaracje(p_slug text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_wycofaj_deklaracje: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then raise exception 'akcja_wycofaj_deklaracje: nie ma takiej akcji' using errcode = '22023'; end if;
  if a.wystartowala_at is null or v_dzis < a.start or (a.koniec is not null and v_dzis > a.koniec) then
    raise exception 'akcja_wycofaj_deklaracje: poza oknem akcji' using errcode = '22023'; end if;
  delete from public.akcja_sponsorzy where akcja_id = a.id and athlete_id = v_ja;
  -- ⚠️ achievements NIETKNIĘTE: odznaka akcja-sponsor zostaje po wycofaniu (decyzja Filipa 2.11)
  return public.akcja_moj_wklad(p_slug);
end $fn$;

revoke all on function public.akcja_deklaruj(text, integer) from public, anon, authenticated;
revoke all on function public.akcja_wycofaj_deklaracje(text) from public, anon, authenticated;
grant execute on function public.akcja_deklaruj(text, integer) to authenticated;
grant execute on function public.akcja_wycofaj_deklaracje(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.akcja_deklaruj(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.akcja_wycofaj_deklaracje(text)', 'execute') then raise exception 'deklaracje: anon ma EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_deklaruj(text,integer)', 'execute') then raise exception 'deklaracje: brak EXECUTE'; end if;
  if has_table_privilege('authenticated', 'public.akcja_sponsorzy', 'insert,update,delete') then raise exception 'deklaracje: zapis z przeglądarki'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
