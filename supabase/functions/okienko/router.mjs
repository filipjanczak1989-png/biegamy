// OKIENKO (M1 krok 2) — router bez modelu: tekst → narzędzie z argumentami albo sama nawigacja. 0 tokenów.
// Pierwsza reguła wygrywa (kolejność jak w M1-okienko-wykonanie.md pkt 5). Normalizacja: małe litery, bez polskich
// znaków, bez interpunkcji; drobne literówki łapią krótkie rdzenie słów („tydz", „kilomet", „wyzwan").
// Daty liczy router w Europe/Warsaw (argument `dzis`), nie model. Brak dopasowania → null (krok 3: model).
import { EKRANY } from "./narzedzia.mjs";

const MIESIACE = ["stycz", "lut", "mar", "kwie", "maj", "czerw", "lip", "sierp", "wrze", "pazdzi", "listopad", "grud"];
// „maj" musi być słowem (nie „mają"); reszta to rdzenie odmian (październik/październiku, listopad/listopadzie…)
const RE_MIESIAC = new RegExp("(?:^|\\s)(" + MIESIACE.map((m) => (m === "maj" ? "maj(?:u)?(?=\\s|$)" : m + "\\w*")).join("|") + ")");

export function normalizuj(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function dodajDni(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function poniedzialek(d) { const dow = new Date(d + "T12:00:00Z").getUTCDay(); return dodajDni(d, -((dow + 6) % 7)); }
function ostatniDzien(r, m) { return new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10); }   // m: 1..12
function miesiacZakres(nr, dzis) {   // nr 1..12; miesiąc w przyszłości tego roku → ten sam miesiąc rok wcześniej
  let r = Number(dzis.slice(0, 4));
  if (nr > Number(dzis.slice(5, 7))) r -= 1;
  const od = `${r}-${String(nr).padStart(2, "0")}-01`, koniec = ostatniDzien(r, nr);
  return { od, do: koniec < dzis ? koniec : dzis };
}

const EKRAN_SLOWO = [
  [/\b(log|dziennik)\b/, "log"], [/\bplan\b/, "plan"], [/\bform\w*/, "forma"], [/\bspolecznos\w*/, "spolecznosc"],
  [/\bprofil\w*/, "profil"], [/\bradi\w*/, "radio"], [/\bkalendarz\w*/, "plan"], [/\bstart\w*/, "starty"],
  [/\bwyzwan\w*/, "wyzwania"], [/\bodzna\w*/, "odznaki"], [/\bjedzeni\w*|\bdiet\w*/, "jedzenie"], [/\bczat\w*/, "czat"],
];

/** → {narzedzie, args} | {nawiguj, ekran} | null */
export function dopasuj(tekst, dzis) {
  const t = normalizuj(tekst);
  if (!t) return null;
  if (/\bplan\w*\b.*\b(dzis|dzisiaj)\b|\bco (mam )?(dzis|dzisiaj)\b|\b(dzis|dzisiaj)\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "dzis" } };
  if (/\bplan\w*\b.*\bjutr\w*|\bco (mam )?jutr\w*|\bjutr\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "jutro" } };
  if (/\bplan\w*\b.*\b(nastepn|przyszl)\w* tydz\w*/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "nastepny_tydzien" } };
  if (/\bplan\w*\b.*\btydz\w*|\bplan tygodni/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "tydzien" } };
  if (/\b(kiedy|jaki)\b.*\bstart|\bnajblizsz\w* start|\bmoje starty|\bmoj start/.test(t)) return { narzedzie: "moje_starty", args: {} };
  const km = /\b(ile|suma)\b.*\b(km|kilomet\w*|przebieg\w*|nabiega\w*)|\bile przebieg\w*/.test(t);
  if (km) {
    const mies = t.match(RE_MIESIAC);
    if (/\btydz\w*|\btygodni\w*/.test(t)) return { narzedzie: "moje_treningi", args: { od: poniedzialek(dzis), do: dzis } };
    if (mies) return { narzedzie: "moje_treningi", args: miesiacZakres(MIESIACE.findIndex((m) => mies[1].startsWith(m === "maj" ? "maj" : m)) + 1, dzis) };
    if (/\bmiesiac\w*/.test(t)) return { narzedzie: "moje_treningi", args: { od: dzis.slice(0, 8) + "01", do: dzis } };
    if (/\broku\b|\brok\b|\bw tym roku/.test(t)) return { narzedzie: "moje_treningi", args: { od: dzis.slice(0, 5) + "01-01", do: dzis } };
  }
  if (/\bwyzwan\w*/.test(t)) return { narzedzie: "wyzwania_postep", args: {} };
  if (/\bodzna\w*/.test(t)) return { narzedzie: "odznaki_moje", args: {} };
  // nawigacja wprost — OSTATNIA (pierwsza reguła wygrywa, jak w tabeli M1 pkt 5): „otwórz odznaki" trafia wyżej
  // w narzędzie, które i tak daje „Otwórz ›" na ten ekran; tu zostają ekrany bez narzędzia (log, jedzenie, radio…)
  const nav = t.match(/^(otworz|pokaz|idz do|przejdz do|wejdz w|wejdz do)\s+(.+)$/);
  if (nav) for (const [re, ekran] of EKRAN_SLOWO) if (re.test(nav[2])) return { nawiguj: EKRANY[ekran], ekran };
  return null;
}
