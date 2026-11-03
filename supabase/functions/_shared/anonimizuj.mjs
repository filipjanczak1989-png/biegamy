// ANONIMIZACJA tekstów z logów Okienka (Filip 3.11 16:12; blizna-125) — JEDNO źródło dla EF okienko-raport-dane (po stronie serwera,
// zanim cokolwiek opuści bazę) i narzędzia tools/okienko-raport-dnia.mjs (druga warstwa, przed zapisem do publicznego repo).
// Imiona (słownik PESEL + zdrobnienia, ./imiona.mjs; także w odmianie dla słów z wielkiej litery: Anny, Kasię, Tomka) i nazwiska (słowo
// po imieniu albo para słów z wielkiej litery) → [OSOBA]; e-maile, telefony, adresy URL z parametrami → usunięte. Sportowcy publiczni
// z krótkiej listy zostają; „Filip”/„Kasia” bez nazwiska zostają (osoby projektu z pliku „o nas”), z nazwiskiem — zamazane.
// Zasada: lepiej zamazać za dużo niż za mało — raport ma mówić o JAKOŚCI odpowiedzi, nie o ludziach. Bez Deno, bez bazy.
import { IMIONA, normalizujSlowo } from "./imiona.mjs";

export const PUBLICZNI = ["kipchoge", "korzeniowski", "lewandowski", "sawe", "kiptum", "bekele", "radcliffe", "assefa", "hassan"];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TELEFON = /(?:\+?\d[\s-]?){9,12}/g;
const URL_Z_PARAM = /https?:\/\/\S+\?\S+/g;
const SLOWO_WIELKIE = /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż'-]{2,}$/;
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();
const PYTAJNE_BIEGOWE = /^(bieg\w*|maraton\w*|polmaraton\w*|ultra\w*|trail\w*|parkrun\w*|zawod\w*|puchar\w*|memorial\w*|mistrzostw\w*|kto|co|jak|ile|gdzie|kiedy|czy|dlaczego|plan|trening\w*|dzis|jutro|wczoraj|tydzien|miesiac|rok|garmin\w*|coros|suunto|polar\w*|strava|biegamy|okienko|radio|niepodleglosci|warszaw\w*|poznan\w*|krakow\w*|gdansk\w*|wroclaw\w*|lodz\w*|berlin\w*|debn\w*)$/;
const O_NAS = /^(filip\w*|kasia|kasi\w*)$/;
const oczysc = (s) => String(s || "").replace(/^[„"(\[]+|[.,;:!?)\]"”]+$/g, "");

/** czy słowo to imię ze słownika — także w odmianie dla słów z wielkiej litery (Anny → Anna, Kasię → Kasia, Tomka → Tomek) */
export function czyImie(slowo, odmiana = true) {
  const czyste = oczysc(slowo);
  if (/^\[/.test(czyste)) return false;   // placeholder ([e-mail], [OSOBA])
  const w = normalizujSlowo(czyste.replace(/[^\p{L}'-]/gu, ""));
  if (!w || w.length < 3) return false;
  if (IMIONA.has(w)) return true;
  if (!odmiana || !SLOWO_WIELKIE.test(czyste)) return false;   // odmianę zgadujemy tylko dla słów z wielkiej litery („albo” to nie „Alba”)
  const kand = [w.slice(0, -1), w.slice(0, -1) + "a", w.slice(0, -2) + "a", w.slice(0, -2), w.replace(/ka$/, "ek"), w.replace(/kiem$/, "ek"), w.replace(/kowi$/, "ek"), w.replace(/i$/, "ia"), w.replace(/ie$/, "ia"), w.replace(/e$/, "a")];
  return kand.some((k) => k.length >= 3 && IMIONA.has(k));
}

/** @returns {string} tekst bez imion, nazwisk, e-maili, telefonów; [OSOBA] w miejsce osoby */
export function anonimizuj(tekst) {
  const t = String(tekst || "").replace(EMAIL, "[e-mail]").replace(URL_Z_PARAM, "[adres]").replace(TELEFON, (m) => (/\d{9,}/.test(m.replace(/\D/g, "")) ? "[telefon]" : m));
  const czesci = t.split(/(\s+)/);   // zachowuje odstępy
  const out = [];
  let poprzednieOsoba = false;
  for (let i = 0; i < czesci.length; i++) {
    const s = czesci[i];
    if (!s) continue;
    if (/^\s+$/.test(s)) { out.push(s); continue; }
    const czyste = oczysc(s), f = fold(czyste), nastepne = oczysc(czesci[i + 2] || ""), fn = fold(nastepne);
    if (PUBLICZNI.includes(f)) { out.push(s); poprzednieOsoba = false; continue; }
    const oNasBezNazwiska = O_NAS.test(f) && !SLOWO_WIELKIE.test(nastepne);
    const imie = !oNasBezNazwiska && czyImie(czyste, true) && !PYTAJNE_BIEGOWE.test(f);
    const nazwiskoPoImieniu = poprzednieOsoba && /^[\p{L}'-]{3,}$/u.test(czyste) && !/^\[/.test(czyste) && !PYTAJNE_BIEGOWE.test(f) && !/^(i|o|z|w|na|do|od|dla|oraz|albo|lub|ale|jest|był\w*|ma)$/.test(f);
    const paraWielkich = i > 0 && SLOWO_WIELKIE.test(czyste) && SLOWO_WIELKIE.test(nastepne) && !PYTAJNE_BIEGOWE.test(f) && !PYTAJNE_BIEGOWE.test(fn) && !/^(bieg|maraton|polmaraton|ultra|trail|puchar|memorial|mistrzostwa|cross)$/.test(f);
    if (imie || nazwiskoPoImieniu || paraWielkich) {
      if (poprzednieOsoba) { if (out.length && /^\s+$/.test(out[out.length - 1])) out.pop(); continue; }   // „[OSOBA] Kowalski” → jedno [OSOBA], bez podwójnej spacji
      out.push(s.replace(czyste, "[OSOBA]"));
      poprzednieOsoba = true;
      continue;
    }
    poprzednieOsoba = false;
    out.push(s);
  }
  return out.join("").replace(/\[OSOBA\](\s+\[OSOBA\])+/g, "[OSOBA]").trim();
}

/** strażnik: true, gdy tekst wygląda na czysty (bez e-maila, telefonu, imienia ze słownika poza publicznymi i „o nas”) */
export function czysty(tekst) {
  const t = String(tekst || "");
  if (new RegExp(EMAIL.source).test(t) || /\d{9,}/.test(t.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, " ").replace(/[\s-]/g, ""))) return false;   // najpierw daty, potem odstępy
  return !t.split(/\s+/).some((s) => { const c = oczysc(s), f = fold(c); return czyImie(c) && !PYTAJNE_BIEGOWE.test(f) && !PUBLICZNI.includes(f) && !O_NAS.test(f); });
}
