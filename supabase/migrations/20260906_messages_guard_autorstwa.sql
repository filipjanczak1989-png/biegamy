-- Recall podmienia CUDZA tresc — trigger, bo warunek zalezy od KOLUMNY.
--
-- DZIURA: `messages_update` ma warunek `user_has_msg_access(athlete_id)`, ktory
-- jest SYMETRYCZNY (wlasciciel konta LUB jego trener) i NIE PATRZY na `sender`.
-- Recall (`recallMsg` / `recallCoachMsg`) robi UPDATE na `body`, wiec zawodnik
-- mogl podmienic tresc wiadomosci TRENERA i odwrotnie — a w watku zostaloby
-- zdanie, ktorego autor nigdy nie napisal. Bronil tego wylacznie `if` w kliencie
-- (`if (isAthlete !== 'true') return;`), a klucz anon jest jawny w zrodle.
-- 464 wiersze.
--
-- ⚠️ TO JEST GORSZE NIZ KASOWANIE, ktore zamknelismy godzine wczesniej.
--    Skasowanie usuwa czyjs zapis — widac, ze go nie ma. Podmiana zostawia
--    zdanie W CUDZYM IMIENIU i nic tego nie odroznia od oryginalu.
--
-- ⚠️ DLACZEGO TRIGGER, A NIE WARUNEK `sender` W POLITYCE — sprawdzone
--    w kliencie przed decyzja. `messages_update` obsluguje DWIE rzeczy
--    o PRZECIWNYCH kierunkach:
--        body  (recall)      : autor zmienia SWOJA wiadomosc
--          trener.html:5641  sender='coach'    <- swoja
--          zawodnik.html:3974 sender='athlete' <- swoja
--        read  (przeczytane) : odbiorca oznacza CUDZA wiadomosc
--          trener.html:5484  .eq('sender','athlete') <- cudza
--          zawodnik.html:3894 .eq('sender','coach')  <- cudza
--    Polityka zawezona do `sender` zepsulaby oznaczanie przeczytanych — bo tam
--    kazdy dotyka WLASNIE cudzego wiersza. RLS zaweza WIERSZE, a tu dozwolony
--    wiersz zalezy od tego, KTORA KOLUMNE sie zmienia. Tego sie w polityce
--    nie wyrazi. Trzeci trigger tej samej rodziny co `trainings` i `training_logs`.

create or replace function public.messages_guard_autorstwa()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
  autor boolean;
  zmienione text[] := '{}';
begin
  -- Brak JWT => service_role albo SQL admina.
  if uid is null then return new; end if;

  -- AUTOREM jest ten, kto ma role zgodna z `sender` tego wiersza.
  select (old.sender = 'athlete' and exists (select 1 from athletes a
            where a.id = old.athlete_id and a.user_id = uid))
      or (old.sender = 'coach' and exists (select 1 from athletes a
            where a.id = old.athlete_id and a.coach_id = uid))
    into autor;

  -- TOZSAMOSC WIADOMOSCI jest nietykalna dla obu stron. `sender` w szczegolnosci:
  -- jego podmiana przepisalaby autorstwo calej wiadomosci jednym UPDATE-em.
  if new.id         is distinct from old.id         then zmienione := array_append(zmienione, 'id'); end if;
  if new.athlete_id is distinct from old.athlete_id then zmienione := array_append(zmienione, 'athlete_id'); end if;
  if new.sender     is distinct from old.sender     then zmienione := array_append(zmienione, 'sender'); end if;
  if new.sent_at    is distinct from old.sent_at    then zmienione := array_append(zmienione, 'sent_at'); end if;

  -- TRESC — tylko autor. To jest cala tresc tej migracji.
  if new.body is distinct from old.body and not autor then
    zmienione := array_append(zmienione, 'body');
  end if;

  -- `read` ZOSTAJE WOLNE i to jest swiadome: oznacza je ODBIORCA, czyli zawsze
  -- na CUDZYM wierszu. RLS juz sprawdzil, ze ma dostep do tej rozmowy.

  if array_length(zmienione, 1) is null then return new; end if;

  raise exception 'W cudzej wiadomosci wolno oznaczyc tylko przeczytanie. Odrzucone: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Wlasna wiadomosc mozesz cofnac; cudzej nie zmieniasz.';
end;
$fn$;

comment on function public.messages_guard_autorstwa() is
  'Chroni autorstwo w public.messages. `body` moze zmienic WYLACZNIE autor '
  '(zgodnosc `sender` z rola piszacego); `id`, `athlete_id`, `sender`, `sent_at` '
  'nikt poza service_role; `read` wolne, bo oznacza je ODBIORCA na cudzym wierszu. '
  'Powod: messages_update ma warunek user_has_msg_access, symetryczny i slepy na '
  '`sender`, a dozwolony wiersz zalezy tu od KOLUMNY — czego RLS nie wyrazi.';

drop trigger if exists trg_messages_guard_autorstwa on public.messages;
create trigger trg_messages_guard_autorstwa
  before update on public.messages
  for each row execute function public.messages_guard_autorstwa();

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026 ═════════════════════════════════════
--   1. trener podmienia `body` wiadomosci ZAWODNIKA   ODMOWA 42501: body
--   2. zawodnik podmienia `body` wiadomosci TRENERA    ODMOWA 42501: body
--   3. recall WLASNEJ wiadomosci, obie strony          PRZESZLO
--   4. oznaczenie CUDZEJ jako przeczytanej, obie       PRZESZLO (1 wiersz)
--   5. podmiana `sender` (przepisanie autorstwa)       ODMOWA 42501: sender
--
-- ⚠️ PIERWSZE PODEJSCIE DO TESTU 2 NIC NIE ZMIERZYLO — i to jest trzeci
--    wariant tej samej pulapki w ciagu doby. Wiadomosc zawodnika i wiadomosc
--    trenera wybralem DWOMA osobnymi `limit 1`, wiec trafily w ROZNE WATKI.
--    RLS (`user_has_msg_access`) odcial zapytanie, UPDATE zmienil 0 wierszy
--    i nie bylo ani bledu, ani wyniku — a to wyglada jak „przeszlo bez
--    odmowy". Test musi brac OBIE wiadomosci z JEDNEGO watku, inaczej mierzy
--    zasieg RLS zamiast dzialania triggera.
--    Poprzednie dwa warianty tego samego: posilek trenera zamiast cudzego
--    (dieta) i log trenera zamiast cudzego (training_logs).
