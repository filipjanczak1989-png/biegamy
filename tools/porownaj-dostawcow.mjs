// PORÓWNANIE DOSTAWCÓW OKIENKA (Filip 3.11, pkt 4): Gemini (produkcja) kontra Claude Haiku 5.5 na całej ławce: klasyfikator i odpowiedzi; trafność, czas p50/p90,
// koszt na 1000 pytań. Tabela do docs/okienko-dostawcy-<data>.md. Produkcja bez zmian: dostawcę podmieniamy tu, przez wstrzyknięcie do potoku.
//
//   deno run -A tools/porownaj-dostawcow.mjs --klasyfikator [--rownolegle 6] [--czasy 100]
//   deno run -A tools/porownaj-dostawcow.mjs --odpowiedzi   [--rownolegle 4] [--czasy 30] [--max 300]
//   deno run -A tools/porownaj-dostawcow.mjs --raport       → tabela z zapisanych wyników (0 $)
//
// JAK LICZYMY: trafność klasyfikatora = prawdziwy potok v2 z danym klasyfikatorem (ślad = oczekiwany, ta sama funkcja co ławka) + zgodność intencji w wierszach od generatora.
// Odpowiedzi = ta sama ścieżka wiedzy (szukajWiedzy: prompt, strażnik cyfr i ogólników), inny tylko model z wyszukiwarką; ocenia sędzia (Opus 5.5), nie wie, kto napisał.
// Czas = osobna próbka wykonywana po kolei, bez ponowień (równoległość i limity zapytań nie fałszują p50/p90). Mierzone z łącza Filipa, nie z EF.
// Do API idą pytania z ławki (syntetyczne albo zanonimizowane, przegląd Filipa 3.11); odpowiedzi z sieci przed sędzią przez anonimizuj. Wyniki pośrednie poza repo.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { zapytaj, zapytajZWyszukiwaniem, tekstZCytowaniami, schematClaude, podsumowanie, MODELE, StopBudzetu } from "./_claude.mjs";
import { ocenOdpowiedz } from "./_sedzia.mjs";
import { anonimizuj } from "./_anonimizuj.mjs";
import { rozumienie, promptRozumienia, SCHEMAT, wynikRozumienia, NAZWY_INTENCJI } from "../supabase/functions/okienko-v2/rozumienie.mjs";
import { szukajWiedzy, INTENCJE_SIECI } from "../supabase/functions/okienko-v2/wiedza.mjs";
import { zapytajSiec, NIE_ZNALAZLEM, CENA_ZAPYTANIA_USD } from "../supabase/functions/okienko/siec.mjs";
import { CENA_USD_ZA_1M } from "../supabase/functions/okienko/model.mjs";

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const jest = (n) => process.argv.includes(n);
const KORZEN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DZIS = new Date().toISOString().slice(0, 10);
const WYJ = path.join(os.homedir(), "Downloads", "biegamy-podglady");
const plikWyniku = (co) => path.join(WYJ, `dostawcy-${DZIS}-${co}.json`);
export const NARZEDZIE = "porownanie";

export const nowyLicznik = () => ({ wywolan: 0, awarie: 0, typy: {}, usd: 0, ms: [], we: 0, wy: 0, zapytania: 0 });
export function percentyl(xs, q) { const a = (xs || []).slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; }
export const kosztGemini = (tok, zapytania = 0) => (tok.we * CENA_USD_ZA_1M.we + tok.wy * CENA_USD_ZA_1M.wy) / 1e6 + zapytania * CENA_ZAPYTANIA_USD;
const zlicz = (l, ms, usd, tok, zapytania = 0) => { l.wywolan++; l.ms.push(ms); l.usd += usd; l.we += tok.we || 0; l.wy += tok.wy || 0; l.zapytania += zapytania; };
const awaria = (l, ms, e) => { l.wywolan++; l.awarie++; l.ms.push(ms); const t = String((e && e.message) || "błąd").replace(/[A-Za-z0-9_-]{30,}/g, "…").slice(0, 80); l.typy[t] = (l.typy[t] || 0) + 1; };

/* ── klasyfikatory: ta sama sygnatura co rozumienie(), ten sam prompt i schemat, ta sama normalizacja wyniku ── */
export function rozumienieGemini({ klucz, licznik, timeoutMs = 15000, fetchFn = fetch }) {
  return async ({ tekst, dzis, poprzednie = [] }) => {
    const t0 = Date.now();
    try {
      const r = await rozumienie({ fetchFn, klucz, tekst, dzis, poprzednie, timeoutMs });
      zlicz(licznik, Date.now() - t0, kosztGemini(r.tok), r.tok);
      return r;
    } catch (e) { awaria(licznik, Date.now() - t0, e); throw e; }
  };
}
export function rozumienieHaiku({ licznik, klient, plik, opcjeZadania = { maxRetries: 8, timeout: 30000 } }) {
  const schema = schematClaude(SCHEMAT);
  return async ({ tekst, dzis, poprzednie = [] }) => {
    const t0 = Date.now(), messages = [];
    for (const p of (Array.isArray(poprzednie) ? poprzednie : []).slice(-3)) {
      if (!p || typeof p.q !== "string" || !p.q.trim()) continue;
      messages.push({ role: "user", content: p.q.slice(0, 200) }, { role: "assistant", content: JSON.stringify({ intencja: NAZWY_INTENCJI.includes(p.intencja) ? p.intencja : "nie_wiem" }) });
    }
    messages.push({ role: "user", content: String(tekst).slice(0, 300) });
    try {
      const r = await zapytaj({ narzedzie: NARZEDZIE, model: MODELE.haiku, system: promptRozumienia(dzis), messages, schema, maxTokens: 400, effort: "low", bezMyslenia: true, klient, plik, opcjeZadania });
      const tok = { we: r.usage?.input_tokens || 0, wy: r.usage?.output_tokens || 0 };
      zlicz(licznik, r.ms, r.usd, tok);
      return wynikRozumienia(r.json, tok);
    } catch (e) { if (e instanceof StopBudzetu) throw e; awaria(licznik, Date.now() - t0, e); throw e; }
  };
}

/* ── odpowiedzi: Claude z wyszukiwarką w kształcie zapytajSiec, żeby przeszedł TEN SAM strażnik (zOdpowiedziSieci) co Gemini ── */
export function naGrounding(content) {
  const { tekst, zrodla, zakresy } = tekstZCytowaniami(content);
  return { tekst, gm: { groundingChunks: zrodla.map((z) => ({ web: { uri: z.url, title: z.tytul } })), groundingSupports: zakresy.map((z) => ({ segment: { startIndex: z.od, endIndex: z.do, text: z.tekst } })) } };
}
export function siecHaiku({ licznik, klient, plik, opcjeZadania = { maxRetries: 8, timeout: 60000 } }) {
  return async ({ tekst, dzis, prompt = null, maxOutputTokens = 500 }) => {
    const system = String(prompt || `Odpowiadasz biegaczowi z Polski na podstawie wyszukiwania w sieci. Dziś jest ${dzis}.`).replace(/Google Search/g, "wyszukiwarki internetowej");
    const r = await zapytajZWyszukiwaniem({ narzedzie: NARZEDZIE, model: MODELE.haiku, system, messages: [{ role: "user", content: String(tekst).slice(0, 300) }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }], maxTokens: Math.max(1024, maxOutputTokens), effort: "low", klient, plik, opcjeZadania });
    zlicz(licznik, r.ms, r.usd, r.tok, r.zapytania);
    return { ...naGrounding(r.content), tok: r.tok, zapytania: r.zapytania, proby: 1 };
  };
}
export function siecGemini({ klucz, licznik, fetchFn = fetch }) {
  return async (o) => {
    const t0 = Date.now();
    const r = await zapytajSiec({ ...o, fetchFn, klucz, timeoutMs: 30000 });
    zlicz(licznik, Date.now() - t0, kosztGemini(r.tok, r.zapytania), r.tok, r.zapytania);
    return r;
  };
}

/** wiersze ławki, na które odpowiada model z siecią: intencja wiedzy albo oczekiwana sieć; bez dopytań (kontekst rozmowy to inna ścieżka) */
export function wierszeOdpowiedzi(pytania) {
  return pytania.filter((w) => !w.po && (INTENCJE_SIECI.includes(w.intencja) || w.oczekiwane === "siec")).map((w) => ({ p: w.p, intencja: INTENCJE_SIECI.includes(w.intencja) ? w.intencja : "fakt", waga: w.waga }));
}
/** równomiernie rozłożona próbka (czasy) */
export function rozlozona(lista, n) { if (lista.length <= n) return lista.slice(); return Array.from({ length: n }, (_, i) => lista[Math.floor((i * lista.length) / n)]); }

async function pula(lista, ile, fn) {
  const w = new Array(lista.length); let i = 0, stop = null;
  await Promise.all(Array.from({ length: Math.max(1, ile) }, async () => { while (i < lista.length && !stop) { const k = i++; try { w[k] = await fn(lista[k], k); } catch (e) { if (e instanceof StopBudzetu) stop = e; else throw e; } } }));
  if (stop) console.error("STOP budżetu:", stop.message);
  return w;
}

function zapiszWynik(co, w) { fs.mkdirSync(WYJ, { recursive: true }); fs.writeFileSync(plikWyniku(co), JSON.stringify(w, null, 1)); }

async function klasyfikator({ rown, nCzasy, klucz }) {
  const { przebieg, PYTANIA } = require("../tests/_lawka-v2.js");
  const { DZIS: DZIS_LAWKI } = require("../tests/_lawka-pytan.js");
  const wynik = { dzis: DZIS, n: PYTANIA.length, dostawcy: {} };
  for (const [nazwa, fabryka, fabrykaCzasu] of [
    ["gemini", (l) => rozumienieGemini({ klucz, licznik: l }), (l) => rozumienieGemini({ klucz, licznik: l })],
    ["haiku", (l) => rozumienieHaiku({ licznik: l }), (l) => rozumienieHaiku({ licznik: l, opcjeZadania: { maxRetries: 0, timeout: 15000 } })],
  ]) {
    const l = nowyLicznik(), czas = nowyLicznik();
    console.log(`${nazwa}: cała ławka (${PYTANIA.length} pytań, równolegle ${rown})…`);
    const w = await przebieg(PYTANIA, { rozumienieFn: fabryka(l), rownolegle: rown });
    const zIntencja = w.filter((r) => r.intencja && r.rozIntencja);
    console.log(`${nazwa}: próbka czasu (${nCzasy}, po kolei)…`);
    for (const r of rozlozona(PYTANIA.filter((x) => !x.po), nCzasy)) { try { await fabrykaCzasu(czas)({ tekst: r.p, dzis: DZIS_LAWKI, poprzednie: [] }); } catch { /* policzone w licznik.awarie */ } }
    wynik.dostawcy[nazwa] = { dobre: w.filter((r) => r.pasuje).length, n: w.length, regresje: w.filter((r) => !r.pasuje && !r.luka).length, intencjaDobra: zIntencja.filter((r) => r.rozIntencja === r.intencja).length, intencjaN: zIntencja.length,
      wywolan: l.wywolan, awarie: l.awarie, typy: l.typy, usd: l.usd, p50: percentyl(czas.ms, 0.5), p90: percentyl(czas.ms, 0.9), ponad3s: czas.ms.filter((x) => x > 3000).length, nCzas: czas.ms.length, awarieCzasu: czas.awarie,
      usdCzas: czas.usd, wiersze: w.map((r) => ({ p: r.p, pasuje: r.pasuje, slad: r.slad, intencja: r.intencja || null, roz: r.rozIntencja })) };
    console.log(`${nazwa}: ${wynik.dostawcy[nazwa].dobre}/${w.length}, awarie ${l.awarie}, ${l.usd.toFixed(4)} USD, p50 ${wynik.dostawcy[nazwa].p50} ms, p90 ${wynik.dostawcy[nazwa].p90} ms`);
    zapiszWynik("klasyfikator", wynik);
  }
  return wynik;
}

async function odpowiedzi({ rown, nCzasy, max, klucz }) {
  const { PYTANIA } = require("../tests/_lawka-v2.js");
  const { DZIS: DZIS_LAWKI } = require("../tests/_lawka-pytan.js");
  const rzedy = rozlozona(wierszeOdpowiedzi(PYTANIA), max), wynik = { dzis: DZIS, n: rzedy.length, dostawcy: {} };
  const czasowe = new Set(rozlozona(rzedy, nCzasy));
  for (const [nazwa, fabryka, fabrykaCzasu] of [
    ["gemini", (l) => siecGemini({ klucz, licznik: l }), (l) => siecGemini({ klucz, licznik: l })],
    ["haiku", (l) => siecHaiku({ licznik: l }), (l) => siecHaiku({ licznik: l, opcjeZadania: { maxRetries: 0, timeout: 30000 } })],
  ]) {
    const l = nowyLicznik(), czas = nowyLicznik(), usdSedziego = { x: 0 };
    const jeden = async (r, siec) => {
      let o;
      try { o = await szukajWiedzy({ d: { zapytajSiec: siec }, fetchFn: fetch, klucz, tekst: r.p, dzis: DZIS_LAWKI, intencja: r.intencja }); }
      catch (e) { if (e instanceof StopBudzetu) throw e; awaria(l, 0, e); return { p: r.p, awaria: true }; }
      const pusta = !o.zdania.length || o.zdania[0] === NIE_ZNALAZLEM;
      let ocena = { odpowiada: 0, konkret: 0, liczby_z_pokryciem: 1, wyciek: 0, ton: 1, uzasadnienie: "brak odpowiedzi" };
      if (!pusta) {
        const s = await ocenOdpowiedz({ dostawca: "claude", narzedzie: NARZEDZIE, opcjeZadania: { maxRetries: 8 }, w: { pytanie: r.p, sciezka: `siec (wiedza) · ${r.intencja}`, odpowiedz: anonimizuj(o.zdania.join(" ")) } });
        usdSedziego.x += s.usd; ocena = s.ocena;
      }
      return { p: r.p, intencja: r.intencja, pusta, zrodel: o.zrodla.length, ogolnik: o.ogolnik, odrzuconych: o.odrzucone.length, zdania: o.zdania.map((z) => anonimizuj(z).slice(0, 300)), ocena };
    };
    console.log(`${nazwa}: próbka czasu (${czasowe.size} po kolei)…`);
    const pierwsze = []; for (const r of rzedy.filter((x) => czasowe.has(x))) pierwsze.push(await jeden(r, fabrykaCzasu(czas)));
    console.log(`${nazwa}: reszta (${rzedy.length - czasowe.size}, równolegle ${rown})…`);
    const reszta = await pula(rzedy.filter((x) => !czasowe.has(x)), rown, (r) => jeden(r, fabryka(l)));
    const wiersze = [...pierwsze, ...reszta].filter(Boolean), ok = wiersze.filter((x) => !x.awaria), sr = (k) => ok.length ? ok.reduce((s, x) => s + (Number(x.ocena[k]) || 0), 0) / ok.length : 0;
    const usd = l.usd + czas.usd;
    wynik.dostawcy[nazwa] = { n: wiersze.length, awarie: l.awarie + czas.awarie, puste: ok.filter((x) => x.pusta).length, ogolniki: ok.filter((x) => x.ogolnik).length, odpowiada: sr("odpowiada"), konkret: sr("konkret"), liczby: sr("liczby_z_pokryciem"), ton: sr("ton"), wyciek: sr("wyciek"),
      wywolan: l.wywolan + czas.wywolan, usd, zapytania: l.zapytania + czas.zapytania, usdSedziego: usdSedziego.x, p50: percentyl(czas.ms, 0.5), p90: percentyl(czas.ms, 0.9), nCzas: czas.ms.length, typy: { ...l.typy, ...czas.typy }, wiersze };
    console.log(`${nazwa}: odpowiada ${(100 * sr("odpowiada")).toFixed(1)} %, konkret ${(100 * sr("konkret")).toFixed(1)} %, ${usd.toFixed(3)} USD + sędzia ${usdSedziego.x.toFixed(3)} USD, p50 ${wynik.dostawcy[nazwa].p50} ms`);
    zapiszWynik("odpowiedzi", wynik);
  }
  return wynik;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + " %" : "—");
const usdF = (x) => (x == null ? "—" : x.toFixed(x < 1 ? 3 : 2) + " USD");
/** tabela do docs/ (same liczby; bez treści odpowiedzi) */
export function tabelaMd(kl, od) {
  const linie = [`# Okienko: Gemini kontra Claude Haiku (${DZIS})`, ""];
  const G = "Gemini 3.5 flash-lite", H = "Claude Haiku 5.5";
  if (kl) {
    const g = kl.dostawcy.gemini || {}, h = kl.dostawcy.haiku || {};
    const nA = kl.n, w = (x) => [
      ["Ławka: ślad potoku = oczekiwany", `${pct(x.dobre, x.n)} (${x.dobre}/${x.n})`], ["Regresje (poza znanymi lukami)", String(x.regresje)], ["Zgodność intencji (wiersze od generatora)", `${pct(x.intencjaDobra, x.intencjaN)} (${x.intencjaDobra}/${x.intencjaN})`],
      ["Awarie klasyfikatora", `${x.awarie} z ${x.wywolan}`], ["Czas p50 / p90 (próbka po kolei)", `${x.p50} / ${x.p90} ms (n=${x.nCzas})`], ["Ponad 3 s (limit produkcyjny)", `${x.ponad3s} z ${x.nCzas}`],
      ["Koszt na 1000 wywołań klasyfikatora", usdF(x.wywolan ? (1000 * x.usd) / x.wywolan : null)], ["Koszt na 1000 pytań ławki (router = 0 tok.)", usdF(nA ? (1000 * x.usd) / nA : null)]];
    const wg = w(g), wh = w(h);
    linie.push("## Klasyfikator", "", `Cała ławka: ${kl.n} pytań, ten sam prompt, schemat i normalizacja. Haiku bez myślenia, effort low.`, "", `| miara | ${G} | ${H} |`, "|---|---|---|", ...wg.map((r, i) => `| ${r[0]} | ${r[1]} | ${wh[i][1]} |`), "");
  }
  if (od) {
    const g = od.dostawcy.gemini || {}, h = od.dostawcy.haiku || {};
    const w = (x) => [
      ["Sędzia: odpowiada na pytanie", pct(x.odpowiada, 1)], ["Sędzia: konkret", pct(x.konkret, 1)], ["Sędzia: liczby z pokryciem", pct(x.liczby, 1)], ["Sędzia: ton", pct(x.ton, 1)], ["Sędzia: wyciek", pct(x.wyciek, 1)],
      ["Bez odpowiedzi (strażnik albo brak źródeł)", `${x.puste} z ${x.n}`], ["Ogólniki po ponowieniu", `${x.ogolniki} z ${x.n}`], ["Awarie", String(x.awarie)], ["Czas p50 / p90 jednego wyszukania (próbka po kolei)", `${x.p50} / ${x.p90} ms (n=${x.nCzas})`],
      ["Koszt na 1000 odpowiedzi (z wyszukiwaniem)", usdF(x.n ? (1000 * x.usd) / x.n : null)], ["Zapytań wyszukiwarki na odpowiedź", x.n ? (x.zapytania / x.n).toFixed(2) : "—"]];
    const wg = w(g), wh = w(h);
    linie.push("## Odpowiedzi", "", `${od.n} pytań, na które odpowiada model z siecią (porada, żywienie, sprzęt, fakt). Ta sama ścieżka wiedzy i ci sami strażnicy; ocenia sędzia ${MODELE.opus}, nie wie, kto pisał.`, "", `| miara | ${G} | ${H} |`, "|---|---|---|", ...wg.map((r, i) => `| ${r[0]} | ${r[1]} | ${wh[i][1]} |`), "");
  }
  linie.push("## Zastrzeżenia", "", "- Czas mierzony z łącza w Polsce, nie z Edge Function: różnica między dostawcami może być inna na produkcji.",
    "- Koszt Gemini to przelicznik z cennika (tools, model.mjs), koszt Claude z `usage` odpowiedzi; bez cache promptu.",
    "- Ocena sędziego to model oceniający model: porównuj dostawców między sobą, nie traktuj procentów jako prawdy absolutnej.", "");
  return linie.join("\n");
}

if (import.meta.main) {
  const klucz = process.env.GEMINI_API_KEY || "", rown = Number(arg("--rownolegle", jest("--odpowiedzi") ? "4" : "6"));
  if ((jest("--klasyfikator") || jest("--odpowiedzi")) && !klucz) { console.error("wymaga GEMINI_API_KEY w env"); process.exit(2); }
  if (jest("--klasyfikator")) await klasyfikator({ rown, nCzasy: Number(arg("--czasy", "100")), klucz });
  if (jest("--odpowiedzi")) await odpowiedzi({ rown, nCzasy: Number(arg("--czasy", "30")), max: Number(arg("--max", "300")), klucz });
  const czytaj = (co) => { try { return JSON.parse(fs.readFileSync(plikWyniku(co), "utf8")); } catch { return null; } };
  const kl = czytaj("klasyfikator"), od = czytaj("odpowiedzi");
  if (kl || od) {
    const pm = path.join(KORZEN, "docs", `okienko-dostawcy-${DZIS}.md`);
    fs.writeFileSync(pm, tabelaMd(kl, od));
    console.log("tabela:", pm);
  } else console.log("użycie: --klasyfikator | --odpowiedzi | --raport");
  const s = podsumowanie();
  console.log(`koszt Claude tego punktu: ${(s.narzedzia[NARZEDZIE] || { usd: 0 }).usd.toFixed(2)} USD (łącznie ${s.razem.toFixed(2)} / ${s.stop} USD)`);
}
