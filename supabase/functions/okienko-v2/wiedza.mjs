// OKIENKO 2.0 — WIEDZA OGÓLNA Z SIECI (Filip 3.11 15:25, „googlowskie było najbardziej doinformowane”; cofa decyzję E2 „porada = model
// bez sieci”). Intencje porada / fakt / zywienie / sprzet → Gemini z googleSearch (ten sam moduł co tryb „siec” v1: ../okienko/siec.mjs,
// bez kopii — blizna-113) z PROMPTEM NA KONKRET (liczby, zakresy, kroki) i STRAŻNIKIEM OGÓLNIKÓW: odpowiedź typu „słuchaj swojego
// ciała” bez liczb → JEDNO ponowienie z instrukcją „podaj liczby/kroki”; nadal ogólnik → krócej (zdania-ogólniki wycięte) + źródła.
// Do sieci trafia WYŁĄCZNIE tekst pytania i data (jak v1). Bramka prywatności (blokadaSieci: nazwiska, fabian*, odmowa) jest W POTOKU
// przed tym modułem i nie zmienia się. Zdrowie (choroba, kontuzja) nie wchodzi tu — stałe teksty z routera/intencji.
import { zOdpowiedziSieci, NIE_ZNALAZLEM } from "../okienko/siec.mjs";

export const INTENCJE_SIECI = ["fakt", "porada", "zywienie", "sprzet"];
export const Z_STRAZNIKIEM = ["porada", "zywienie", "sprzet"];   // fakt bez strażnika: „maraton wygrał X” bez cyfr to nie ogólnik
export const MAX_ZDAN_WIEDZY = 5, MAX_TOK_WIEDZY = 500;
export const DOPISEK_PORADY = "To ogólna wskazówka, nie plan — Twój plan i trener mają pierwszeństwo.";

/* frazy-wytrychy (na tekście bez polskich znaków, małymi) — każda z nich bez konkretu obok = ogólnik */
export const OGOLNIKI = [
  /sluchaj (swojego|swego|wlasnego) (ciala|organizmu)/, /kazdy (organizm|czlowiek|biegacz|przypadek) jest inny/, /zalezy od (wielu|roznych|indywidualnych) czynnikow/,
  /nie ma (jednej|uniwersalnej|prostej|jednoznacznej) (odpowiedzi|recepty|zasady)/, /skonsultuj (sie |to )?z (lekarzem|specjalista|trenerem|dietetykiem)/,
  /warto (pamietac|skonsultowac|obserwowac)/, /najwazniejsz[ae] (jest|to|sa) (umiar|regularnosc|konsekwencja|zdrowy rozsadek)/, /z umiarem/,
  /indywidualn[aey]m? (sprawa|kwestia|podejscie|dobor)/, /obserwuj (swoj|swoje|swoja) (organizm|cialo|samopoczucie|reakcj\w*)/,
  /dostosuj (to )?do (swoich|wlasnych|swoich wlasnych) (potrzeb|mozliwosci|celow)/, /to kwestia indywidualna/, /wszystko zalezy/,
];
/* konkret = liczba albo słowo porządkujące kroki */
export const KONKRET = /\d|\b(najpierw|potem|nastepnie|na koniec|krok|zacznij od|zaczynasz od|np\.|na przyklad|minimum|maksymalnie|co najmniej)\b/;

export const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();

/** ogólnik = odpowiedź BEZ KONKRETU (ani liczby, ani kroków) — fraza-wytrych obok liczb nie dyskwalifikuje (bezOgolnikow ją wytnie, gdy trzeba) */
export function czyOgolnik(zdania) {
  const t = fold((Array.isArray(zdania) ? zdania : []).join(" "));
  if (!t.trim()) return false;
  return !KONKRET.test(t);
}
/** wycina zdania z frazą-wytrychem; gdy nic nie zostaje — pierwsze zdanie (odpowiedź nie może być pusta) */
export function bezOgolnikow(zdania) {
  const z = (Array.isArray(zdania) ? zdania : []).filter((x) => typeof x === "string" && x.trim());
  const czyste = z.filter((x) => !OGOLNIKI.some((r) => r.test(fold(x))));
  return czyste.length ? czyste : z.slice(0, 1);
}

const OPIS_INTENCJI = {
  porada: "To pytanie o trening albo porada ogólna: podaj zasady z liczbami (km, minuty, tempo, procent, liczba dni) i kroki w kolejności.",
  zywienie: "To pytanie o jedzenie lub picie: podaj kcal, gramy, mililitry i czas (np. ile godzin przed startem), wartości na 100 g albo na porcję.",
  sprzet: "To pytanie o sprzęt biegowy: wymień 2–3 konkretne modele albo cechy (drop, amortyzacja, waga) i orientacyjne ceny w złotych, jeśli są w wynikach.",
  fakt: "To pytanie o fakt ze świata biegania: podaj datę, nazwisko, wynik, miejsce.",
};
export function promptWiedzy(dzis, intencja, ponow = false) {
  return [
    `Odpowiadasz biegaczowi amatorowi z Polski na podstawie wyszukiwania w sieci. Dziś jest ${dzis}.`,
    "Piszesz po polsku, 3–5 krótkich zdań, bez emoji, bez wykrzykników, bez formatowania (bez gwiazdek, list i nagłówków).",
    "Użyj Google Search przed odpowiedzią; nie odpowiadaj z pamięci. Każdy fakt i każda liczba musi pochodzić z wyników wyszukiwania.",
    "Bądź KONKRETNY: liczby, zakresy, kroki w kolejności. Nie pisz „słuchaj swojego ciała”, „każdy organizm jest inny”, „to zależy od wielu czynników”, „skonsultuj się ze specjalistą”.",
    OPIS_INTENCJI[intencja] || OPIS_INTENCJI.porada,
    "Nie udzielasz porad medycznych: przy chorobie albo urazie jedno zdanie, że to sprawa dla lekarza lub fizjoterapeuty, i koniec.",
    ponow ? "Poprzednia odpowiedź była ogólnikiem bez liczb. Teraz podaj konkretne liczby, zakresy albo kroki 1, 2, 3 — z wyników wyszukiwania." : "",
  ].filter(Boolean).join("\n");
}

const httpsOk = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const jest = (o) => o.zrodla.length > 0 && o.zdania[0] !== NIE_ZNALAZLEM;

/** @param {{d:{zapytajSiec:Function}, fetchFn:Function, klucz:string, tekst:string, dzis:string, intencja:string}} o
    @returns {Promise<{zdania:string[], zrodla:{tytul:string,url:string}[], tok:{we:number,wy:number}, zapytania:number, proby:number, ponowiono:boolean, ogolnik:boolean, odrzucone:any[]}>} */
export async function szukajWiedzy({ d, fetchFn, klucz, tekst, dzis, intencja }) {
  const raz = async (ponow) => {
    const w = await d.zapytajSiec({ fetchFn, klucz, tekst, dzis, prompt: promptWiedzy(dzis, intencja, ponow), maxOutputTokens: MAX_TOK_WIEDZY });
    return { w, o: zOdpowiedziSieci(w.tekst, w.gm, httpsOk, MAX_ZDAN_WIEDZY) };
  };
  let { w, o } = await raz(false);
  const tok = { we: w.tok.we, wy: w.tok.wy };
  let zapytania = w.zapytania || 0, proby = w.proby || 1, ponowiono = false, ogolnik = false;
  if (Z_STRAZNIKIEM.includes(intencja) && jest(o) && czyOgolnik(o.zdania)) {
    ponowiono = true;
    const r2 = await raz(true);
    tok.we += r2.w.tok.we; tok.wy += r2.w.tok.wy; zapytania += r2.w.zapytania || 0; proby += r2.w.proby || 1;
    if (jest(r2.o)) o = r2.o;
    if (czyOgolnik(o.zdania)) { ogolnik = true; o = { ...o, zdania: bezOgolnikow(o.zdania).slice(0, 2) }; }   // nadal ogólnik → krócej + źródła
  }
  const zdania = jest(o) ? o.zdania.slice() : o.zdania;
  if (jest(o) && intencja === "porada") zdania.push(DOPISEK_PORADY);
  return { zdania, zrodla: o.zrodla, tok, zapytania, proby, ponowiono, ogolnik, odrzucone: o.odrzucone };
}
