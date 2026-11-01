// OKIENKO (M1 krok 2) — router bez modelu: tekst → narzędzie z argumentami albo sama nawigacja. 0 tokenów.
// Pierwsza reguła wygrywa (kolejność jak w M1-okienko-wykonanie.md pkt 5). Normalizacja: małe litery, bez polskich
// znaków, bez interpunkcji; drobne literówki łapią krótkie rdzenie słów („tydz", „kilomet", „wyzwan").
// Daty liczy router w Europe/Warsaw (argument `dzis`), nie model. Brak dopasowania → null (krok 3: model).
import { EKRANY } from "./narzedzia.mjs";
import "../../../js/tekst.mjs";
const T = /** @type {any} */ (globalThis).BM_TEKST;   // porządek 1.11: normalizacja, rdzeń, miesiące, odmiana — js/tekst.mjs

const MIESIACE = ["stycz", "lut", "mar", "kwie", "maj", "czerw", "lip", "sierp", "wrze", "pazdzi", "listopad", "grud"];
// „maj" musi być słowem (nie „mają"); reszta to rdzenie odmian (październik/październiku, listopad/listopadzie…)
const RE_MIESIAC = new RegExp("(?:^|\\s)(" + MIESIACE.map((m) => (m === "maj" ? "maj(?:u)?(?=\\s|$)" : m + "\\w*")).join("|") + ")");

export function normalizuj(t) { return T.normalizuj(t); }
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

/* M3a: kalendarz imprez z maszyny wyników. Słowo o biegu + (miejsce po przyimku | miesiąc | dystans | „jakie biegi" /
   „gdzie pobiec"). NIE: pytania o zwycięzców, wyniki, trasy, zapisy, rekordy i własne starty („moje", „mam") —
   te idą do osoby/narzędzi/sieci jak dotąd („Kto wygrał maraton w Berlinie?" to wynik, nie termin). */
const BIEG_SLOWO = /\b(bieg\w*|zawod\w*|maraton\w*|polmaraton\w*|dych\w*|piatk\w*|imprez\w*|pobiec|pobiegac|starty)\b/;
const BIEG_NIE = /\b(kto|wygral\w*|wygra\w*|wynik\w*|tras\w*|zapis\w*|rekord\w*|moj\w*|mam|mial\w*|pobieg\w*l\w*|ile|jak|czy|kosztuj\w*|wpisow\w*|cen[aęy]|co\s+je[sś][cć])\b/;   // M3-1 (2): co jeść/jak/czy/ile kosztuje → nie lista
// M3-1 (2): po słowie „maraton/półmaraton/bieg" stoi NAZWA (przymiotnik, nazwa własna: „maraton warszawski", „bieg niepodleglosci")
// → to konkretna impreza (impreza.mjs), nie lista; lista zostaje dla „jakie biegi/maratony w <miesiąc|miasto>".
const BIEG_NAZWANY = /\b(maraton\w*|polmaraton\w*|bieg\w*|zawod\w*|ultra\w*|cross\w*|parkrun\w*)\s+([a-z][a-z-]{2,})/;
const NIE_NAZWA_PO_BIEGU = /^(w|we|na|pod|kolo|obok|przy|i|oraz|lub|albo|dla|do|od|z|ze|jest|sa|beda|bedzie|byl|byly|tez|jeszcze|dzis|jutro|weekend\w*|tym|tego|ten|ta|to|ktory|ktora|ktore|jaki|jaka|jakie|gdzie|kiedy|nowe|wszystkie|blisko|niedaleko|kolo)$/;
const PRZYIMKI = ["w", "we", "na", "pod", "kolo", "obok"];
const NIE_MIEJSCE = /^(tym|tymze|przyszlym|najblizszym|najblizszy|weekend\w*|sobote|niedziele|okolic\w*|polsce|polska|kraju|lesie|gorach|terenie|miescie|ciagu|dzien|dni|tygodni\w*|miesiac\w*|roku|km|kilometr\w*)$/;
function najblizszyWeekend(dzis) {   // sb–nd: dziś sb/nd → ten weekend, inaczej najbliższy
  const dow = new Date(dzis + "T12:00:00Z").getUTCDay();   // 0 nd … 6 sb
  const doSoboty = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
  const sb = dodajDni(dzis, doSoboty), nd = dodajDni(sb, 1);
  return { od: sb < dzis ? dzis : sb, do: nd };
}
function miesiacPrzyszly(nr, dzis) {   // nr 1..12; miesiąc wcześniejszy niż bieżący → przyszły rok; od = max(1. dzień, dziś)
  let r = Number(dzis.slice(0, 4));
  if (nr < Number(dzis.slice(5, 7))) r += 1;
  const od = `${r}-${String(nr).padStart(2, "0")}-01`;
  return { od: od < dzis ? dzis : od, do: ostatniDzien(r, nr) };
}
export function dopasujBiegi(tekst, dzis) {
  const t = normalizuj(tekst);
  if (!BIEG_SLOWO.test(t) || BIEG_NIE.test(t)) return null;
  const args = {};
  if (/\bpolmaraton\w*|\b21 ?km\b/.test(t)) args.dystans = "21";
  else if (/\bmaraton\w*|\b42 ?km\b/.test(t)) args.dystans = "42";
  else if (/\bdych\w*|\b10 ?km\b|\b10k\b/.test(t)) args.dystans = "10";
  else if (/\bpiatk\w*|\b5 ?km\b|\b5k\b/.test(t)) args.dystans = "5";
  const mies = t.replace(new RegExp(BIEG_SLOWO.source, "g"), " ").match(RE_MIESIAC);   // „maraton" ≠ marzec
  if (mies) Object.assign(args, miesiacPrzyszly(MIESIACE.findIndex((m) => mies[1].startsWith(m === "maj" ? "maj" : m)) + 1, dzis));
  else if (/\bweekend\w*/.test(t)) Object.assign(args, najblizszyWeekend(dzis));   // M3-1 (2): weekend = najbliższe sb–nd, nie 90 dni
  const slowa = String(tekst).replace(/[?!.,;:"„”()]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < slowa.length - 1; i++) {
    const p = normalizuj(slowa[i]);
    let j = i + 1, okolice = false;
    if (/^okolic\w*$/.test(normalizuj(slowa[j])) && j + 1 < slowa.length) { j++; okolice = true; }   // „w okolicach Poznania"
    const w = slowa[j], wn = normalizuj(w);
    if (!PRZYIMKI.includes(p) || !/^\p{L}{3,}$/u.test(w) || NIE_MIEJSCE.test(wn) || RE_MIESIAC.test(" " + wn) || BIEG_SLOWO.test(wn)) continue;
    args.miejsce = w; args.przy = okolice ? "w okolicach" : p === "kolo" ? "koło" : p; break;
  }
  const ogolne = /\b(jakie|gdzie|kiedy)\b.*\b(bieg\w*|zawod\w*|pobiec|starty)\b|\bgdzie pobiec|\bbiegi\b/.test(t);
  if (!args.miejsce && !args.od && !args.dystans && !ogolne) return null;
  const nazwany = t.match(BIEG_NAZWANY);
  if (nazwany && !NIE_NAZWA_PO_BIEGU.test(nazwany[2]) && !RE_MIESIAC.test(" " + nazwany[2]) && !(ogolne && (args.od || args.miejsce))) return null;   // konkretny bieg → impreza
  return { narzedzie: "biegi_nadchodzace", args };
}

/** → {narzedzie, args} | {nawiguj, ekran} | null */
export function dopasuj(tekst, dzis) {
  const t = normalizuj(tekst);
  if (!t) return null;
  if (/\bplan\w*\b.*\b(dzis|dzisiaj)\b|\bco (mam )?(dzis|dzisiaj)\b|\b(dzis|dzisiaj)\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "dzis" } };
  if (/\bplan\w*\b.*\bjutr\w*|\bco (mam )?jutr\w*|\bjutr\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "jutro" } };
  if (/\bplan\w*\b.*\b(nastepn|przyszl)\w* tydz\w*/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "nastepny_tydzien" } };
  if (/\bplan\w*\b.*\btydz\w*|\bplan tygodni/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "tydzien" } };
  if (/\b(kiedy|jaki)\b.*\bstart|\bnajblizsz\w* start|\bmoje starty|\bmoj start/.test(t)) return { narzedzie: "moje_starty", args: {} };
  // M3d: rekordy i moje wyniki — przed kalendarzem („jak mi poszło w Dębnie" to wynik, nie termin)
  if (!/\bkto\b/.test(t)) {
    const cudzyRekord = /\b(swiata|polski|europy|olimpijsk\w*|trasy|kraju|mistrz\w*)\b/.test(t);   // M3-1 (2): rekord świata ≠ mój rekord
    if (!cudzyRekord && /\bszans\w*\b.*\b(rekord\w*|pb|zyciow\w*)/.test(t)) return { narzedzie: "moje_rekordy", args: { szanse: true } };
    if (!cudzyRekord && /\b(rekord\w*|pb|zyciowk\w*|zyciowe|najlepsz\w* czas\w*)\b/.test(t)) return { narzedzie: "moje_rekordy", args: {} };
    if (/\b(moje wyniki|moich wynikow|moj wynik|jak mi poszlo|jak pobieglem|jak pobieglam)\b/.test(t)) {
      const m = String(tekst).match(/\s(?:w|we|na)\s+([\p{L}][\p{L}.-]{2,39})/u);
      return { narzedzie: "moje_wyniki", args: m ? { gdzie: m[1] } : {} };
    }
  }
  const biegi = dopasujBiegi(tekst, dzis);
  if (biegi) return biegi;
  const km = /\b(ile|suma)\b.*\b(km|kilomet\w*|przebieg\w*|nabiega\w*)|\bile przebieg\w*/.test(t);
  if (km) {
    const mies = t.match(RE_MIESIAC);
    if (/\btydz\w*|\btygodni\w*/.test(t)) return { narzedzie: "moje_treningi", args: { od: poniedzialek(dzis), do: dzis } };
    if (mies) return { narzedzie: "moje_treningi", args: miesiacZakres(MIESIACE.findIndex((m) => mies[1].startsWith(m === "maj" ? "maj" : m)) + 1, dzis) };
    if (/\bmiesiac\w*/.test(t)) return { narzedzie: "moje_treningi", args: { od: dzis.slice(0, 8) + "01", do: dzis } };
    if (/\broku\b|\brok\b|\bw tym roku/.test(t)) return { narzedzie: "moje_treningi", args: { od: dzis.slice(0, 5) + "01-01", do: dzis } };
  }
  if (/\bwyzwan\w*/.test(t)) return { narzedzie: "wyzwania_postep", args: {} };
  if (/\bodzna\w*/.test(t) && !/^(co to|co znaczy|co oznacza|czym jest|za co)\b/.test(t)) return { narzedzie: "odznaki_moje", args: {} };   // M3-1 (2): „co to jest odznaka X" → katalog
  // nawigacja wprost — OSTATNIA (pierwsza reguła wygrywa, jak w tabeli M1 pkt 5): „otwórz odznaki" trafia wyżej
  // w narzędzie, które i tak daje „Otwórz ›" na ten ekran; tu zostają ekrany bez narzędzia (log, jedzenie, radio…)
  const nav = t.match(/^(otworz|pokaz|idz do|przejdz do|wejdz w|wejdz do)\s+(.+)$/);
  if (nav) for (const [re, ekran] of EKRAN_SLOWO) if (re.test(nav[2])) return { nawiguj: EKRANY[ekran], ekran };
  return null;
}
