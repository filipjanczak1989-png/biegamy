# Warstwa 1 — sześć elementów. KOMPLETNA od 17.08.2026

Wykaz istnieje po to, żeby nie odtwarzać go z pamięci. Trzy razy w sierpniu
padło pytanie „które to są" i trzy razy trzeba było zgadywać z zawartości
`tools/` — a tam leżą też rzeczy spoza tej listy.

⚠️ **To jest wykaz, nie spis katalogu.** Warstwa 1 to sześć **odpowiedzi na
pytania**, nie sześć plików. Kilka z nich mieszka w więcej niż jednym miejscu.

| # | element | pytanie, na które odpowiada | gdzie żyje | stan |
|---|---|---|---|---|
| 1 | **Pamięć projektu** | „czego już się nauczyliśmy i czego nie wolno powtórzyć" | `.ai/LEKCJE.md` (15 lekcji), zaległości, `.ai/feedback-maciej-14-08.md` | ✅ |
| 2 | **Rollback z telefonu** | „jak cofnąć wdrożenie, gdy nie mam laptopa" | `.github/workflows/rollback.yml` | ✅ przetestowany 15.08 w trzech ścieżkach |
| 3 | **Testy z blizn** | „czy to, co już raz padło, padnie znowu" | `tests/` (**378 testów w 63 zestawach**), `testy.yml` w CI | ✅ każdy test odpowiada realnemu błędowi |
| 4 | **Kolejka błędów z produkcji** | „co realnie psuje się u ludzi" | `tools/przeglad-bledow.js`, grupowanie po usterce | ✅ |
| 5 | **Blast radius** | „czy ta zmiana może zrobić krzywdę szerzej, niż widzę" | `tools/bramka-commit.js` + `tools/bramka-reguly.js`, hook lokalny + `bramka.yml` w CI | ✅ test negatywny wykonany |
| 6 | **Tablica wyników** | „co poszło na produkcję i co się po tym psuło" | `tools/ledger.js`, `.ai/ledger/` | ✅ pierwszy raport 17.08 |

## Co NIE jest elementem warstwy 1

`tools/sprawdz-run-types.py`, `tools/sprawdz-spol-stale.py`,
`tools/pomiar-odznaka-wyzwania.sql`, `tools/sprawdz-pb-walidacja.js`,
`tools/bramka-karta.js`, `tools/build-ef.js`.

To bramki i pomiary powstałe **przy okazji** konkretnych robót. Należą do tej
samej warstwy myślenia — mierzyć zamiast zakładać — ale nie są elementami
pierwotnej szóstki i nie należy ich do niej doliczać przy odpowiedzi
„ile z sześciu".

⚠️ **Liczba testów jest ZMIERZONA, nie przepisana.** `node --test tests/*.test.js`
z 18.08.2026 zwraca `tests 378 · suites 63 · pass 378 · fail 0`. W obiegu krążyła
liczba **434** — nie potwierdza jej ani runner, ani policzenie wywołań `test()`
w plikach (216, bo część zestawów jest tabelaryczna). Przy aktualizacji tego
wykazu **uruchomić runner**, nie przepisywać z pamięci; to ta sama pułapka co
[[LEKCJE]] #13 (pomiar, który wygląda na dowód, a liczby się nie zgadzają).

ⓘ Drobiazg wykonawczy: `node --test tests/` (katalog) kończy się błędem,
działa forma z globem — `node --test tests/*.test.js`, i tak robi to `testy.yml`.

## Zasady, które warstwa 1 wymusza na sobie samej

⚠️ **Narzędzie do mierzenia nie może popełniać błędów, które ma wykrywać.**
Dwa przypadki złapane w praktyce:

- `ledger.js` przy pierwszym uruchomieniu pokazał „zero zgłoszeń" przy 65
  wierszach w bazie. Wyłapało to ostrzeżenie o zerze, które sam w nim stoi
  ([[LEKCJE]] #10). Powód zapisany w komentarzu przy tej linii.
- Sekcja korelacji deploy↔błąd w `ledger.js` niesie zastrzeżenie **w nagłówku**,
  nie w czyjejś głowie — inaczej byłaby dokładnie [[LEKCJE]] #11 (wskaźnik
  zastępczy podany jako pomiar). Dotyczy to też słowa „deploy": to commit
  `bump SW cache`, czyli „workflow się dokończył", a nie „kod dotarł do ludzi".

⚠️ **Praca człowieka nie może zostać cicho zjedzona przez narzędzie.**
`ledger.js --zapisz` odmawia nadpisania raportu, w którym ktoś coś dopisał;
skasowanie dopisków wymaga jawnego `--nadpisz`.

⚠️ **Raporty trafiają do publicznego repo.** `.ai/` jest śledzone, a Pages
serwuje pliki z kropką (odnotowuje to sam `.gitignore`: `/.gitignore → 200`).
Dlatego `ledger.js` ma barierę PII, która **wstrzymuje cały raport** przy
trafieniu na e-mail, UUID albo pełny adres.

## Retencja

`.ai/ledger/` rośnie o jeden plik tygodniowo, ~2,6 kB każdy. Rok to ~140 kB
w repo, gdzie `zawodnik.html` waży 900 kB — **nie kasujemy nic**. Wartość
ledgera leży w długiej serii: pytanie „czy w sierpniu psuło się więcej niż
w maju" da się zadać tylko wtedy, gdy maj nadal jest.

⚠️ Próg, przy którym to przestanie działać, to **czytelność, nie rozmiar**:
przy ~30 plikach nikt nie przejrzy katalogu wzrokiem. Odpowiedzią będzie wtedy
plik indeksu (jedna linia na tydzień), a nie kasowanie starych raportów.
