// Pojęcia z ekranu Forma dla funkcji Edge (Deno) — KOPIA z window.METRIC_TOOLTIPS w sb.js (tytuł + sekcja „Co to jest"
// bez HTML). sb.js jest źródłem (ten sam tekst widzi zawodnik po tapnięciu „?" na kaflu); tę kopię pilnuje
// tests/blizna-84-okienko-m3-2.test.js — zmiana w sb.js bez zmiany tutaj = czerwony test. Generator: tools/kopie-okienka.js.
// M3-2 (1.11.2026): okienko odpowiada na „jak działa TSB" z tego słownika, 0 tokenów. Haseł bez opisu w aplikacji
// (strefy, interwały, rozbieganie) tu NIE MA — brak opisu = brak hasła, nie piszemy własnych.
// klucze = słowa zapytania, które wskazują hasło (puste = hasło bez własnego słowa-klucza, np. „kalorie", bo „ile spaliłem
// kalorii" to pytanie o liczbę, nie o pojęcie).
export const POJECIA = {
  "tsb": { tytul: "TSB · Forma świeża", klucze: ["tsb","swiezosc","swiezosci"], co_to: "TSB to wskaźnik świeżości Twojej formy. Pokazuje różnicę między długoterminowym treningiem (CTL, ostatnie 6 tygodni) a krótkoterminowym zmęczeniem (ATL, ostatnie 7 dni). Jeśli ostatnio sporo trenowałeś = ATL wysoki = TSB spada. Jeśli odpoczywałeś po build-upie = ATL niski + CTL trzyma = TSB rośnie." },
  "ctl": { tytul: "CTL · Forma długa", klucze: ["ctl"], co_to: "CTL to Twoja forma długoterminowa — średnie obciążenie treningowe z ostatnich ~6 tygodni, ważone w stronę świeższych treningów. Im więcej i regularniej trenujesz, tym wyższe CTL. To pojemność, którą organizm wytrzymuje w trybie ciągłym." },
  "atl": { tytul: "ATL · Zmęczenie", klucze: ["atl"], co_to: "ATL to zmęczenie krótkoterminowe — średnie obciążenie z ostatnich ~7 dni. Reaguje szybko na to co właśnie zrobiłeś. Po ciężkim tygodniu ATL skoczy w górę. Po 2-3 dniach regeneracji szybko spadnie." },
  "trimp": { tytul: "TRIMP · Ile kosztował Cię trening", klucze: ["trimp"], co_to: "Jedna liczba mówiąca, ile organizm zapłacił za dany trening. Bierze pod uwagę trzy rzeczy naraz: jak długo biegłeś, jak ciężko i jak się przy tym czułeś. Dzięki temu godzina truchtu i godzina interwałów przestają wyglądać tak samo — bo nie są tym samym. Dla rzędu wielkości: godzina spokojnego biegu to mniej więcej 50, godzina interwałów około 120, trzygodzinne wybieganie w okolicach 150." },
  "weekly_km": { tytul: "Kilometraż tygodniowy", klucze: ["kilometraz","kilometrazu"], co_to: "Suma kilometrów przebiegniętych w każdym z ostatnich 8 tygodni. Najprostszy wskaźnik objętości treningu." },
  "kalorie": { tytul: "Kalorie spalone", klucze: [], co_to: "Sumaryczny wydatek energetyczny treningów. Liczone z OCR screenów (gdy dostępne) lub szacowane wzorem MET × waga × czas (gdy brak danych z zegarka)." },
  "heatmap": { tytul: "Heatmap · 13 tygodni", klucze: ["heatmap","heatmapa","heatmapy","mapa cieplna","mape cieplna"], co_to: "Heatmap to GitHub-style mapa cieplna — 13 tygodni × 7 dni. Każda komórka = jeden dzień, kolor pokazuje intensywność treningu (TRIMP)." },
  "types_pie": { tytul: "Typy treningów · 7 dni", klucze: [], co_to: "Wykres kołowy pokazujący podział kilometrażu wg typu treningu w ostatnich 7 dniach. Spokojny, tempo, interwały, długi, regeneracja itd." },
  "race_countdown": { tytul: "Odliczanie do startu", klucze: ["odliczanie"], co_to: "Odliczanie do najbliższego startu zapisanego w Twoich celach startowych. Pokazuje nazwę startu + liczbę dni do daty." },
};
