# Kalendarz „W Polsce" w races.html (K4, 1.11.2026)

Źródło: projekt M3 v2 pkt 6 + decyzje K2 (cienka warstwa na `wynikiApi`, pamięć 1 h, własna flaga). Okładki kategorii
(K3) i zgłaszanie imprez z celów (K5) — osobno; K5 czeka na decyzję o widoczności zgłoszeń.

- `window.IMPREZY` (sb.js): flaga `IMPREZY_WLACZONE`; lista okresu (30 dni / 3 mies. / rok) = F6 `upcoming_races`
  (`p_from`, `p_to`, `lim 300`; pełne 300 → „uciete", licznik „300+"); szukaj po nazwie i mieście (≥ 3 znaki) =
  `events_search` (K-API 017, `p_limit 20`; lista okresu NIE może iść przez events_search — bez słów zapytania nic nie
  zwraca). Pamięć 1 h w `sessionStorage` (`imprezy:<okres>|<szukaj>`); błędy nie trafiają do pamięci. Dedup z naszymi
  startami (`races` approved): data ±1 i nazwa bez cyfr i polskich znaków.
- `races.html`: sekcja `#imprezy-sekcja` pod listą naszych startów, domyślnie `hidden`, odkrywana po sesji tylko przy
  dostępnym serwerze wyników (ta sama bramka co wyszukiwarka wyników). Nagłówek: prawdziwa liczba po dedupie
  („23 w 30 dni", „5 dla „kotlina""). Wiersz: data (dokładność miesiąca → „listopad 2026"), nazwa, miejscowość,
  dystanse; link „Strona imprezy ›" tylko przez `safeExternalHref {tylkoHttps}` + `rel=noopener` (CLAUDE.md: linki
  zewnętrzne `<a href>` = safeExternalHref; `safeUrlAttr` dopuszcza tylko nasze hosty, więc odrzuciłby strony
  organizatorów). Brak sieci → „Brak połączenia — nie można wczytać kalendarza." (bmStanOffline, blizna-49); inne błędy
  → sekcja znika. Pusto → „Kalendarz maszyny nie ma imprez w tym zakresie."
- `js/wyniki-api.js`: `events_search` na liście dozwolonych RPC (jak Caddy i f6.bramka).
- Testy: blizna-77 (wywołania, pamięć, dedup, awaria, linki), blizna-53 (10 RPC).
