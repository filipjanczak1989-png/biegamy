// Nazwy miesięcy kart udostępniania (share-card). Jedna tablica w MIANOWNIKU — z niej podpis („PAŹDZIERNIK 2026")
// i etykieta porównania („vs WRZESIEŃ"). Etykieta szła wcześniej z drugiej tablicy w dopełniaczu („vs WRZEŚNIA");
// zgłoszenie Maćka 1.11.2026: ma być mianownik. Pilnuje tests/blizna-70-karta-miesiac.test.js.
export const MIESIACE_MIANOWNIK = ["STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC",
  "LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ"];

/** mies 0–11 (miesiąc karty) → „vs <POPRZEDNI W MIANOWNIKU>"; styczeń porównuje z grudniem. */
export function etykietaPorownania(mies) {
  return `vs ${MIESIACE_MIANOWNIK[(mies + 11) % 12]}`;
}
