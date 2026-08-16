-- ─────────────────────────────────────────────────────────────────────────────
-- training-screenshots: limit 30 MB → 2 MB.
--
-- ZMIERZONE na 1772 plikach (16.08.2026):
--   mediana 186 kB · p90 489 kB · p99 694 kB · max 18 MB
-- Limit 2 MB odcina 2 pliki na 1772 — patologię, nie użytkownika. Zapas nad p99
-- jest prawie trzykrotny, więc typowy zrzut z zegarka nie ma jak w niego trafić.
--
-- Klient i tak skaluje zdjęcia przez prepUpload(file, 1600, 0.85) — 2 MB to
-- bariera na wypadek, gdy skalowanie się nie powiedzie albo ktoś ominie klienta.
--
-- ⚠️ NIE ZMIENIAMY LISTY MIME. To NIE jest przeoczenie ani rzecz „do dokończenia":
--
--    Kubełek dopuszcza `video/mp4` i `video/quicktime`, i wygląda to na dziurę.
--    Zmierzone: plików wideo jest DOKŁADNIE JEDEN — `.mov`, 17,5 MB, z 08.05.2026,
--    i jest ODWOŁANY przez log treningowy, czyli to czyjś prawdziwy załącznik,
--    nie śmieć. Limit 2 MB i tak zamyka tę drogę.
--
--    ⚠️ NATOMIAST `audio/webm` MUSI ZOSTAĆ. Wygląda na część tej samej rodziny,
--    ale to 27 plików `voice_*.webm` — WIADOMOŚCI GŁOSOWE Z CZATU. Zdjęcie go
--    z listy zabiłoby działającą funkcję. Wcześniejszy pomiar mówił „28 plików
--    wideo, wzorzec nie wypadek" — w rzeczywistości to 27 nagrań głosowych
--    i jeden przypadek.
--
--    Decyzja (Filip, 16.08.2026): blokada MIME rozwiązywałaby problem, którego
--    nie ma, i groziła zabiciem wiadomości głosowych. Nie dokańczać tego.
--
-- ⚠️ LIMIT NIE DOTYKA ODCZYTU — sprawdzone obserwacją przed wdrożeniem, nie
--    z dokumentacji. Kubełek z limitem 1 MB nadal podawał plik 8 372 707 B:
--    `HTTP 200`, `Content-Length: 8372707`, a range na ostatnie bajty zwrócił
--    `206`. Czyli 2 pliki powyżej nowego limitu zostają czytelne.
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
   set file_size_limit = 2 * 1024 * 1024
 where name = 'training-screenshots';
