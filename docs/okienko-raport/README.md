# docs/okienko-raport — raporty nocy Okienka

Pisze je workflow `okienko-noc` (02:00 UTC) narzędziem `tools/okienko-raport-dnia.mjs`: ławka v2 na żywo, prawdziwe pytania z wczoraj
(👎 z komentarzem, reakcje, samosprawdzenie=false, awarie, czasy > 3 s) z pytaniem → ścieżką → odpowiedzią, ocena sędziego, kandydaci
do ławki. Repo jest PUBLICZNE: każdy tekst z logu przechodzi anonimizację (`tools/_anonimizuj.mjs`: imiona i nazwiska → [OSOBA], e-maile
i telefony usunięte, osoby = pseudonimy na jeden raport), a blizna-125 skanuje każdy raport przed commitem. Raport nie zmienia kodu ani
nie wdraża — poranna pętla: „przeczytaj raport okienka i przygotuj poprawki” → gałąź `okienko/poprawki-RRRR-MM-DD` → OK Filipa.
Plik `.alarm` (nieśledzony) sygnalizuje spadek ≥ 2 pkt % albo regresję → issue.
