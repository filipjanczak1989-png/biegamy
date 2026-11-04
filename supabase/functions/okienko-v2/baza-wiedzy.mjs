// OKIENKO 2.0 — BAZA WIEDZY BIEGAMY (Filip 3.11, gałąź okienko/baza-wiedzy). Odpowiedź z sieci staje się KANDYDATEM w okienko_wiedza; trener zatwierdza w panelu
// (js/wiedza-panel.mjs), a potok odpowiada z zatwierdzonych przed siecią. Ten moduł: dopasowanie (czyste funkcje), reguła ważności, zapis kandydata, przepisanie w głosie BiegaMy.
//
// DOPASOWANIE: normalizacja + synonimy + rdzenie, a potem RÓWNE zbiory słów treści, liczb i dystansów („tempo na 10 km” ≠ „tempo na 5 km”, „banan” ≠ „jabłko”). Bez modelu, więc 0 tokenów.
// Lepiej nie trafić niż trafić źle: pudło kosztuje wyszukanie i osobnego kandydata, a złe trafienie to pewna, ale nie ta odpowiedź.
// ⚠️ POMIAR 4.11: luźniejszy etap (Jaccard ≥ 0,75, różnica jednego słowa) dawał 65% złych trafień na dopiskach zmieniających sens („…przed maratonem w upale”, „…dla dzieci”), a wnosił 1/30 i 1/22 par, więc go nie ma.
// PRYWATNOŚĆ: kandydat nie zawiera athlete_id; pytanie po anonimizacji; pytanie albo odpowiedź wyglądające na dane osoby albo akcję nie stają się kandydatem wcale.
// ZAPIS tylko przez trzy RPC service_role (atomowy licznik i wariant; jedyny wyjątek od zakazu .rpc w okienko-v2, blizna-113).
import { normalizuj, przeciekAkcji, zagadkaKandydat } from "../okienko/router.mjs";
import { naZdania } from "../okienko/siec.mjs";
import { anonimizuj, czysty } from "../_shared/anonimizuj.mjs";
import { czyOgolnik, bezOgolnikow, DOPISEK_PORADY } from "./wiedza.mjs";

/* Tylko wiedza ogólna. Obóz i zagranica mają ceny i terminy zmienne co sezon, własne dane, plan i kalkulator nigdy nie są w bazie. */
export const INTENCJE_BAZY = ["porada", "zywienie", "sprzet", "fakt"];
export const MAX_ODPOWIEDZ = 1500, MIN_ODPOWIEDZ = 20, MAX_WARIANTOW = 20, MAX_ZRODEL_BAZY = 5;
/* WAŻNOŚĆ: reguła z projektu, nie z pomiaru; liczby do akceptacji Filipa. Trener zmienia datę w panelu, ale ceny i terminów nie zrobi wiecznymi. */
export const DNI_CENY_TERMINY = 30, DNI_SPRZET = 180, DNI_FAKT_ZMIENNY = 180;

const STOP = new Set(["a", "i", "o", "u", "w", "we", "z", "ze", "na", "do", "od", "za", "dla", "przy", "bo", "ale", "tak", "nie", "co", "jak", "jaki", "jaka", "jakie", "jakiego", "jakich", "jakim", "jaka", "jakiej",
  "to", "ten", "ta", "te", "tej", "tym", "tego", "tych", "jest", "sa", "byc", "byl", "byla", "bylo", "bedzie", "ma", "moze", "mozna", "moge", "mozesz", "powinienem", "powinnam", "powinno", "powinien", "powinna", "powinni", "trzeba", "warto", "najlepiej", "lepiej", "dobry", "dobra", "dobre", "dobrze", "dobrego", "dobrych",
  "najlepszy", "najlepsza", "najlepsze", "najlepszych", "polecasz", "polecacie", "polec", "polecic", "doradz", "doradzisz", "podpowiedz", "poradz", "poradzisz", "radzisz", "powiedz", "prosze", "mi", "mnie", "sie", "sobie", "przez", "podczas", "trakcie", "czasie",
  "ktory", "ktora", "ktore", "ktorych", "pod", "nad", "oraz", "lub", "albo", "bardzo", "wiele", "amator", "amatora", "biegac", "biegam", "biegiem", "bieg", "biegu", "biegow", "biegi", "biegach", "pobiegac",
  "zawsze", "zwykle", "wlasciwie", "ogolnie", "cos", "jakos", "np", "czyli", "wiec", "kazdy", "kazdego", "kazda", "mam", "ja", "zeby", "aby", "chce", "chcialbym", "chcialabym", "potrzebuje", "czym", "czego", "jakis", "jakies", "jakas", "prawidlowo", "poprawnie", "robic", "robi", "robisz", "zrobic", "wziac", "brac", "kupic", "uzywac", "miec", "lepsze", "lepszy", "lepsza"]);
/* formy „biegać” i „trening” nic nie wnoszą w aplikacji biegowej; pierwsza osoba („biegałem”) zostaje, bo to pytanie o własne dane */
const STOP_BIEG = /^(biegan|biegacz|biegaj|biegow|trening|treningow|polec|bezpieczni)/;

/* frazy przed podziałem na słowa (tekst po normalizuj) */
const FRAZY = [
  [/\b(dlugi\w*|dluzsz\w*) (bieg\w*|wybiegani\w*)\b/g, " wybieganie "], [/\blong run\w*\b/g, " wybieganie "], [/\bwybiegani\w*\b/g, " wybieganie "],
  [/\bpierwsz\w* krok\w*\b/g, " zaczac "], [/\bod czego zaczac\b/g, " zaczac "],
  [/\bile razy( w tygodniu)?\b/g, " czesto "], [/\bile (treningow|biegow|jednostek) w tygodniu\b/g, " czesto "], [/\bjak czesto\b/g, " czesto "], [/\bile dni w tygodniu\b/g, " czesto "], [/\bpo ilu (km|kilometrach)\b/g, " czesto "],
  [/\bjak duzo\b/g, " ile "], [/\bjak wiele\b/g, " ile "], [/\bw jakim tempie\b/g, " tempo "],
  [/\bma sens\b/g, " "], [/\bile minut\b/g, " czas "], [/\bna dzien\b/g, " dziennie "], [/\b(pic|pij\w*|wypi\w*) kaw\w*\b/g, " kawa "], [/\bkilometraz\w*\b/g, " dystans "],
  [/\b(ile (powinno |powinien |powinna )?trwac|jak dlugo( powinno| powinien| powinna)?( trwac)?|jak dlugi|jak dluga|jak dlugie)\b/g, " czas "], [/\b(ile (km|kilometrow)|jaki dystans|jaka dlugosc)\b/g, " dystans "],
  [/\b(co to( jest| sa)?|czym jest|czym sa|na czym polega\w*)\b/g, " definicja "],
  [/\b(codzienn\w*|kazdego dnia|dzien w dzien)\b/g, " codziennie "], [/\bzeby nie( miec)?\b/g, " uniknac "],
  [/\bpo (asfalc\w*|asfalt\w*|lesie|terenie|gorach|biezni\w*|sniegu|piasku|plazy|trawie)\b/g, " $1 "],
  [/\bna mokr\w*\b/g, " deszcz "], [/\bw deszczu?\b/g, " deszcz "], [/\b(gdy|jak|kiedy) pada\b/g, " deszcz "],
  [/\bna czczo\b/g, " czczo "], [/\bbez sniadani\w*\b/g, " czczo "],
];

/* grupy synonimów: wzorzec słowa → słowo kanoniczne (pierwszy pasujący) */
const GRUPY = [
  [/^(kcal|kalor)/, "kcal"], [/^bialk/, "bialko"], [/^(weglow|wegle|weglami)/, "weglowodany"], [/^izoton/, "izotonik"], [/^elektrolit/, "elektrolity"],
  [/^(pic|pij|wypi|nawod|plyn|wody|woda|wode|wodzie|wodą)/, "picie"], [/^(jesc|jedz|jem|zjesc|zjem|zjad|posil|zywi|pokarm)/, "jedzenie"], [/^(zel|zele|zeli|zelem|zelow|zelami)$/, "zel"], [/^kaw/, "kawa"],
  [/^(but|buty|butow|butach|butami|obuw)/, "buty"], [/^zegar/, "zegarek"], [/^(skarpet|skarpe)/, "skarpety"], [/^kurt/, "kurtka"], [/^(ubra|ubie|odziez|strój|stroj)/, "ubranie"], [/^(sluchaw)/, "sluchawki"],
  [/^temper/, "temperatura"], [/^temp/, "tempo"], [/^(szybc|szybk|przyspie)/, "szybciej"], [/^(zacz|poczat)/, "zaczac"], [/^(czest)/, "czesto"], [/^(tydz|tygodn)/, "tydzien"], [/^dzienn/, "dziennie"], [/^(dzien|dnia|dniu|dni)$/, "dzien"],
  [/^rozgrz/, "rozgrzewka"], [/^(rozciag|stretch)/, "rozciaganie"], [/^(regener|odpocz|odpoczyn)/, "regeneracja"], [/^(silow|sila|sile|sily|silown)/, "sila"], [/^interw/, "interwal"], [/^podbieg/, "podbieg"], [/^(tetn|puls)/, "tetno"],
  [/^upal/, "upal"], [/^(zim|mroz)/, "zima"], [/^(rano|ranny|ranna|poranny|poranna|porann)/, "rano"], [/^wiecz/, "wieczor"], [/^(schudn|odchud|chudn)/, "chudniecie"], [/^zakwas/, "zakwasy"],
  [/^(asfal)/, "asfalt"], [/^(las|lasu|lesie|lesny|lesna|lesne|tereno|teren|trail)/, "teren"], [/^(bieznia|bieznie|bieznia|biezni)/, "bieznia"], [/^(zawod|start)/, "zawody"], [/^kilometr/, "km"], [/^(wymien|zmieni|wymian)/, "wymiana"],
  [/^przed$/, "przed"], [/^(zbudow|budow)/, "budowa"], [/^(wygra|zwyciez|zwyciezc)/, "wygrana"], [/^(uniknac|unikn|zapobie)/, "uniknac"], [/^(zwieksz|podnos|podnie|wydluz)/, "zwiekszyc"], [/^(gora|gore|gorze|gorka|gorke|gorki|gorce)$/, "gora"],
];

/* dystans: maraton i półmaraton po nazwie, dycha i piątka po żargonie, każde „N km” jako liczba; reszta liczb (tempo 5:30, rok, kcal) też musi się zgadzać */
const DYSTANSE = [[/\bultra\w*\b/g, "ultra"], [/\b(pol maraton\w*|polmaraton\w*|polowk\w*|half\w*|21(?: 1\d*)? ?(?:km|k)\b)/g, "21"], [/\b(maraton\w*|42(?: 2\d*)? ?(?:km|k)\b)/g, "42"], [/\b(dych\w*|dziesiatk\w*|10 ?(?:km|k)\b)/g, "10"], [/\b(piatk\w*|5 ?(?:km|k)\b)/g, "5"]];
const rdzen = (w) => (w.length >= 6 && /(am|asz|ac|em|esz)$/.test(w) ? w.replace(/(am|asz|ac|em|esz)$/, "").slice(0, 5) : w.length >= 6 ? w.slice(0, 5) : w.length === 5 ? w.slice(0, 4) : w.length === 4 ? w.slice(0, 3) : w);

/** Sygnatura pytania: słowa treści (po synonimach i rdzeniach) + liczby i dystanse. */
export function sygnatura(tekst) {
  let t = ` ${normalizuj(tekst)} `;
  const liczby = new Set();
  for (const [re, d] of DYSTANSE) t = t.replace(re, () => { liczby.add("d" + d); return " "; });
  for (const [re, z] of FRAZY) t = t.replace(re, z);
  for (const [re, d] of DYSTANSE) t = t.replace(re, () => { liczby.add("d" + d); return " "; });   // „przed maratonem” odsłonięte przez frazę
  const tokeny = new Set();
  const slowa = t.split(/\s+/).filter(Boolean);
  for (const s of slowa) {
    if (/^\d/.test(s)) { liczby.add("n" + s); continue; }
    if (STOP.has(s) || STOP_BIEG.test(s) || s.length < 2) continue;
    const g = GRUPY.find(([re]) => re.test(s));
    tokeny.add(g ? g[1] : rdzen(s));
  }
  return { tokeny, liczby, slow: normalizuj(tekst).split(" ").filter(Boolean).length };
}

/** klucz wpisu: to samo pytanie innymi słowami daje ten sam klucz; null = za mało treści, żeby cokolwiek rozpoznać */
export function kluczWiedzy(tekst) {
  const s = sygnatura(tekst);
  if (!s.tokeny.size || s.slow < 2) return null;
  return [...[...s.liczby].sort(), ...[...s.tokeny].sort()].join(" ").slice(0, 300);
}

const rowneZbiory = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
/** 1 = to samo (równe zbiory słów treści, liczb i dystansów), 0 = inne */
export function podobienstwo(a, b) {
  const A = sygnatura(a), B = sygnatura(b);
  if (A.slow < 2 || B.slow < 2 || !A.tokeny.size || !B.tokeny.size || !rowneZbiory(A.liczby, B.liczby)) return 0;
  return rowneZbiory(A.tokeny, B.tokeny) ? 1 : 0;
}

/** wpis można podać: zatwierdzony i nieprzeterminowany (dzis = YYYY-MM-DD, porównanie napisów) */
export function wazny(w, dzis) {
  if (!w || w.status !== "zatwierdzona") return false;
  if (w.waznosc === "wieczna") return true;
  return w.waznosc === "do_daty" && typeof w.wazna_do === "string" && w.wazna_do >= dzis;
}

/** wpis dla pytania albo null. dzis = filtr ważności (bez dzis = bez filtra, np. szukanie bliźniaka kandydata) */
export function dopasujWiedze(tekst, wpisy, { dzis = null } = {}) {
  for (const w of wpisy || []) {
    if (dzis && !wazny(w, dzis)) continue;
    for (const fraza of [w.pytanie, ...(Array.isArray(w.warianty) ? w.warianty : [])]) if (podobienstwo(tekst, fraza) === 1) return { wpis: w, wynik: 1 };
  }
  return null;
}

/* pytanie o własne dane nie może dostać ogólnego wpisu przed klasyfikatorem („ile km zrobiłem w tym tygodniu”) */
const WLASNE = /\b(moj|moje|moja|mojego|mojej|moim|moich|mialem|mialam|przebieg\w*|biegalem|biegalam|zrobilem|zrobilam|spalilem|spalilam|u mnie|dla mnie|moge dzis|mam dzis|mam jutro)\b/;
export const czyWlasne = (tekst) => WLASNE.test(normalizuj(tekst));

/** zdania do wyświetlenia: dopisek porady dokładamy tutaj, nie trzymamy go w treści wpisu */
export function zdaniaWpisu(w) {
  /* naZdania tnie po każdej kropce ze spacją, więc „między 30. a 45. minutą” to trzy zdania (próba na żywo 4.11): fragment od małej litery wraca do poprzedniego */
  const z = naZdania(w.odpowiedz).reduce((o, x) => { if (o.length && /^\p{Ll}/u.test(x)) o[o.length - 1] += " " + x; else o.push(x); return o; }, []);
  return w.intencja === "porada" ? [...z, DOPISEK_PORADY] : z;
}

const dodajDni = (dzis, n) => { const t = new Date(dzis + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const CENY_TERMINY = /\b(kosztuj\w*|koszt\w*|cen[aeyi]\w*|cenn\w*|termin\w*|kiedy|zapis\w*|wpisow\w*|promocj\w*|oplat\w*|20\d\d|w tym roku|w przyszlym roku|w tym sezonie|aktualn\w*|obecn\w*|teraz|najnowsz\w*|nowy model|nowe modele|zlotych|zl)\b/;
const FAKT_ZMIENNY = /\b(rekord\w*|wygral\w*|zwyciez\w*|mistrz\w*|najszybsz\w*|kto|ostatni\w*|aktualn\w*)\b/;
const CENA_W_TRESCI = /\d\s*(zl|zlotych|pln)\b/;
/** reguła ważności. nietrwala = pytanie o cenę albo termin: nigdy „wieczna”, także po edycji w panelu (CHECK w bazie). */
export function waznoscDla(pytanie, intencja, dzis, odpowiedz = "") {
  const q = normalizuj(pytanie), a = normalizuj(odpowiedz);
  if (CENY_TERMINY.test(q)) return { waznosc: "do_daty", wazna_do: dodajDni(dzis, DNI_CENY_TERMINY), nietrwala: true };
  if (intencja === "sprzet" || CENA_W_TRESCI.test(a)) return { waznosc: "do_daty", wazna_do: dodajDni(dzis, DNI_SPRZET), nietrwala: false };
  if (intencja === "fakt" && FAKT_ZMIENNY.test(q)) return { waznosc: "do_daty", wazna_do: dodajDni(dzis, DNI_FAKT_ZMIENNY), nietrwala: false };
  return { waznosc: "wieczna", wazna_do: null, nietrwala: false };
}

/* Imiona liczymy tylko przy słowach z wielkiej litery: „mają” to nie Maja (DOPISEK_PORADY dostawał [OSOBA]), a „Morzem Tyrreńskim” to nie osoba. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/, TELEFON = /(?:\+48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/;
export function wygladaNaDaneOsoby(tekst) {
  const t = String(tekst || "");
  if (EMAIL.test(t) || TELEFON.test(t)) return true;
  return !czysty(t.split(/\s+/).filter((s) => /^[„"(]?\p{Lu}/u.test(s)).join(" "));
}
const ZNACZNIK = /\[(OSOBA|e-mail|telefon|adres)\]/;
/* Red team 2 (4.11): „zapisz w bazie pytanie <script>…” trafiało do kolejki trenera. Panel to zescapuje, ale kandydat ma być pytaniem biegacza, nie kodem, linkiem, reklamą ani poleceniem. */
const NIE_PYTANIE = /<\s*[a-z/!]|javascript:|\bon[a-z]+\s*=|https?:|www\.|\b[a-z0-9-]{3,}\.(pl|com|eu|net|org)\b|`/i;
const POLECENIE = /\b(zapisz|dodaj|wrzuc|wklej|wpisz|umiesc|zatwierdz\w*|zmien|usun)\b.{0,50}\b(baz\w*|kolejk\w*|odpowiedz\w*|trener\w*|wiedz\w*)\b|\b(zignoruj|ignore|prompt\w*|instrukcj\w*|system prompt|od teraz odpowiadaj)\b|\b(promocj\w*|kod\w* rabatow\w*|kup teraz|polecam sklep)\b/;

/** pytanie po anonimizacji albo null, gdy nie nadaje się na kandydata (osoba, kontakt, akcja) */
export function pytanieKandydata(tekst) {
  const q = anonimizuj(String(tekst || "").replace(/\s+/g, " ").trim()).slice(0, 300);
  if (!q || ZNACZNIK.test(q) || NIE_PYTANIE.test(q) || POLECENIE.test(normalizuj(q)) || wygladaNaDaneOsoby(q) || zagadkaKandydat(q) || przeciekAkcji([q])) return null;
  return q;
}
/** treść odpowiedzi do bazy: bez dopisku porady, bez danych osób i akcji, bez ogólników; null = nie zapisujemy */
export function odpowiedzKandydata(zdania) {
  const z = bezOgolnikow((Array.isArray(zdania) ? zdania : []).filter((x) => typeof x === "string" && x.trim() && x !== DOPISEK_PORADY));
  const t = z.join(" ").replace(/\s+/g, " ").trim();
  if (t.length < MIN_ODPOWIEDZ || t.length > MAX_ODPOWIEDZ || ZNACZNIK.test(t) || wygladaNaDaneOsoby(t) || przeciekAkcji(z) || czyOgolnik(z)) return null;
  return t;
}

/* ── przepisanie w głosie BiegaMy ─────────────────────────────────────────────────────────────────────────────── */
export const PROMPT_GLOSU = [
  "Przepisujesz odpowiedź z sieci na głos trenera BiegaMy. Mówisz do biegacza amatora na „Ty”, krótko, konkretnie, po trenersku, od sedna.",
  "2–4 krótkie zdania po polsku, bez emoji, wykrzykników, list i formatowania. Bez wstępów typu „na podstawie wyszukiwania”.",
  "Nie dodajesz żadnych nowych faktów ani liczb: każda liczba musi stać w odpowiedzi źródłowej, zachowaj jej wartość i jednostkę. Nie usuwaj liczb, które są sednem odpowiedzi.",
  "Żadnych ogólników („słuchaj swojego ciała”, „każdy organizm jest inny”, „to zależy”). Żadnych linków ani nazwisk osób prywatnych.",
  "Odpowiadasz wyłącznie JSON: {\"zdania\": [\"…\"]}.",
].join("\n");
const SCHEMAT_GLOSU = { type: "object", properties: { zdania: { type: "array", items: { type: "string" } } }, required: ["zdania"] };
const liczbyW = (t) => new Set((String(t || "").match(/\d+(?:[.,:]\d+)*/g) || []).map((x) => x.replace(",", ".")));

/** Strażnik przepisania: nowa liczba, ogólnik, link, dane osoby, akcja albo pusto → zostaje tekst źródłowy. → tekst albo null */
export function sprawdzPrzepisanie(zrodlowa, zdania) {
  const z = (Array.isArray(zdania) ? zdania : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, 5);
  const t = z.join(" ").replace(/\s+/g, " ").trim();
  if (t.length < MIN_ODPOWIEDZ || t.length > MAX_ODPOWIEDZ || /https?:|www\./i.test(t)) return null;
  const zr = liczbyW(zrodlowa);
  for (const l of liczbyW(t)) if (!zr.has(l)) return null;
  if (czyOgolnik(z) || wygladaNaDaneOsoby(t) || przeciekAkcji(z) || ZNACZNIK.test(t)) return null;
  return t;
}

/* Linki z Gemini to przekierowania vertexaisearch, które z czasem wygasają; do trwałej bazy zapisujemy adres docelowy (best-effort, tylko https, 3 s). */
export async function rozwinZrodla(fetchFn, zrodla) {
  return await Promise.all((zrodla || []).slice(0, MAX_ZRODEL_BAZY).map(async (z) => {
    if (!/^https:\/\/vertexaisearch\.cloud\.google\.com\//.test(String(z.url || ""))) return z;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null, tm = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
    try {
      const r = await fetchFn(z.url, { method: "GET", redirect: "manual", signal: ctrl ? ctrl.signal : undefined });
      const loc = r && r.headers && typeof r.headers.get === "function" ? r.headers.get("location") : null;
      return loc && /^https:\/\/[^\s"'<>]{4,1000}$/.test(loc) ? { ...z, url: loc } : z;
    } catch { return z; } finally { if (tm) clearTimeout(tm); }
  }));
}

/* ── baza ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const KOL = "id,klucz,pytanie,warianty,odpowiedz,zrodla,temat,intencja,waznosc,wazna_do,status,zapytan";
/** zatwierdzone wpisy; błąd albo brak tabeli (przed migracją) → pusto, potok idzie dalej do sieci */
export async function wiedzaZatwierdzone(adm) {
  const { data, error } = await adm.from("okienko_wiedza").select(KOL).eq("status", "zatwierdzona").limit(2000);
  return error || !Array.isArray(data) ? [] : data;
}
/** licznik zapytań: trafienie z bazy albo odpowiedź z pamięci 24 h; best-effort */
export async function wiedzaPolicz(adm, { id = null, klucz = null }) {
  if (!id && !klucz) return;
  try { await adm.rpc("okienko_wiedza_policz", { p_id: id, p_klucz: klucz }); } catch { /* licznik nie psuje odpowiedzi */ }
}

/**
 * Kandydat z odpowiedzi z sieci. opcje: {adm, tekst, intencja, sloty, zdania, zrodla, dzis, tlo, fetchFn, klucz, generujJson, kosztLog}.
 * tlo = działa po wysłaniu odpowiedzi (EdgeRuntime.waitUntil): wtedy też przepisanie i adresy docelowe; bez tła zapis surowy, panel oznacza go „bez przepisania”.
 * → {zapisano, przepisano, powod}. Nigdy nie rzuca dalej błędu przepisania.
 */
export async function wiedzaKandydat(o) {
  const { adm, tekst, intencja, sloty, zdania, zrodla, dzis, tlo } = o;
  if (!INTENCJE_BAZY.includes(intencja)) return { zapisano: false, powod: "intencja" };
  const pytanie = pytanieKandydata(tekst);
  if (!pytanie) return { zapisano: false, powod: "pytanie" };
  const odpowiedz = odpowiedzKandydata(zdania);
  if (!odpowiedz) return { zapisano: false, powod: "odpowiedz" };
  const wlasny = kluczWiedzy(pytanie);
  if (!wlasny) return { zapisano: false, powod: "klucz" };
  /* bliźniak: ten sam wpis innymi słowami, także odrzucony — wtedy licznik i wariant, nie duplikat */
  let klucz = wlasny;
  const { data: wiersze } = await adm.from("okienko_wiedza").select("id,klucz,pytanie,warianty,intencja,status").eq("intencja", intencja).limit(2000);
  const blizniak = dopasujWiedze(pytanie, wiersze || []);
  if (blizniak) klucz = blizniak.wpis.klucz;
  const zrodlaBazy = tlo ? await rozwinZrodla(o.fetchFn, zrodla) : (zrodla || []).slice(0, MAX_ZRODEL_BAZY);
  const czysteZrodla = zrodlaBazy.filter((z) => z && /^https:\/\/[^\s"'<>]{4,1000}$/.test(String(z.url || ""))).map((z) => ({ tytul: String(z.tytul || "").slice(0, 200), url: z.url }));
  const w = waznoscDla(pytanie, intencja, dzis, odpowiedz);
  const temat = String((sloty && sloty.temat) || "").trim().slice(0, 60) || [...sygnatura(pytanie).tokeny].slice(0, 2).join(" ") || intencja;
  const { data, error } = await adm.rpc("okienko_wiedza_kandydat", { p_klucz: klucz, p_pytanie: pytanie, p_odpowiedz: odpowiedz, p_zrodla: czysteZrodla, p_intencja: intencja, p_temat: temat,
    p_waznosc: w.waznosc, p_wazna_do: w.wazna_do, p_nietrwala: w.nietrwala, p_dzis: dzis });
  if (error) return { zapisano: false, powod: "rpc" };
  const r = Array.isArray(data) ? data[0] : data;
  if (!tlo || !r || !r.do_przepisania) return { zapisano: true, przepisano: false, id: r && r.wpis_id };
  /* przepisanie: tylko wpis nowy albo wznowiony; błąd i strażnik zostawiają tekst surowy, koszt idzie do logu */
  let tok = { we: 0, wy: 0 }, nowa = null, powod = null;
  try {
    const g = await o.generujJson({ fetchFn: o.fetchFn, klucz: o.klucz, system: PROMPT_GLOSU, contents: [{ role: "user", parts: [{ text: `PYTANIE: ${pytanie}\nODPOWIEDŹ ŹRÓDŁOWA: ${odpowiedz}` }] }], schema: SCHEMAT_GLOSU, maxOutputTokens: 400, temperature: 0.2, timeoutMs: 6000 });
    tok = g.tok || tok;
    nowa = sprawdzPrzepisanie(odpowiedz, g.json && g.json.zdania);
    if (!nowa) powod = "przepisanie odrzucone przez strażnika";
  } catch (e) { powod = "przepisanie: " + String(e && e.message).slice(0, 80); }
  if (nowa) { const u = await adm.rpc("okienko_wiedza_przepisana", { p_id: r.wpis_id, p_odpowiedz: nowa }); if (u.error) { powod = "zapis przepisania"; nowa = null; } }
  if (o.kosztLog) { try { await o.kosztLog({ tok, ok: !!nowa, powod }); } catch { /* log nie psuje */ } }
  return { zapisano: true, przepisano: !!nowa, id: r.wpis_id, powod };
}
