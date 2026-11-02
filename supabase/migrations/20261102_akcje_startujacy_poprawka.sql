-- POPRAWKA 20261102_akcje.sql — startujący i konto testowe były ZAMIENIONE (zgłoszenie Filipa 2.11: odmowa na
-- start-akcji.html na głównym koncie).
--
-- Błąd: przyjąłem, że konto z e-mailem „biegamy.run" to konto trenera, a konto z imieniem to persona testowa.
-- Odwrotnie. Zwiad 2.11 (bez e-maili):
--   56092926-… (user bd9cbbac-…) — w coaches, 21 zawodników, 219 logów, intervals; wskazuje je też wyzwalacz
--                                  notify_filip_new_athlete (_filip_coach / _filip_athlete) → GŁÓWNE konto Filipa;
--   9c2df65c-… (user 1dfb3b79-…) — nie w coaches, 0 zawodników, 2 logi, 1 trening, 49 zapytań okienka (testy z
--                                  tokenem) → KONTO TESTOWE. Inne konta: 0 zapytań okienka — nie są kandydatami.
-- Skutek błędu: guzik odmawiał Filipowi (42501), a próba liczyłaby kilometry głównego konta.
-- Stan przed poprawką: żadna akcja nie wystartowała (wystartowala_at = null dla obu).
-- Lekcja: konto wskazujemy po FAKTACH w bazie (coaches, zawodnicy, wyzwalacze), nie po e-mailu.
begin;

update public.akcja_startujacy s
   set athlete_id = '56092926-2cf1-44b6-952f-38614497fdc2'
  from public.akcje a
 where a.id = s.akcja_id and a.slug in ('dla-fabianka', 'proba')
   and s.athlete_id = '9c2df65c-6a46-410e-ad5f-474e5d973ec9';

update public.akcje
   set konta_testowe = array['9c2df65c-6a46-410e-ad5f-474e5d973ec9'::uuid]
 where slug = 'proba';

do $$
declare v_glowny constant uuid := '56092926-2cf1-44b6-952f-38614497fdc2';
begin
  if (select count(*) from public.akcja_startujacy s join public.akcje a on a.id = s.akcja_id
       where a.slug in ('dla-fabianka', 'proba') and s.athlete_id = v_glowny) <> 2 then
    raise exception 'poprawka: główne konto nie jest startującym obu akcji'; end if;
  if exists (select 1 from public.akcja_startujacy s join public.akcje a on a.id = s.akcja_id
              where a.slug in ('dla-fabianka', 'proba') and s.athlete_id <> v_glowny) then
    raise exception 'poprawka: zostało inne konto startujące'; end if;
  if not exists (select 1 from public.athletes t join public.coaches c on c.id = t.user_id where t.id = v_glowny) then
    raise exception 'poprawka: startujący nie jest w coaches'; end if;
  if (select count(*) from public.athletes z where z.coach_id = (select user_id from public.athletes where id = v_glowny)) < 1 then
    raise exception 'poprawka: startujący nie ma zawodników'; end if;
  if (select konta_testowe from public.akcje where slug = 'proba') is distinct from array['9c2df65c-6a46-410e-ad5f-474e5d973ec9'::uuid] then
    raise exception 'poprawka: konta_testowe próby'; end if;
  if exists (select 1 from public.akcje where slug = 'proba' and v_glowny = any(konta_testowe)) then
    raise exception 'poprawka: główne konto w kontach testowych'; end if;
  if exists (select 1 from public.athletes t join public.coaches c on c.id = t.user_id
              where t.id = '9c2df65c-6a46-410e-ad5f-474e5d973ec9') then
    raise exception 'poprawka: konto testowe jest trenerem — sprawdź założenia'; end if;
end $$;

commit;
