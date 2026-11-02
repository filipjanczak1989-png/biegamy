// OKIENKO (M1 krok 2) — router bez modelu: tekst → narzędzie z argumentami albo sama nawigacja. 0 tokenów.
// Pierwsza reguła wygrywa (kolejność jak w M1-okienko-wykonanie.md pkt 5). Normalizacja: małe litery, bez polskich
// znaków, bez interpunkcji; drobne literówki łapią krótkie rdzenie słów („tydz", „kilomet", „wyzwan").
// Daty liczy router w Europe/Warsaw (argument `dzis`), nie model. Brak dopasowania → null (krok 3: model).
import { EKRANY } from "./narzedzia.mjs";
import "../../../js/tekst.mjs";
import "../../../js/akcja-cytaty.mjs";   // zagadka akcji (2.11.2026): ZAGADKI, czyAkcjaRuszyla — jedno źródło z banerem cytatu
const T = /** @type {any} */ (globalThis).BM_TEKST;
const AKCJA = /** @type {any} */ (globalThis).BM_AKCJA_CYTATY;   // porządek 1.11: normalizacja, rdzeń, miesiące, odmiana — js/tekst.mjs

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

export const POWITANIE = "Cześć! Pytaj o plan, kilometry, starty, biegi w okolicy, utwór z radia albo przepis.";
export const ODP_TYLKO_POLSKA = "Maszyna wyników zna tylko biegi w Polsce.";   // M3-2 (e)
export const ODP_ZDROWIE = "Przy bólu lub kontuzji decyzję podejmij z trenerem albo fizjoterapeutą.";   // etap 5 (c): bez porad medycznych
const ZDROWIE = /\b(kontuzj\w*|boli|bola|bolal\w*|bol|bolu|bolem|uraz\w*|naciagn\w*|naderwan\w*|skrecon\w*|zwichn\w*|stluczon\w*|zapalen\w*|shin splint\w*|piszczel\w* boli)\b/;
export const ODP_KALKULATOR_PUSTY = "Napisz tempo (np. 5:30/km), prędkość w km/h albo czas i dystans — przeliczę.";   // M3-2 (d)
const EKRAN_SLOWO = [
  [/\b(log|dziennik)\b/, "log"], [/\bplan\b/, "plan"], [/\bform\w*/, "forma"], [/\bspolecznos\w*/, "spolecznosc"],
  [/\bprofil\w*/, "profil"], [/\bradi\w*/, "radio"], [/\bkalendarz\w*/, "plan"], [/\bstart\w*/, "starty"],
  [/\bwyzwan\w*/, "wyzwania"], [/\bodzna\w*/, "odznaki"], [/\bjedzeni\w*|\bdiet\w*/, "jedzenie"], [/\bczat\w*/, "czat"],
  [/\bustawien\w*|\bzegar\w*|\bawatar\w*|\bzdjeci\w*|\bkonto\b|\bhasl\w*/, "profil"], [/\bcwiczen\w*|\brozciag\w*/, "cialo"], [/\bstatysty\w*/, "statystyki"],   // M3-2 (c)
];

/* M3-2 (d): kalkulator tempo ↔ prędkość ↔ czas na dystans — 0 tokenów, liczby WYŁĄCZNIE z pytania. m:ss to tempo, gdy stoi
   przy słowie „tempo" / „na km" albo jest krótsze niż 10:00 bez kontekstu czasu; przy „w / za / poniżej" i dystansie ≥ 15 km
   krótkie „1:45" to godziny. Bez liczb odpowiada tylko na jawne „przelicz … na prędkość/tempo"; „jakie tempo na półmaraton"
   to porada, nie przeliczenie → null (dalej jak dotąd). */
const RE_KALK_SLOWO = /\b(tempo|tempie|tempem|tempa|predkos\w*|km\s*\/\s*h|kmh|km na godzin\w*|min\s*\/\s*km|na km\b|na kilometr\w*)/;
const fmtTempo = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60) % 60).padStart(2, "0")}`;
const fmtCzas = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0"); };
const fmtKmh = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const fmtKm = (v) => (v === 21.0975 ? "Półmaraton" : v === 42.195 ? "Maraton" : String(Math.round(v * 100) / 100).replace(".", ",") + " km");
export function kalkulator(tekst) {
  const raw = T.bezZnakow(tekst).replace(/,/g, ".");
  const t = normalizuj(tekst);
  if (/\b(moj\w*|mam|mial\w*|plan\w*|rekord\w*|zyciow\w*|pb)\b/.test(t)) return null;
  if (!RE_KALK_SLOWO.test(raw) && !/\bile czasu\b|\bjaki czas\b/.test(t)) return null;
  let tempoS = null, czasS = null, kmh = null, km = null;
  const mKmh = raw.match(/(\d+(?:\.\d+)?)\s*(?:km\s*\/\s*h|kmh|km na godz)/);
  if (mKmh) kmh = parseFloat(mKmh[1]);
  const bezKmh = mKmh ? raw.replace(mKmh[0], " ") : raw;
  const mKm = bezKmh.match(/(\d+(?:\.\d+)?)\s*(?:km\b|kilometr)/);
  if (mKm) km = parseFloat(mKm[1]);
  else if (/polmaraton/.test(raw)) km = 21.0975; else if (/\bmaraton/.test(raw)) km = 42.195; else if (/\bdych\w*|\b10k\b/.test(raw)) km = 10; else if (/\bpiatk\w*|\b5k\b/.test(raw)) km = 5;
  const czasH = raw.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (czasH) czasS = (+czasH[1]) * 3600 + (+czasH[2]) * 60 + (+czasH[3]);
  const reszta = czasH ? raw.replace(czasH[0], " ") : raw;
  for (const m of reszta.matchAll(/(?<![\d:])(\d{1,3}):(\d{2})(?![\d:])/g)) {
    const s = (+m[1]) * 60 + (+m[2]);
    const przed = reszta.slice(Math.max(0, m.index - 14), m.index), po = reszta.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const jestTempo = /temp\w*\s*$/.test(przed) || /^\s*(\/|min\s*\/?\s*|na )\s*(km|kilometr)/.test(po);
    const kontekstCzasu = /\b(w|za|ponizej|pod|czas\w*)\s*$/.test(przed);
    if (jestTempo) { if (tempoS == null) tempoS = s; }
    else if (kontekstCzasu) { if (czasS == null) czasS = km && km >= 15 && s < 7 * 60 ? s * 60 : s; }
    else if (s < 600) { if (tempoS == null) tempoS = s; }
    else if (czasS == null) czasS = s;
  }
  if (tempoS == null && kmh != null && kmh > 0) tempoS = 3600 / kmh;
  if (tempoS == null && czasS != null && km) tempoS = czasS / km;
  if (tempoS == null || !(tempoS > 0)) return /\bprzelicz\w*|\bna predkosc\b|\bna tempo\b/.test(t) ? { zdanie: ODP_KALKULATOR_PUSTY, log: "kalkulator" } : null;
  const predkosc = 3600 / tempoS;
  if (czasS != null && km) return { zdanie: `${fmtKm(km)} w ${fmtCzas(czasS)} to tempo ${fmtTempo(tempoS)}/km (${fmtKmh(predkosc)} km/h).`, log: "kalkulator" };
  if (km) return { zdanie: `${fmtKm(km)} w tempie ${fmtTempo(tempoS)}/km to ${fmtCzas(tempoS * km)} (${fmtKmh(predkosc)} km/h).`, log: "kalkulator" };
  if (kmh != null) return { zdanie: `${fmtKmh(kmh)} km/h to tempo ${fmtTempo(tempoS)}/km.`, log: "kalkulator" };
  return { zdanie: `Tempo ${fmtTempo(tempoS)}/km to ${fmtKmh(predkosc)} km/h.`, log: "kalkulator" };
}

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
const NIE_MIEJSCE = /^(tym|tymze|moim|mojej|mojego|naszym|przyszlym|najblizszym|najblizszy|weekend\w*|sobote|niedziele|okolic\w*|polsce|polska|kraju|lesie|gorach|terenie|miescie|ciagu|dzien|dni|tygodni\w*|miesiac\w*|roku|km|kilometr\w*)$/;
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

/* ZAGADKA AKCJI (decyzja Filipa 2.11.2026): pytania o akcję → zdanie z js/akcja-cytaty.mjs, 0 tokenów, PIERWSZA reguła
   routera (przed planem, osobą, imprezą, katalogiem, siecią). „Fabianek" nigdy do sieci ani trybu osoby. Wzorce
   charakterystyczne (fabian, 12 500, 8.11, peleryny, Jasna Góra, tajemnica, niespodzianka, akcja, challenge…) działają
   zawsze; OGÓLNE („co się dzieje", „co się szykuje", „o co chodzi z…") tylko bez słów o własnych danych i pojęciach
   aplikacji — inaczej „o co chodzi z TSB" (katalog) albo „co się dzieje z moim planem" trafiłyby w zagadkę (blizna-93). */
const ZAGADKA_ZAWSZE = /\b(jaka akcj\w*|jakie akcj\w*|akcj\w* specjaln\w*|jaki challenge|challenge\w*|wyzwanie specjalne|co bedzie 8|8 listopad\w*|osm\w* listopad\w*|beda znaki|tajemnic\w*|niespodzian\w*|fabian\w*|12 ?500|jasna gora|jasnej gor\w*|peleryn\w*)\b/;
const ZAGADKA_OGOLNA = /\b(co sie dzieje|co sie szykuje|o co chodzi z)\b/;
const ZAGADKA_NIE = /\b(moj\w*|mam|mi|plan\w*|trening\w*|odznak\w*|wyzwan\w* tygodni\w*|tsb|ctl|atl|trimp|form\w*|kilometraz\w*|aplikacj\w* nie dziala|blad\w*)\b/;
export function czyZagadka(tekst) {
  const surowy = String(tekst || "").toLowerCase();
  const t = normalizuj(tekst);
  if (!t) return false;
  if (ZAGADKA_ZAWSZE.test(t) || /(^|[^0-9])0?8[ .]11([^0-9]|$)/.test(surowy)) return true;
  return ZAGADKA_OGOLNA.test(t) && !ZAGADKA_NIE.test(t);
}

/** → {narzedzie, args} | {nawiguj, ekran} | {zdanie, log} | null */
export function dopasuj(tekst, dzis) {
  const t = normalizuj(tekst);
  if (!t) return null;
  if (czyZagadka(tekst) && AKCJA) { const z = AKCJA.odpowiedzZagadki(); return { zdanie: z.zdanie, log: "zagadka" }; }
  if (/\bplan\w*\b.*\b(dzis|dzisiaj)\b|\bco (mam )?(dzis|dzisiaj)\b|\b(dzis|dzisiaj)\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "dzis" } };
  if (/\bplan\w*\b.*\bjutr\w*|\bco (mam )?jutr\w*|\bjutr\w* trening/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "jutro" } };
  if (/\bplan\w*\b.*\b(nastepn|przyszl)\w* tydz\w*/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "nastepny_tydzien" } };
  if (/\bplan\w*\b.*\btydz\w*|\bplan tygodni/.test(t)) return { narzedzie: "moj_plan", args: { zakres: "tydzien" } };
  if (/\b(kiedy|jaki)\b.*\bstart|\bnajblizsz\w* start|\bmoje starty|\bmoj start/.test(t)) return { narzedzie: "moje_starty", args: {} };
  // M3-1 (3): powitanie → jedno zdanie bez modelu; „kto jest moim trenerem" → moj_trener (0 tokenów)
  if (/^(dzien dobry|czesc|hej|siema|witaj|witam|halo|dobry wieczor|hello|hi|elo|no hej)\b/.test(t) && t.split(" ").length <= 3) return { zdanie: POWITANIE, log: "powitanie" };
  if (/\b(moj|mojego|moim|mojemu)\s+trener\w*|\bmoim trenerem\b|\bmam trenera\b|\bkto mnie trenuje\b/.test(t)) return { narzedzie: "moj_trener", args: {} };
  // etap 5 (c): ból / kontuzja → stałe zdanie, 0 tokenów, bez porad; EF dokłada „Napisz do trenera", gdy jest trener
  if (ZDROWIE.test(t) && !/\bodzna\w*|\bpowrot po kontuzji\b.*\bodzna/.test(t)) return { zdanie: ODP_ZDROWIE, log: "zdrowie", trener: true };
  // M3-2 (a): forma („jaka mam formę", „mój TSB"), znajomi („moi znajomi co biegali" — nie „dodaj X do znajomych", to osoba),
  // miasto („kto biega z mojego miasta") — 0 tokenów; „co to jest forma / jak działa TSB" zostaje dla katalogu pojęć
  if (/\bmoj\w* tsb\b|\bmam tsb\b|\b(jaka|jaką|moja|mam|sprawdz|ocen)\b[^.]*\bform[aey]\b|\bform[aey]\b[^.]*\b(mam|moja)\b/.test(t)) return { narzedzie: "moja_forma", args: {} };
  if (/\bznajom\w*/.test(t) && !/\b(dodaj|dodac|dodawac|zapros\w*|zaprosic|usun\w*|przyjmij|odrzuc\w*|jak)\b/.test(t)) return { narzedzie: "znajomi_tydzien", args: {} };
  if (/\b(kto|ktorzy|jacy|biegacz\w*|osob\w*|ludz\w*)\b/.test(t) && /\b(z|w) (mojego|moim|mojej) (miast\w*|miesci\w*|okolic\w*)\b|\bkto\b.*\b(w okolicy|z okolicy|blisko mnie|niedaleko mnie)\b/.test(t)) return { narzedzie: "osoby_z_miasta", args: {} };
  // M3-2 (d) kalkulator — przed rekordami („jaki czas na 10 km w tempie 5:00" to przeliczenie, nie życiówka)
  const kalk = kalkulator(tekst);
  if (kalk) return kalk;
  // M3-2 (e): biegi za granicą — maszyna wyników zna tylko Polskę; jedno zdanie zamiast pustej listy
  if (BIEG_SLOWO.test(t) && /\bza granic\w*|\bzagranic\w*|\bpoza polsk\w*/.test(t)) return { zdanie: ODP_TYLKO_POLSKA, log: "biegi_zagranica" };
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
