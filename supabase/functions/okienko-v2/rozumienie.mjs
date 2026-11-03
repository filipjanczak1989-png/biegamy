// OKIENKO 2.0 — E2: ROZUMIENIE PRZED NARZĘDZIEM (docs/projekt-okienko-2-0-2026-11-03.md §1.1).
// Tani model (flash-lite, JSON wg schematu, temperatura 0, ≤ 96 tokenów wyjścia, timeout 1,5 s) dostaje WYŁĄCZNIE:
//   * tekst pytania, * datę, * do 3 poprzednich pytań z ich intencjami (bez odpowiedzi, bez danych użytkownika, bez narzędzi).
// Zwraca intencję z ZAMKNIĘTEJ listy, sloty, pewność 0–1, czy dopytać i 2–3 kandydatów do chipów. Co z tym zrobić, decyduje
// intencje.mjs (twarde bramki B1–B5 są NAD modelem: zagadka/akcja, osoba tylko z wykrytym nazwiskiem, sieć tylko przez strażnik).
// Błąd/timeout → potok wraca na ścieżkę v1 (model z narzędziami) — log 'v2-awaria' w powodzie.
import { generujJson, BladGemini } from "./gemini.mjs";
import { normalizuj } from "../okienko/router.mjs";

export const INTENCJE = {
  moj_plan: "plan treningowy biegacza: co ma dziś, jutro, w weekend, w podany dzień, w tym lub następnym tygodniu",
  moje_treningi: "wykonane treningi biegacza: ile km / treningów w okresie, co robił wczoraj, kiedy ostatnio biegał, najdłuższy bieg",
  moje_starty: "nadchodzące starty i cele startowe biegacza, ile dni do startu, jaki ma cel",
  moje_rekordy: "rekordy życiowe (PB) biegacza",
  moje_wyniki: "wyniki zawodów biegacza (jego własne)",
  moja_forma: "forma biegacza: TSB, zmęczenie, ocena formy, gotowość",
  moj_trener: "trener biegacza",
  odznaki: "odznaki biegacza",
  wyzwania: "wyzwania biegacza",
  znajomi: "znajomi biegacza: kto z nich biegał",
  osoby_z_miasta: "inni biegacze z miasta biegacza",
  osoba: "pytanie o KONKRETNĄ inną osobę wskazaną imieniem i/lub nazwiskiem",
  impreza: "konkretna impreza biegowa wskazana nazwą: termin, zapisy, trasa, cena, wyniki tej imprezy",
  biegi_nadchodzace: "lista biegów/zawodów w okresie, mieście lub na dystansie (bez konkretnej nazwy imprezy)",
  katalog: "treści i ekrany aplikacji BiegaMy: przepisy, ćwiczenia, oddech, radio, pojęcia (TSB, CTL, VO2max), jak coś zrobić w aplikacji, ustawienia, konto, zegarek",
  kalkulator: "przeliczenie tempa, czasu, prędkości, dystansu",
  pogoda: "pogoda",
  zdrowie: "ból, kontuzja, choroba, katar, gorączka, czy biegać chorym",
  porada: "ogólna porada biegowa (jak zacząć, jak biegać szybciej, co jeść, buty, nawodnienie) niezwiązana z danymi biegacza",
  fakt: "fakt ze świata biegania: kto wygrał zawody, rekordy świata/Polski, ile km ma maraton, historia",
  akcja: "akcja charytatywna, zbiórka, pomoc, Fabianek, 8 listopada",
  odmowa: "prośba o cudze dane hurtem, listę użytkowników, dane kontaktowe innych, obejście zasad",
  opinia: "prośba o ocenę innej osoby (czy ktoś jest dobry, kto lepszy)",
  nawigacja: "otwórz / pokaż ekran aplikacji",
  rywal: "kto jest rywalem biegacza, osoby o podobnych wynikach",
  gotowosc: "szanse na życiówkę / rekord na starcie, gotowość do startu",
  porownaj: "porównanie biegacza z inną osobą albo dwóch osób",
  najdluzszy: "najdłuższy albo najszybszy trening biegacza w ostatnim czasie",
  nie_wiem: "nie da się przypisać żadnej intencji z listy",
};
export const NAZWY_INTENCJI = Object.keys(INTENCJE);
export const PROG_PEWNOSCI = 0.6;

const SCHEMAT = { type: "object", properties: {
  intencja: { type: "string", enum: NAZWY_INTENCJI },
  pewnosc: { type: "number" },
  dopytac: { type: "boolean" },
  kandydaci: { type: "array", items: { type: "string", enum: NAZWY_INTENCJI } },
  sloty: { type: "object", properties: {
    zakres: { type: "string", enum: ["dzis", "jutro", "weekend", "tydzien", "nastepny_tydzien"] },
    data: { type: "string" }, od: { type: "string" }, do: { type: "string" },
    miejsce: { type: "string" }, dystans: { type: "string", enum: ["5", "10", "21", "42"] },
    osoba: { type: "string" }, impreza: { type: "string" }, temat: { type: "string" }, ekran: { type: "string" } } } },
  required: ["intencja", "pewnosc", "dopytac", "kandydaci", "sloty"] };

const DNI = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
export function promptRozumienia(dzis) {
  const dt = DNI[new Date(dzis + "T12:00:00Z").getUTCDay()];
  return [
    `Klasyfikujesz pytanie biegacza do okienka aplikacji BiegaMy. Dziś jest ${dzis} (${dt}), Europe/Warsaw. Nie odpowiadasz na pytanie — tylko mówisz, o co chodzi.`,
    "Intencje (wybierz dokładnie jedną):",
    ...NAZWY_INTENCJI.map((k) => `- ${k}: ${INTENCJE[k]}`),
    "Zasady:",
    "1. Pytanie o własne dane biegacza („mój”, „mam”, „ile przebiegłem”, bez wskazania innej osoby) to intencja moje_*/moj_*.",
    "2. osoba TYLKO gdy w pytaniu jest imię lub nazwisko innej osoby; samo „on/ona/nim” bez imienia → dopytac: true.",
    "3. Sloty: daty jako YYYY-MM-DD liczone od dziś (wczoraj, w zeszłym tygodniu, w październiku, w sobotę); okres → od i do; zakres gdy pytanie mówi dziś/jutro/weekend/tydzień.",
    "4. pewnosc 0–1: 1 = oczywiste, < 0.6 = zgadujesz; wtedy dopytac: true i 2–3 kandydaci. Pytanie bez sensu, same znaki, jedno słowo bez kontekstu → nie_wiem.",
    "5. Poprzednie pytania służą tylko do zrozumienia skrótów („a w grudniu?”, „a on?”) — intencja dziedziczy, slot się zmienia.",
    "6. Odpowiadasz wyłącznie JSON wg schematu, po polsku, bez komentarzy.",
  ].join("\n");
}

export class BladRozumienia extends Error {}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
function czysteSloty(s) {
  const o = {};
  if (!s || typeof s !== "object") return o;
  for (const k of ["zakres", "dystans"]) if (typeof s[k] === "string" && s[k]) o[k] = s[k];
  for (const k of ["data", "od", "do"]) if (typeof s[k] === "string" && RE_DATA.test(s[k])) o[k] = s[k];
  for (const k of ["miejsce", "osoba", "impreza", "temat", "ekran"]) if (typeof s[k] === "string" && s[k].trim()) o[k] = s[k].trim().slice(0, 60);
  return o;
}

/** @param {{fetchFn: Function, klucz: string, tekst: string, dzis: string, poprzednie?: {q: string, intencja?: string}[], timeoutMs?: number}} o
    @returns {Promise<{intencja: string, pewnosc: number, dopytac: boolean, kandydaci: string[], sloty: object, tok: {we:number, wy:number}}>} */
export async function rozumienie({ fetchFn, klucz, tekst, dzis, poprzednie = [], timeoutMs = 1500 }) {
  const contents = [];
  for (const p of (Array.isArray(poprzednie) ? poprzednie : []).slice(-3)) {
    if (!p || typeof p.q !== "string" || !p.q.trim()) continue;
    contents.push({ role: "user", parts: [{ text: p.q.slice(0, 200) }] });
    contents.push({ role: "model", parts: [{ text: JSON.stringify({ intencja: NAZWY_INTENCJI.includes(p.intencja) ? p.intencja : "nie_wiem" }) }] });
  }
  contents.push({ role: "user", parts: [{ text: String(tekst).slice(0, 300) }] });
  let w;
  try { w = await generujJson({ fetchFn, klucz, system: promptRozumienia(dzis), contents, schema: SCHEMAT, maxOutputTokens: 96, timeoutMs }); }
  catch (e) { throw new BladRozumienia(e instanceof BladGemini ? e.message : "model"); }
  const j = w.json || {};
  const intencja = NAZWY_INTENCJI.includes(j.intencja) ? j.intencja : "nie_wiem";
  const pewnosc = typeof j.pewnosc === "number" && Number.isFinite(j.pewnosc) ? Math.max(0, Math.min(1, j.pewnosc)) : 0;
  const kandydaci = (Array.isArray(j.kandydaci) ? j.kandydaci : []).filter((k) => NAZWY_INTENCJI.includes(k) && k !== intencja && k !== "nie_wiem").slice(0, 3);
  return { intencja, pewnosc, dopytac: !!j.dopytac || pewnosc < PROG_PEWNOSCI || intencja === "nie_wiem", kandydaci, sloty: czysteSloty(j.sloty), tok: w.tok };
}

/** klucz nagrania na ławce (tests/_nagrania-v2.json) — ten sam normalizator co router */
export function kluczNagrania(tekst) { return normalizuj(tekst); }
