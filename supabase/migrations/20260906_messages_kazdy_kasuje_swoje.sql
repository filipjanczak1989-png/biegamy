-- Kazdy kasuje SWOJE wiadomosci. Do 6.09.2026 kasowal trener — wszystkie.
--
-- STAN PRZED, zmierzony:
--   `messages` ma JEDNA polityke DELETE i jest ona TRENERSKA:
--       messages_delete : athlete_id IN (moi podopieczni)   — BEZ warunku na `sender`
--   Skutki byly dwa i oba zle:
--     • trener kasowal CALY watek, lacznie z wiadomosciami zawodnika
--       (trener.html: clearCoachChat, confirm "Usunac cala historie czatu?"),
--     • zawodnik NIE KASOWAL NIC. Jego przycisk (zawodnik.html: clearAllMessages)
--       filtruje poprawnie `sender='athlete'`, ale zadna polityka go nie
--       przepuszczala — kasowal ZERO wierszy, po zapytaniu o potwierdzenie
--       destrukcyjnej akcji. RLS oddaje 200 z pusta tablica, nie 403, wiec
--       ekran nie mial jak tego pokazac.
--   464 wiersze.
--
-- ⚠️ DLACZEGO ROZDZIAL PO `sender`, A NIE ZAKAZ DLA TRENERA. Zawodnik pisze
--    o kontuzji, o gorszym tygodniu, o rzeczach osobistych. To JEGO zapis,
--    nie wspolny — i dokladnie tak samo jest z zapisem trenera. Symetria nie
--    jest tu estetyczna: obie strony maja miec te sama mozliwosc i te sama
--    granice. Decyzja Filipa z 6.09.2026: KAZDY KASUJE SWOJE.
--
-- ⚠️ RECALL DZIALA PO OBU STRONACH i to bylo warunkiem tej zmiany.
--    `recallMsg` (zawodnik.html) i `recallCoachMsg` (trener.html) robia UPDATE
--    na `messages_update` = `user_has_msg_access`, ktore jest symetryczne
--    (wlasciciel LUB trener). Gdyby recall mial tylko trener, "kasuj wszystkie"
--    byloby jedyna droga zawodnika do wycofania pomylki i zawezenie DELETE
--    odebraloby mu ja bez zamiennika. Sprawdzone przed wykonaniem.
--
-- ⚠️ `sender` TRZYMA 'athlete'/'coach', NIE uid — wiec warunek nie moze brzmiec
--    `sender = auth.uid()`. Role rozstrzyga zlaczenie z `athletes`: kto jest
--    wlascicielem konta, kasuje wiadomosci zawodnika; kto jest jego trenerem —
--    wiadomosci trenera.

-- trener: tylko swoje
alter policy "messages_delete" on public.messages
  using (sender = 'coach'
         and athlete_id in (select a.id from athletes a where a.coach_id = auth.uid()));

-- zawodnik: tylko swoje (polityki DELETE dla niego NIE BYLO WCALE)
drop policy if exists "messages_delete_athlete" on public.messages;
create policy "messages_delete_athlete" on public.messages
  for delete to authenticated
  using (sender = 'athlete'
         and athlete_id in (select a.id from athletes a where a.user_id = auth.uid()));

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026 ═════════════════════════════════════
-- Watek: 31 wiadomosci trenera + 38 zawodnika (podopieczny Filipa, nie on sam).
-- Podszycie sie pod uzytkownika w transakcji z rollbackiem; bez
-- `set local role authenticated` test lecialby jako postgres z rolbypassrls
-- i swiecil na zielono niezaleznie od tresci polityk.
--
--   1. trener kasuje CALY watek        -> zdjete: coach 31, athlete 0
--      (przed migracja zdjalby wszystkie 69)
--   2. zawodnik kasuje swoje           -> zdjete: 38
--      (przed migracja: 0 — nie mial ZADNEJ polityki DELETE)
--   3. zawodnik probuje kasowac cudze  -> zdjete: 0
--
-- SYMETRIA POTWIERDZONA: kazda strona zdejmuje dokladnie swoje i nie siega
-- cudzych. Teksty w `confirm` po obu stronach maja teraz ten sam ksztalt:
--   trener:   „Usunac swoje wiadomosci? Wiadomosci zawodnika zostana."
--   zawodnik: „Usunac swoje wiadomosci? Wiadomosci trenera zostana."
