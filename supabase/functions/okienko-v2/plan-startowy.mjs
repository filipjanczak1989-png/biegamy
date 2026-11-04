// OKIENKO 2.0 — PLAN STARTOWY (Filip 3.11): przepis W KODZIE, model nie wybiera startów. Dane: życiówki, miasto, cele z race_goals (to samo źródło co moje_starty), poziom
// wyliczony z życiówek. Z kalendarza maszyny 3–6 startów z rolą A (główny), B (sprawdzian 3–6 tyg. przed A), C (trening startowy).
//
// REGUŁY FILIPA: po maratonie ≥ 4 tyg. i po półmaratonie ≥ 2 tyg. bez kolejnego startu w planie; maks. 1 start A na pół roku; promień 150 km (chip: 75 km).
// REGUŁY Z PROJEKTU, NIE Z POMIARU (do akceptacji Filipa): min. tygodni przed A (MIN_TYG_DO_A), min. 7 dni między startami, C najpóźniej 14 dni przed A, poziom z życiówek (PROG_POZIOMU),
// tapering (TAPERING: tygodnie = js/generator-planu.js, procenty objętości nowe). Bez życiówki i bez celu ról nie ma: plan nie udaje, że wie, co jest główne.
//
// DANE KALENDARZA (zmierzone na m3 4.11): 263 nadchodzących w kalendarz_imprezy, 9 z dystansem; 55 w upcoming_races (wszystkie z dystansem). Dystans z nazwy („Półmaraton X”) ma
// oznaczenie z_nazwy; start bez dystansu może być tylko C. Górskie, ultra, sztafety i biegi dziecięce nie zostają startem głównym. Miasto użytkownika idzie TYLKO do naszej maszyny,
// nigdy do sieci; „Zagranica” wysyła do sieci sam dystans i miesiące. EF niczego nie zapisuje: zapis robi przeglądarka po potwierdzeniu (window.dodajCeleStartowe w sb.js).
import { normalizuj, dodajDni, przeciekAkcji } from "../okienko/router.mjs";
import { f6, BladF6, ODP_F6_ZAJETA } from "../okienko/f6.mjs";
import { szukajWiedzy } from "./wiedza.mjs";
import { slotyZTekstu } from "./intencje.mjs";
import { wspolrzedne, odlegloscKm } from "./miasta-pl.mjs";
import "../../../js/riegel.js";

const R = /** @type {any} */ (globalThis).BM_RIEGEL;

export const PROMIEN_DOMYSLNY = 150, PROMIEN_BLIZEJ = 75, LICZBA_MIN = 3, LICZBA_MAX = 6, MAX_DOPYTAN = 5;
export const B_OD_DNI = 21, B_DO_DNI = 42, POL_ROKU_DNI = 182, ODSTEP_MIN_DNI = 7, C_PRZED_A_DNI = 14;
export const MIN_TYG_DO_A = { 42: 10, 21: 6, 10: 4, 5: 3 };
export const PROG_POZIOMU = { zaawansowany: 2400, sredni: 3300 };   // ekwiwalent 10 km (s): 40:00, 55:00
export const LICZBA_WG_POZIOMU = { zaawansowany: 5, sredni: 4, poczatkujacy: 3 };
/* tygodnie: te same co js/generator-planu.js DYSTANSE[…].taper (blizna-143 pilnuje równości); procenty: reguła projektu, nie pomiar */
export const TAPERING = { 42: { tyg: 3, objetosc: [80, 60, 40] }, 21: { tyg: 2, objetosc: [80, 60] }, 10: { tyg: 1, objetosc: [70] }, 5: { tyg: 1, objetosc: [70] } };
export const TAPERING_B = { tyg: 1, objetosc: [80] };
export const ODP_PLAN_LIMIT = "To już 5 zmian planu. Zapisz go albo zacznij od nowa.";

const DZIEN_MS = 86400000;
export const dniMiedzy = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DZIEN_MS);
const klasa = (km) => { if (!km) return null; for (const [k, v] of [[42, 42.195], [21, 21.0975], [10, 10], [5, 5]]) if (Math.abs(km - v) <= v * 0.03) return k; return null; };
const NAZWA_DYST = { 42: "maraton", 21: "półmaraton", 10: "10 km", 5: "5 km" };
const PRZED_DYST = { 42: "maratonem", 21: "półmaratonem", 10: "dychą", 5: "piątką" };
const PO_DYST = { 42: "maratonie", 21: "półmaratonie", 10: "dyszce", 5: "piątce" };
const dataTxt = (d) => { const p = String(d || "").split("-"); return p.length === 3 ? `${Number(p[2])}.${p[1]}.${p[0]}` : ""; };

/* ── wykrywanie pytań ── */
const SEZON = /\b(wiosn\w*|lat[oa]|latem|jesien\w*|zim[aey]|zime|zimow\w*)\b/;
const SEZON_ROK = /\b(sezon\w*|w tym roku|w przyszlym roku|na ten rok|na przyszly rok|w 20\d\d)\b/;
const CUDZE = /\b(filip\w*|kasi\w*|jego|jej|ich|kolegi|kolezanki)\b/;

/** pytanie o plan startów (nie o „mój plan” treningowy i nie o listę biegów w mieście). „gdzie pobiec dyche w grudniu” zostaje listą biegów. */
export function czyPlanStartowy(tekst) {
  const t = normalizuj(tekst);
  if (!t || CUDZE.test(t)) return false;
  if (/\bplan\w* (startow\w*|startu|zawodow|imprez|na sezon)\b|\bsezon\w* startow\w*\b/.test(t)) return true;
  if (/\b(uloz\w*|zaplanuj\w*|zaplanowac|rozpisz\w*|przygotuj\w*|zrob)\b.*\b(starty|startow|sezon\w*)\b/.test(t)) return true;
  const miejsce = slotyZTekstu(tekst).miejsce;   // „biegi wiosną w Krakowie” to lista biegów; „w sezonie”, „w jakich” to nie miejsce
  if (/\b(moj\w*|mam|mial\w*)\b/.test(t) || (miejsce && !/^(sezon\w*|jaki\w*|ktor\w*)$/.test(miejsce))) return false;
  const pyta = /\b(jakie|jakies|ktore|ile|gdzie|w jakich|na jakie|co|polec\w*|doradz\w*)\b/.test(t);
  if (pyta && /\b(starty|startow|wystartowac|startowac)\b/.test(t) && (SEZON.test(t) || SEZON_ROK.test(t))) return true;
  if (pyta && /\b(zawody|zawodach|biegi|biegach|pobiec|pobiegac)\b/.test(t) && (SEZON.test(t) || /\bsezon\w*|\bw 20\d\d\b/.test(t))) return true;
  return false;
}

/** chip albo krótkie dopytanie pod planem; null = to nie komenda planu (liczy się tylko, gdy plan jest w pamięci rozmowy) */
export function komendaPlanu(tekst) {
  const t = normalizuj(tekst);
  if (!t || t.split(" ").length > 6) return null;
  if (/\bblizej( domu)?\b|\bmniejszy promien\b/.test(t)) return "blizej";
  if (/\bwiecej (startow|biegow|zawodow)\b/.test(t)) return "wiecej";
  if (/\bzaawansowan\w*|\bcele? czasow\w*|\btapering\w*/.test(t)) return "zaawansowane";
  if (/\bzagranic\w*|\bza granic\w*/.test(t)) return "zagranica";
  if (/^zapisz( ten| moj)?( plan)?$/.test(t)) return "zapisz";
  if (/\b(zacznij|zacznijmy) od nowa\b|^od nowa$/.test(t)) return "od_nowa";
  if (t.split(" ").length <= 3 && SEZON.test(t)) return "okres";
  return null;
}

const MIESIACE = ["stycz", "lut", "mar", "kwiet", "maj", "czerw", "lip", "sierp", "wrze", "pazdz", "listop", "grud"];
const ostatni = (r, m) => new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
/** okres z tekstu: pora roku albo miesiąc → najbliższe wystąpienie od dziś; null = bez okresu */
export function okresZTekstu(tekst, dzis) {
  const t = normalizuj(tekst), rok = Number(dzis.slice(0, 4));
  const zakres = (mOd, mDo, r = rok) => {
    const a = { od: `${r}-${String(mOd).padStart(2, "0")}-01`, do: ostatni(mDo < mOd ? r + 1 : r, mDo) };
    return a.do < dzis ? zakres(mOd, mDo, r + 1) : { od: a.od < dzis ? dzis : a.od, do: a.do };
  };
  if (/\bwiosn\w*/.test(t)) return zakres(3, 5);
  if (/\b(lat[oa]|latem)\b/.test(t)) return zakres(6, 8);
  if (/\bjesien\w*/.test(t)) return zakres(9, 11);
  if (/\b(zim[aey]|zime|zimow\w*)\b/.test(t)) return zakres(12, 2);
  const m = t.match(/\bw (stycz\w*|lut\w*|marc\w*|kwietni\w*|maju|czerwc\w*|lipc\w*|sierpni\w*|wrzesni\w*|pazdzierni\w*|listopad\w*|grudni\w*)\b/);
  if (m) { const i = MIESIACE.findIndex((x) => m[1].startsWith(x)) + 1; if (i > 0) return zakres(i, i); }
  return null;
}

/* ── ustawienia w pamięci rozmowy (slot `plan`, ≤ 60 znaków) ── */
export const DOMYSLNE = () => ({ promien: PROMIEN_DOMYSLNY, liczba: 0, zaaw: false, zagr: false, k: 0 });
export const kodUstawien = (u) => `p${u.promien};n${u.liczba};z${u.zaaw ? 1 : 0};g${u.zagr ? 1 : 0};k${u.k}`;
export function zKodu(s) {
  const m = /^p(\d{1,3});n(\d);z([01]);g([01]);k(\d{1,2})$/.exec(String(s || ""));
  return m ? { promien: Number(m[1]), liczba: Number(m[2]), zaaw: m[3] === "1", zagr: m[4] === "1", k: Number(m[5]) } : null;
}
/** ostatnia wersja planu z pamięci rozmowy (≤ 3 tury wstecz): ustawienia, okres; null = planu nie ma */
export function stanZRozmowy(rozmowa) {
  const t = (rozmowa || []).slice(0, 3).find((x) => x && x.intencja === "plan_startowy");
  if (!t) return null;
  const u = zKodu(t.sloty && t.sloty.plan);
  return u ? { u, od: (t.sloty && t.sloty.od) || null, do: (t.sloty && t.sloty.do) || null } : null;
}
/** każdy chip = nowa wersja z poprzednimi ustawieniami; po MAX_DOPYTAN zmiana nie wchodzi (limit: true); „zapisz” nie liczy się jako zmiana */
export function nastepneUstawienia(poprz, komenda) {
  const u = { ...(poprz || DOMYSLNE()) };
  if (komenda === "od_nowa") return { u: DOMYSLNE(), limit: false };
  if (!komenda || komenda === "zapisz") return { u, limit: false };
  if (u.k >= MAX_DOPYTAN) return { u, limit: true };
  u.k += 1;
  if (komenda === "blizej") u.promien = PROMIEN_BLIZEJ;
  if (komenda === "wiecej") u.liczba = LICZBA_MAX;
  if (komenda === "zaawansowane") u.zaaw = true;
  if (komenda === "zagranica") u.zagr = true;
  return { u, limit: false };
}

/* ── dane biegacza ── */
export function pbSekundy(s) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
export function zyciowki(a) {
  const pb = {}, wpisz = (km, v) => { const s = pbSekundy(v); if (s) pb[km] = s; };
  wpisz(5, a && a.pb_5k); wpisz(10, a && a.pb_10k); wpisz(21.0975, a && a.pb_half); wpisz(42.195, a && a.pb_marathon);
  return pb;
}
export function poziomZPb(pb) {
  const e = Object.entries(pb || {}).map(([km, s]) => R.ekwiwalent10(s, Number(km)));
  if (!e.length) return null;
  const naj = Math.min(...e);
  return naj <= PROG_POZIOMU.zaawansowany ? "zaawansowany" : naj <= PROG_POZIOMU.sredni ? "sredni" : "poczatkujacy";
}
/** preferowane dystanse startu głównego: od najdłuższej życiówki w dół; początkujący bez maratonu jako głównego */
export function preferencje(pb, poziom) {
  const znane = Object.keys(pb || {}).map(Number);
  if (!znane.length) return [];
  const naj = klasa(Math.max(...znane));
  const lista = [42, 21, 10, 5].filter((k) => k <= naj);
  return poziom === "poczatkujacy" ? lista.filter((k) => k <= 21) : lista;
}

/* ── kandydaci ── */
const WYKLUCZONE = /\b(dwumaraton\w*|ultra\w*|ultramaraton\w*|sztafet\w*|nordic\w*|dzieci\w*|dzieciak\w*|kids|przedszkol\w*|mlodych|mlodzik\w*|wirtualn\w*|virtual|rowerow\w*|plywack\w*|triathlon\w*|duathlon\w*)\b/;
const GORSKI = /\b(gorsk\w*|gor|trail\w*|skyrun\w*|beskid\w*|wertykal\w*|vertical|sudeck\w*|tatr\w*|bieszczad\w*|festiwal gorski)\b/;
const MIASTO_NIE = /^(polska|caly swiat|swiat)$/;
/** dystanse wynikające z samej nazwy („Nocny Maraton i Półmaraton” → oba) */
export function dystansZNazwy(nazwa) {
  const t = normalizuj(nazwa), w = [];
  if (WYKLUCZONE.test(t)) return w;
  if (/\bmaraton\w*/.test(t)) w.push(42.195);
  if (/\bpolmaraton\w*/.test(t)) w.push(21.0975);
  if (/\bdych\w*/.test(t)) w.push(10);
  if (/\bpiatk\w*|\b5 ?tk\w*/.test(t)) w.push(5);
  const m = t.match(/\b(\d{1,2})(?: \d+)? ?km\b/);
  if (m && Number(m[1]) >= 3) w.push(Number(m[1]));
  return [...new Set(w)];
}
function dystanseZ(v) {
  const l = Array.isArray(v) ? v : String(v || "").split(/[;,|]/);
  return l.map((x) => Number(String(x).replace(",", ".").replace(/[^\d.]/g, ""))).filter((x) => x > 0);
}
/* Kalendarz ma 6980 z 54 100 nazw uciętych w źródle na ok. 40 znakach („22. Nocny Maraton Kanału Bydgoskiego od ...”). Pełnej nazwy nie znamy (Filip 4.11: bez urwanych nazw w planie),
   więc zostają całe słowa, bez wielokropka i bez wiszącego spójnika. Bez odstępu przed kropkami ostatnie słowo jest ucięte. Wykluczenia i strażnik akcji patrzą na pełny tekst ze źródła. */
const WISZACE = /\s+(?:od|do|na|w|we|z|ze|i|o|u|a|dla|po|przy|pod|nad|za|ku|oraz|im\.|-|–|—)$/i;
export function nazwaBezUciecia(n) {
  const s = String(n || "").trim(), m = s.match(/^(.*?)(\s*)(?:\.{3}|…)$/su);
  if (!m) return s;
  let t = m[2] ? m[1] : (/\s/.test(m[1]) ? m[1].replace(/\s+\S*$/, "") : m[1]);
  for (let p; p !== t;) { p = t; t = t.replace(/[,;:]+$/, "").replace(WISZACE, "").trim(); }
  return t || m[1].trim();
}
/** Uwaga „masz trenera” tylko przy innym trenerze: konto trenera bywa podpięte samo do siebie. */
export function maInnegoTrenera(a) { return !!(a && a.coach_id && a.coach_id !== a.user_id); }
/** wiersz F6 (events_search albo upcoming_races) → kandydat; wykluczony = biegi dziecięce, sztafety, ultra, wirtualne */
export function mapujKandydata(r) {
  const zrodlowa = String(r.nazwa ?? r.name ?? "").replace(/^nowe zapisy\s*-\s*/i, "").trim().slice(0, 120), nazwa = nazwaBezUciecia(zrodlowa);
  const miasto = r.miejscowosc ?? r.city ?? null, t = normalizuj(zrodlowa);
  const zDanych = dystanseZ(r.dystanse ?? r.distances);
  const dl = zDanych.filter((x) => x >= 3);
  const zNazwy = dl.length ? [] : dystansZNazwy(zrodlowa);
  const klucz = String(r.klucz ?? "");
  const url = [r.url_zapisy, r.url_organizer, r.url_regulamin, r.source_url, r.url_wyniki].find((u) => typeof u === "string" && /^https:\/\/[^\s"'<>]{4,300}$/.test(u)) || null;
  return { nazwa, data: r.data ?? r.event_date ?? null, miasto: miasto ? String(miasto).slice(0, 60) : null, dystanse: dl.length ? dl : zNazwy, z_nazwy: !dl.length && zNazwy.length > 0,
    klucz: /^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$/.test(klucz) ? klucz : null, url, gorski: GORSKI.test(t),
    wykluczony: WYKLUCZONE.test(t) || (zDanych.length > 0 && !dl.length) || MIASTO_NIE.test(normalizuj(miasto)) || r.dokladnosc_daty === "miesiac" || !!przeciekAkcji([`${zrodlowa} ${miasto || ""}`]) };
}
const bezCyfr = (s) => normalizuj(s).replace(/[0-9]/g, "").replace(/\s+/g, "");
/** ta sama impreza z dwóch źródeł (data ±1, nazwa bez cyfr): zostaje wiersz z dystansem z danych i z kluczem */
export function bezDubli(lista) {
  const out = [];
  for (const c of lista) {
    const i = out.findIndex((x) => Math.abs(dniMiedzy(x.data, c.data)) <= 1 && bezCyfr(x.nazwa) === bezCyfr(c.nazwa));
    if (i < 0) { out.push(c); continue; }
    const o = out[i], lepszy = (c.dystanse.length && !c.z_nazwy && (!o.dystanse.length || o.z_nazwy)) ? c : o, gorszy = lepszy === c ? o : c;
    out[i] = { ...lepszy, klucz: lepszy.klucz || gorszy.klucz, url: lepszy.url || gorszy.url };
  }
  return out;
}

const pasuje = (c, k) => c.dystanse.find((d) => klasa(d) === k) || null;
/** odstęp wymagany PO starcie o dystansie km */
export const odstepPo = (km) => (km >= 40 ? 28 : km >= 20 ? 14 : ODSTEP_MIN_DNI);
/** czy start można dołożyć do planu bez złamania odstępów; zwraca false także dla C tuż przed A */
export function odstepOk(plan, c) {
  for (const p of plan) {
    const d = dniMiedzy(p.data, c.data);   // > 0: c po p
    if (d === 0) return false;
    if (d > 0 && d < odstepPo(p.km)) return false;
    if (d < 0 && -d < odstepPo(c.km)) return false;
    if (c.rola === "C" && p.rola === "A" && d < 0 && -d < C_PRZED_A_DNI) return false;
  }
  return true;
}
/** maks. 1 start A na pół roku */
export const moznaA = (plan, c) => plan.filter((p) => p.rola === "A").every((p) => Math.abs(dniMiedzy(p.data, c.data)) >= POL_ROKU_DNI);

function powodB(dni, A) { return `${Math.round(dni / 7)} tyg. przed ${PRZED_DYST[klasa(A.km)] || "startem głównym"}, sprawdzisz tempo.`; }
function powodC(s, A) {
  const brakDyst = s.km ? "" : " Dystans sprawdź na stronie imprezy.";
  if (!A) return `Trening startowy, bez ścigania się.${brakDyst}`;
  const d = dniMiedzy(s.data, A.data);
  if (d > 16 * 7) return `Trening startowy na początek przygotowań, bez ścigania się.${brakDyst}`;
  if (d > 0) return `Trening startowy ${Math.round(d / 7)} tyg. przed ${PRZED_DYST[klasa(A.km)] || "startem głównym"}, bez ścigania się.${brakDyst}`;
  return `Trening startowy ${Math.round(-d / 7)} tyg. po ${PO_DYST[klasa(A.km)] || "starcie głównym"}, na luzie.${brakDyst}`;
}
const zKm = (c, km) => ({ ...c, km: km || null, dystanse: km ? [km, ...c.dystanse.filter((x) => x !== km)] : c.dystanse });

function wybierzB(kand, A, dzis) {
  const CELE = klasa(A.km) === 42 ? [21.0975, 30, 15, 10] : klasa(A.km) === 21 ? [10, 15, 5] : [5, 3];
  let naj = null, wynik = Infinity;
  for (const c of kand) {
    const d = dniMiedzy(c.data, A.data);
    if (d < B_OD_DNI || d > B_DO_DNI || c.gorski || dniMiedzy(dzis, c.data) < ODSTEP_MIN_DNI) continue;
    for (const km of c.dystanse) {
      if (km >= A.km * 0.8) continue;
      const s = Math.min(...CELE.map((x, i) => Math.abs(km - x) / x + i * 0.1)) + Math.abs(d - 28) / 100;
      if (s < wynik) { wynik = s; naj = zKm(c, km); }
    }
  }
  return naj ? { ...naj, rola: "B", powod: powodB(dniMiedzy(naj.data, A.data), A) } : null;
}
function wybierzGlowny(kand, pref, dzis, od, doD) {
  for (const k of pref) {
    const lista = kand.filter((c) => !c.gorski && pasuje(c, k) && c.data >= od && c.data <= doD && dniMiedzy(dzis, c.data) >= MIN_TYG_DO_A[k] * 7).sort((a, b) => a.data.localeCompare(b.data));
    if (!lista.length) continue;
    const zB = lista.find((c) => wybierzB(kand.filter((x) => x !== c), zKm(c, pasuje(c, k)), dzis));
    const c = zB || lista[0];
    return zKm(c, pasuje(c, k));
  }
  return null;
}

/** CZYSTA FUNKCJA reguł planu (bez sieci i bazy). w: {dzis, kandydaci[{nazwa,data,miasto,dystanse,gorski,wykluczony,odl}], cele[{nazwa,data,km}], pb, poziom, znamMiasto, promien, liczba, od, do}
    → {starty[], uwagi[], role:boolean, poza, bezOdleglosci} */
export function ulozPlan(w) {
  const { dzis, pb = {}, poziom = null, cele = [] } = w;
  const promien = w.promien || PROMIEN_DOMYSLNY, od = w.od || dzis, doD = w.do || dodajDni(dzis, 365);
  const liczba = Math.min(LICZBA_MAX, Math.max(LICZBA_MIN, w.liczba || LICZBA_WG_POZIOMU[poziom] || 4));
  const uwagi = [], znamMiasto = w.znamMiasto !== false;
  const celeDalej = cele.filter((g) => g.data > dzis && g.data <= doD);
  const jestCel = (c) => celeDalej.some((g) => Math.abs(dniMiedzy(g.data, c.data)) <= 1 && bezCyfr(g.nazwa) === bezCyfr(c.nazwa));
  const wszystkie = (w.kandydaci || []).filter((c) => c.data && c.data > dzis && c.data <= doD && !c.wykluczony && !jestCel(c));
  let poza = 0, bezOdleglosci = 0;
  const kand = wszystkie.filter((c) => {
    if (!znamMiasto) return true;
    if (c.odl == null) { bezOdleglosci++; return false; }
    if (c.odl > promien) { poza++; return false; }
    return true;
  });
  const plan = [];
  const pref = preferencje(pb, poziom);
  /* A: cel użytkownika o znanym dystansie (najdłuższy, przy remisie najbliższy) ma pierwszeństwo przed kalendarzem */
  const celeZKm = celeDalej.filter((g) => g.km > 0).sort((a, b) => b.km - a.km || a.data.localeCompare(b.data));
  celeDalej.filter((g) => !(g.km > 0)).forEach((g) => uwagi.push(`Cel „${g.nazwa}” nie ma dystansu, więc nie układam pod niego planu. Uzupełnij go w Startach.`));
  let A = null;
  if (celeZKm.length) {
    const g = celeZKm[0];
    A = { nazwa: g.nazwa, data: g.data, miasto: g.miasto || null, km: g.km, dystanse: [g.km], klucz: g.klucz || null, url: null, gorski: false, odl: null, rola: "A", zCelu: true, powod: "Twój cel startowy. Reszta planu jest ułożona pod niego." };
  } else if (pref.length) {
    const c = wybierzGlowny(kand, pref, dzis, od, doD);
    if (c) {
      A = { ...c, rola: "A", powod: `Główny start: ${NAZWA_DYST[klasa(c.km)]} za ${Math.round(dniMiedzy(dzis, c.data) / 7)} tyg., czasu na przygotowanie wystarczy.` };
      if (klasa(c.km) !== pref[0]) uwagi.push(`W promieniu ${promien} km kalendarz nie ma startu na ${NAZWA_DYST[pref[0]]} w tym okresie, więc głównym jest ${NAZWA_DYST[klasa(c.km)]}.`);
    } else uwagi.push(`W promieniu ${promien} km kalendarz nie ma startu, który mógłby być główny w tym okresie.`);
    if (!c || klasa(c.km) !== pref[0]) {
      const dalej = wszystkie.filter((x) => pasuje(x, pref[0]) && !x.gorski && x.odl != null && x.odl > promien && dniMiedzy(dzis, x.data) >= MIN_TYG_DO_A[pref[0]] * 7 && x.data >= od).sort((a, b) => a.data.localeCompare(b.data))[0];
      if (dalej) uwagi.push(`Najbliższy ${NAZWA_DYST[pref[0]]} dalej: ${dalej.nazwa}, ${dataTxt(dalej.data)}, ${dalej.miasto} (${dalej.odl} km).`);
    }
  }
  const role = !!A || pref.length > 0;
  if (A) plan.push(A);
  /* pozostałe cele użytkownika zostają w planie, nawet gdy łamią odstęp: to jego decyzja, plan tylko o tym mówi */
  for (const g of celeZKm.slice(1)) {
    const d = dniMiedzy(g.data, A.data), b = d >= B_OD_DNI && d <= B_DO_DNI && g.km < A.km * 0.8;
    const s = { nazwa: g.nazwa, data: g.data, miasto: g.miasto || null, km: g.km, dystanse: [g.km], klucz: g.klucz || null, url: null, gorski: false, odl: null, zCelu: true };
    const rola = b ? "B" : (moznaA(plan, s) && g.km >= 21 ? "A" : "C");
    if (!odstepOk(plan, { ...s, rola })) uwagi.push(`Twój cel „${g.nazwa}” wypada za blisko innego startu: reguła mówi ${odstepPo(Math.max(g.km, A.km))} dni przerwy.`);
    plan.push({ ...s, rola, powod: b ? powodB(d, A) : rola === "A" ? "Twój cel startowy, ponad pół roku od poprzedniego głównego." : "Twój cel startowy, tym razem jako trening." });
  }
  if (A && plan.length < liczba && !plan.some((p) => p.rola === "B")) {
    const b = wybierzB(kand.filter((c) => !plan.some((p) => p.nazwa === c.nazwa && p.data === c.data)), A, dzis);
    if (b && odstepOk(plan, b)) plan.push(b); else uwagi.push(`Kalendarz nie ma sprawdzianu 3–6 tyg. przed ${dataTxt(A.data)}.`);
  }
  /* drugi główny tylko przy „Więcej startów” i tylko ponad pół roku od pierwszego */
  if (A && liczba >= LICZBA_MAX && !A.zCelu) {
    const k = klasa(A.km), c2 = kand.filter((c) => pasuje(c, k) && !c.gorski && c.data >= od && moznaA(plan, { data: c.data }) && !plan.some((p) => p.nazwa === c.nazwa)).sort((a, b) => a.data.localeCompare(b.data))[0];
    if (c2) { const s = zKm(c2, pasuje(c2, k)); if (odstepOk(plan, s)) plan.push({ ...s, rola: "A", powod: "Drugi główny start, ponad pół roku od pierwszego." }); }
  }
  /* C: najpierw bliżej domu i przed A, potem po A; krótsze od A; bez dystansu dozwolone, ale tylko jako C */
  const kolejka = kand.filter((c) => dniMiedzy(dzis, c.data) >= ODSTEP_MIN_DNI && !plan.some((p) => p.nazwa === c.nazwa && p.data === c.data))
    .sort((a, b) => (A ? (a.data > A.data) - (b.data > A.data) : 0) || ((a.odl ?? 999) > 50) - ((b.odl ?? 999) > 50) || (b.dystanse.length > 0) - (a.dystanse.length > 0) || a.data.localeCompare(b.data));
  for (const c of kolejka) {
    if (plan.length >= liczba) break;
    if (c.data < od && !A) continue;
    const dyst = A ? c.dystanse.filter((km) => (A.km >= 20 ? km < A.km * 0.8 : km <= A.km * 1.03)) : c.dystanse;
    if (A && c.dystanse.length && !dyst.length) continue;   // przy głównym półmaratonie i maratonie start tak długi jak główny to nie trening; przy dyszce kolejna dycha jest w porządku
    const km = dyst.length ? Math.min(...dyst) : null;
    const s = { ...zKm(c, km), rola: role ? "C" : null };
    if (!odstepOk(plan, s)) continue;
    plan.push({ ...s, powod: role ? powodC(s, A) : (s.odl != null ? `${s.odl} km od Ciebie.` : "Odległości nie znam.") });
  }
  if (!role) uwagi.unshift("Nie znam Twojego celu ani życiówki, więc nie wybieram startu głównego. Uzupełnij je w Profilu, a ułożę role.");
  if (plan.length && plan.length < LICZBA_MIN) uwagi.push(`Reguły odstępów i kalendarz dają tylko ${plan.length} ${plan.length === 1 ? "start" : "starty"} w tym promieniu.`);
  if (!znamMiasto) uwagi.push("Nie mam Twojego miasta na mapie, więc nie filtruję po odległości. Ustaw je w Profilu.");
  else if (bezOdleglosci) uwagi.push(`Pominąłem starty bez znanej odległości (${bezOdleglosci}): ich miejscowości nie mam na mapie.`);
  plan.sort((a, b) => a.data.localeCompare(b.data));
  return { starty: plan, uwagi, role, poza, bezOdleglosci };
}

/** cel czasowy ze wzoru Riegla (js/riegel.js) z najbliższej życiówki; null bez życiówki, bez dystansu i na trasie górskiej. To orientacja, nie prognoza. */
export function celCzasowy(pb, km, gorski = false) {
  const znane = Object.entries(pb || {});
  if (!km || gorski || !znane.length) return null;
  const [pbKm, s] = znane.map(([k, v]) => [Number(k), v]).sort((a, b) => Math.abs(Math.log(a[0] / km)) - Math.abs(Math.log(b[0] / km)))[0];
  return { czas_s: Math.round(R.przelicz(s, pbKm, km) / 5) * 5, z_km: pbKm };
}
export function taperingDla(s) {
  if (s.rola === "A") return TAPERING[klasa(s.km)] || null;
  if (s.rola === "B") return TAPERING_B;
  return null;
}

/* ── pobranie kalendarza: upcoming_races (z dystansami) + events_search po słowach (żaden RPC nie oddaje całego kalendarza) ── */
export async function pobierzKalendarz(fetchFn, token, dzis, doD, miasto, teraz) {
  const srodek = dodajDni(dzis, 120) < doD ? dodajDni(dzis, 120) : doD;
  const szukaj = (p_q, p_from, p_to) => ["events_search", { p_q, p_from, p_to, p_limit: 20 }];
  const zap = [["upcoming_races", { p_from: dzis, p_to: doD, lim: 300 }], szukaj("maraton", dzis, srodek), szukaj("maraton", srodek, doD), szukaj("polmaraton", dzis, srodek), szukaj("polmaraton", srodek, doD),
    szukaj("bieg", dzis, srodek), szukaj("bieg", srodek, doD)];
  if (miasto) zap.push(szukaj(String(miasto).slice(0, 40), dzis, doD));
  const w = await Promise.allSettled(zap.map(([rpc, a]) => f6(fetchFn, token, rpc, a, teraz)));
  const udane = w.filter((x) => x.status === "fulfilled");
  if (!udane.length) { const b = w[0].reason; throw b instanceof BladF6 ? b : new BladF6("blad"); }
  return { wiersze: udane.flatMap((x) => x.value), czesciowo: udane.length < w.length };
}

const httpsOk = (u) => /^https:\/\//.test(String(u || ""));
async function zagranica(ctx, A) {
  const { d, adm, teraz, dzis, fetchFn, gemini } = ctx;
  const dyst = A && NAZWA_DYST[klasa(A.km)] ? NAZWA_DYST[klasa(A.km)] : "półmaraton albo maraton";
  const q = `Popularne biegi za granicą dla Polaków: ${dyst}, od ${dataTxt(dzis)} do ${dataTxt(dodajDni(dzis, 365))}. Podaj nazwę, miasto, kraj i datę.`;
  const klucz = normalizuj(q);
  const pam = await d.zPamieci(adm, klucz, teraz).catch(() => null);
  if (pam && pam.zrodla && pam.zrodla.length) return { zdania: pam.zdania, zrodla: pam.zrodla, tok: { we: 0, wy: 0 }, zapytania: 0 };
  if (!(await ctx.sieciDozwolona())) return { limit: true, zdania: [], zrodla: [], tok: { we: 0, wy: 0 }, zapytania: 0 };
  const o = await szukajWiedzy({ d, fetchFn, klucz: gemini, tekst: q, dzis, intencja: "zagranica" });
  const czyste = !przeciekAkcji(o.zdania) && o.zrodla.filter((z) => httpsOk(z.url)).length > 0;
  if (czyste) await d.doPamieci(adm, klucz, o.zdania, o.zrodla, "gemini-3.5-flash-lite", teraz);
  return { zdania: czyste ? o.zdania : [], zrodla: czyste ? o.zrodla : [], tok: o.tok, zapytania: o.zapytania || 0 };
}

const odmStart = (n) => (n === 1 ? "start" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "starty" : "startów");
const CHIPY_PLANU = [["Bliżej domu", (u) => u.promien > PROMIEN_BLIZEJ], ["Więcej startów", (u) => u.liczba < LICZBA_MAX], ["Zaawansowane", (u) => !u.zaaw], ["Zagranica", (u) => !u.zagr]];
export function chipyPlanu(u, limit) {
  const koncowe = [{ etykieta: "Zapisz plan", pytanie: "Zapisz plan" }, { etykieta: "Zacznij od nowa", pytanie: "Zacznij od nowa" }];
  if (limit || u.k >= MAX_DOPYTAN) return koncowe;
  const z = CHIPY_PLANU.filter(([, wolno]) => wolno(u)).map(([e]) => ({ etykieta: e, pytanie: e }));
  return z.length ? z : koncowe;
}
const celZapisu = (s) => ({ name: s.nazwa, date: s.data, ...(s.miasto ? { miejscowosc: s.miasto } : {}), ...(s.km ? { distance_km: s.km } : {}), ...(s.klucz ? { impreza_klucz: s.klucz } : {}) });

/** przepis: r = {sloty, komenda, rozmowa}; → {body, log, meta:null}. Zdania i karty składa kod; meta null, bo liczby nie pochodzą z narzędzi v1 */
export async function wykonajPlanStartowy(ctx, r) {
  const { sb, athleteId, fetchFn, jwt, dzis, teraz } = ctx;
  const { data: a, error } = await sb.from("athletes").select("city,lat,lon,user_id,coach_id,race_goals,pb_5k,pb_10k,pb_half,pb_marathon").eq("id", athleteId).maybeSingle();
  if (error) throw new Error("athletes");
  const stan = stanZRozmowy(r.rozmowa), komenda = r.komenda || null;
  const { u, limit } = nastepneUstawienia(stan ? stan.u : null, komenda);
  const okres = okresZTekstu(ctx.tekst, dzis) || (r.sloty && r.sloty.od && r.sloty.do ? { od: r.sloty.od, do: r.sloty.do } : null) || (komenda === "od_nowa" || !stan || !stan.od ? null : { od: stan.od, do: stan.do });
  const doD = (okres && okres.do) || dodajDni(dzis, 365);
  const pb = zyciowki(a), poziom = poziomZPb(pb);
  const dom = a && Number.isFinite(a.lat) && Number.isFinite(a.lon) ? [a.lat, a.lon] : wspolrzedne(a && a.city);
  /* cele: to samo pole co moje_starty; przeszłe odpadają w ulozPlan */
  let surowe = [];
  try { surowe = typeof (a && a.race_goals) === "string" ? JSON.parse(a.race_goals) : (a && a.race_goals) || []; } catch { surowe = []; }
  const cele = (Array.isArray(surowe) ? surowe : []).filter((g) => g && /^\d{4}-\d{2}-\d{2}/.test(String(g.date || ""))).map((g) => {
    const zrodlowa = String(g.name || "").slice(0, 120), nazwa = nazwaBezUciecia(zrodlowa), z = dystansZNazwy(zrodlowa);
    return { nazwa, data: String(g.date).slice(0, 10), km: Number(g.distance_km) > 0 ? Number(g.distance_km) : (z[0] || null), miasto: g.miejscowosc || null, klucz: g.impreza_klucz || null };
  });
  let kal, f6Blad = null;
  try { kal = await pobierzKalendarz(fetchFn, jwt, dzis, doD, a && a.city, teraz.getTime ? teraz.getTime() : Date.now()); }
  catch (e) { f6Blad = (e && e.kod) || "blad"; kal = { wiersze: [], czesciowo: false }; }
  const kandydaci = bezDubli(kal.wiersze.map(mapujKandydata).filter((c) => c.nazwa && c.data)).map((c) => ({ ...c, odl: dom ? odlegloscKm(dom, wspolrzedne(c.miasto)) : null }));
  const plan = ulozPlan({ dzis, kandydaci, cele, pb, poziom, znamMiasto: !!dom, promien: u.promien, liczba: u.liczba, od: okres && okres.od, do: okres && okres.do });
  const glowny = plan.starty.find((s) => s.rola === "A") || null;
  const zdania = [];
  if (f6Blad) zdania.push(f6Blad === "limit" ? ODP_F6_ZAJETA : "Nie udało się teraz pobrać kalendarza. Spróbuj za chwilę.");
  else if (plan.starty.length) zdania.push(`Plan w promieniu ${u.promien} km: ${plan.starty.length} ${odmStart(plan.starty.length)}${glowny ? `, główny ${glowny.nazwa} (${dataTxt(glowny.data)})` : ""}.`);
  else zdania.push(`Kalendarz nie ma startów spełniających reguły w promieniu ${u.promien} km.`);
  if (limit) zdania.unshift(ODP_PLAN_LIMIT);
  if (maInnegoTrenera(a)) plan.uwagi.push("Masz trenera: pokaż mu ten plan, jego zdanie ma pierwszeństwo.");

  const karty = plan.starty.map((s) => ({ typ: "plan_start", dane: { rola: s.rola, nazwa: s.nazwa, data: s.data, miasto: s.miasto, km: s.km, z_nazwy: !!s.z_nazwy, odl: s.odl ?? null, powod: s.powod, klucz: s.klucz, url: s.url, dystanse: s.dystanse, zCelu: !!s.zCelu, gorski: !!s.gorski,
    ...(u.zaaw ? { cel_czasu: celCzasowy(pb, s.km, s.gorski), tapering: taperingDla(s) } : {}) } }));
  const doZapisu = plan.starty.filter((s) => !s.zCelu);
  if (komenda === "zapisz" && doZapisu.length) {
    zdania.unshift(`Dodam ${doZapisu.length} ${odmStart(doZapisu.length)} do Twoich celów. Istniejących celów nie zmieniam.`);
    karty.push({ typ: "plan_zapis", dane: { starty: doZapisu.map(celZapisu) } });
  } else if (doZapisu.length) karty.push({ typ: "plan_przycisk", dane: {} });

  const body = { zdania, uwagi: plan.uwagi.slice(0, 4), karty, akcja: null, zrodla: [], narzedzia: ["plan_startowy"], tryb: "plan", koszt_tok: { we: 0, wy: 0 }, chipy: chipyPlanu(u, limit) };
  const log = { narzedzia: ["plan_startowy"], plan: ["plan_startowy"] };
  if (u.zagr && !limit) {
    const z = await zagranica(ctx, glowny);
    body.zagranica = { zdania: z.zdania, zrodla: z.zrodla, limit: !!z.limit };
    body.koszt_tok = z.tok; log.tok_we = z.tok.we; log.tok_wy = z.tok.wy; log.zapytania_sieci = z.zapytania;
  }
  r.sloty = { ...(r.sloty || {}), plan: kodUstawien(u), ...(okres ? { od: okres.od, do: okres.do } : {}) };
  return { body, log, meta: null };
}
