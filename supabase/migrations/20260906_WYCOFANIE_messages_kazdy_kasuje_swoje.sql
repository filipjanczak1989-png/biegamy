-- WYCOFANIE 20260906_messages_kazdy_kasuje_swoje.sql
--
-- ⚠️ CO WRACA: trener znowu kasuje CALY watek, lacznie z wiadomosciami
--    zawodnika o kontuzji i gorszym tygodniu. Zawodnik znowu nie kasuje NIC —
--    jego przycisk wraca do pytania o potwierdzenie i niekasowania zera wierszy.
--    464 wiersze. Jesli wycofujesz swiadomie, cofnij tez teksty w confirm
--    (trener.html: clearCoachChat, zawodnik.html: clearAllMessages) — inaczej
--    beda obiecywac zachowanie, ktorego juz nie ma.

drop policy if exists "messages_delete_athlete" on public.messages;

alter policy "messages_delete" on public.messages
  using (athlete_id in (select athletes.id from athletes where athletes.coach_id = auth.uid()));
