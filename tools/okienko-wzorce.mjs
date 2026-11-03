// WZORCE PORAD (Filip 3.11, pkt 3): 200 najczęstszych porad → odpowiedź wzorcowa od Claude do docs/okienko-wzorce.md. Filip zatwierdza; sędzia porównuje tylko z zatwierdzonymi (tools/_sedzia.mjs).
//
//   deno run -A tools/okienko-wzorce.mjs --generuj 200 [--limit-usd 30] [--rownolegle 3] [--bez-sieci]   przerwany przebieg wznawia się z pliku (bez ponownej zapłaty)
//   deno run -A tools/okienko-wzorce.mjs --zatwierdz [--bez w007,w123]                                   DO-OK → OK (wymienione → ODRZUCONY)
//
// LISTA PYTAŃ: ławka (intencje porada, żywienie, sprzęt; bez dopytań) wg `waga`, powtórki odsiane; czego brakuje do N, dopisuje Claude. ⚠️ „Najczęstsze” to szacunek wagi z ławki, nie zmierzona częstość z logów.
// Do API idą wyłącznie te syntetyczne pytania. Zdrowie (ból, kontuzja) nie wchodzi: ma stałe teksty z routera. Koszt liczy dziennik (tools/_claude.mjs); --limit-usd zatrzymuje ten punkt wcześniej niż stop 90 USD.
import { createRequire } from "node:module";
import fs from "node:fs";
import { zapytaj, zapytajZWyszukiwaniem, tekstZCytowaniami, podsumowanie, MODELE, StopBudzetu, OdmowaModelu } from "./_claude.mjs";
import { PLIK_WZORCOW, wczytajWzorce, podobienstwo } from "./_sedzia.mjs";
import { przeciekAkcji } from "../supabase/functions/okienko/router.mjs";

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const jest = (n) => process.argv.includes(n);
export const NARZEDZIE = "okienko-wzorce";
export const INTENCJE_PORAD = ["porada", "zywienie", "sprzet"];
const PROG_POWTORKI = 0.6;

export const SYSTEM_WZORCA = [
  "Piszesz ODPOWIEDŹ WZORCOWĄ dla asystenta biegowego w polskiej aplikacji BiegaMy. Trener zatwierdzi ją, a sędzia będzie z nią porównywał odpowiedzi asystenta.",
  "Odbiorca: biegacz amator z Polski. Po polsku, 3–5 krótkich zdań, bez emoji, wykrzykników, list, nagłówków i wstępu; zacznij od sedna.",
  "Konkret: liczby, zakresy, kroki w kolejności; przy sprzęcie cechy i orientacyjne ceny w złotych, nie reklama jednej marki. Każdą liczbę oprzyj na źródle; gdy źródła się różnią, podaj zakres.",
  "Nie pisz „słuchaj swojego ciała”, „każdy organizm jest inny”, „skonsultuj się ze specjalistą” zamiast odpowiedzi. Przy bólu, chorobie albo urazie: jedno zdanie, że to sprawa dla lekarza lub fizjoterapeuty.",
  "Pisz wyłącznie treść odpowiedzi.",
].join("\n");

/** pytania z ławki wg wagi, bez powtórek (podobieństwo słów); nigdy dopytania ani pytania spoza porad */
export function wybierzPytania(pytania, n) {
  const kand = pytania.filter((w) => INTENCJE_PORAD.includes(w.intencja) && !w.po).slice().sort((a, b) => (b.waga || 0) - (a.waga || 0));
  const out = [];
  for (const w of kand) { if (out.length >= n) break; if (!out.some((x) => podobienstwo(x.pytanie, w.p) >= PROG_POWTORKI)) out.push({ pytanie: w.p, intencja: w.intencja, waga: w.waga || 2 }); }
  return out;
}

const SCHEMAT_LISTY = { type: "object", additionalProperties: false, required: ["pytania"], properties: { pytania: { type: "array", items: { type: "object", additionalProperties: false, required: ["p", "intencja", "waga"],
  properties: { p: { type: "string" }, intencja: { type: "string", enum: INTENCJE_PORAD }, waga: { type: "integer" } } } } } };

/** gdy ławka daje mniej niż N: Claude dopisuje najczęstsze pytania biegaczy (≤ 3 próby) */
export async function uzupelnijPytania(lista, n, { klient, plik, log = console.log } = {}) {
  const out = lista.slice();
  for (let proba = 0; proba < 3 && out.length < n; proba++) {
    const ile = n - out.length + 15;
    const r = await zapytaj({ narzedzie: NARZEDZIE, model: MODELE.opus, effort: "medium", maxTokens: 16000, schema: SCHEMAT_LISTY, klient, plik, system: "Znasz pytania, które biegacze amatorzy z Polski najczęściej zadają o trening, jedzenie i sprzęt. Bez zdrowia, kontuzji i bólu. Każde pytanie krótko, jak wpis na telefonie, samodzielne. waga 1–5 = jak często pada.",
      messages: [{ role: "user", content: `Podaj ${ile} najczęstszych pytań, których NIE ma poniżej (także w innej formie):\n${out.map((x) => "- " + x.pytanie).join("\n")}` }] });
    let dodane = 0;
    for (const q of r.json.pytania || []) {
      const p = String(q.p || "").trim().slice(0, 200);
      if (out.length >= n || !p || !INTENCJE_PORAD.includes(q.intencja) || out.some((x) => podobienstwo(x.pytanie, p) >= PROG_POWTORKI)) continue;
      out.push({ pytanie: p, intencja: q.intencja, waga: Math.min(5, Math.max(1, Number(q.waga) || 2)) }); dodane++;
    }
    log(`  uzupełnienie listy: +${dodane}, ${r.usd.toFixed(3)} USD`);
  }
  return out;
}

/** jedna odpowiedź wzorcowa → { wzorzec, zrodla } albo null (pusto albo przeciek akcji: nie trafia do publicznego repo) */
export async function napiszWzorzec(q, { klient, plik, zSiecia = true, opcjeZadania = { maxRetries: 6 } } = {}) {
  const baza = { narzedzie: NARZEDZIE, model: MODELE.opus, effort: "medium", maxTokens: 4000, system: SYSTEM_WZORCA, klient, plik, opcjeZadania, messages: [{ role: "user", content: q.pytanie }] };
  const r = zSiecia ? await zapytajZWyszukiwaniem({ ...baza, tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }] }) : await zapytaj(baza);
  const { tekst, zrodla } = tekstZCytowaniami(r.content);
  const wzorzec = String(tekst || "").replace(/\s+/g, " ").trim();
  if (!wzorzec || przeciekAkcji([wzorzec])) return null;
  return { wzorzec, zrodla: zrodla.map((z) => z.url).filter((u) => /^https:\/\//.test(u)).slice(0, 3) };
}

export function doMd(wpisy) {
  const ok = wpisy.filter((w) => w.status === "OK").length;
  return ["# Okienko: odpowiedzi wzorcowe", "",
    `Wpisów: ${wpisy.length}, zatwierdzonych: ${ok}. Sędzia nocny porównuje tylko z wpisami o statusie OK (tools/_sedzia.mjs). Złe wpisy: \`--zatwierdz --bez w007,w123\`; plik wolno też poprawiać ręcznie (układ linii zostaje).`,
    "„Najczęstsze” to szacunek wagi z ławki, nie zmierzona częstość z logów. Treść od Claude na podstawie wyszukiwania; pytania syntetyczne, zero danych zawodników.", "",
    ...wpisy.flatMap((w) => [`## ${w.id} · ${w.intencja} · waga ${w.waga} · ${w.status}`, `**Pytanie:** ${String(w.pytanie).replace(/\s+/g, " ")}`, `**Wzorzec:** ${w.wzorzec}`, `**Źródła:** ${w.zrodla && w.zrodla.length ? w.zrodla.join(" · ") : "—"}`, ""])].join("\n");
}

export function zatwierdz(wpisy, bez = []) {
  const odrzucone = new Set(bez);
  return wpisy.map((w) => (w.status === "DO-OK" || odrzucone.has(w.id) ? { ...w, status: odrzucone.has(w.id) ? "ODRZUCONY" : "OK" } : w));
}

/** generuje brakujące wpisy z limitem kosztu tego narzędzia; zapis po każdym wpisie */
export async function generujWzorce(lista, { wpisy = [], klient, plik, limitUsd = 30, rownolegle = 3, zSiecia = true, kosztNarzedzia = () => (podsumowanie(plik).narzedzia[NARZEDZIE] || { usd: 0 }).usd, zapisz = () => {}, log = console.log } = {}) {
  const gotowe = new Set(wpisy.map((w) => w.pytanie)), brak = lista.filter((q) => !gotowe.has(q.pytanie)), wynik = wpisy.slice();
  let i = 0, stop = null, nastId = wynik.reduce((m, w) => Math.max(m, Number(w.id.slice(1)) || 0), 0) + 1;
  await Promise.all(Array.from({ length: Math.max(1, rownolegle) }, async () => {
    while (i < brak.length && !stop) {
      if (kosztNarzedzia() >= limitUsd) { stop = `limit ${limitUsd} USD tego punktu`; break; }
      const q = brak[i++];
      try {
        const w = await napiszWzorzec(q, { klient, plik, zSiecia });
        if (!w) { log(`  pominięte: ${q.pytanie.slice(0, 50)}`); continue; }
        wynik.push({ id: "w" + String(nastId++).padStart(3, "0"), intencja: q.intencja, waga: q.waga, status: "DO-OK", pytanie: q.pytanie, ...w });
        zapisz(wynik);
        log(`  ${wynik.length}/${lista.length}, narzędzie ${kosztNarzedzia().toFixed(2)} USD`);
      } catch (e) {
        if (e instanceof StopBudzetu) { stop = e.message; break; }
        log(`  ! ${q.pytanie.slice(0, 40)}: ${String(e.message).slice(0, 80)}${e instanceof OdmowaModelu ? " (odmowa, pomijam)" : ""}`);
      }
    }
  }));
  return { wpisy: wynik, stop };
}

if (import.meta.main) {
  const czytajPlik = () => { try { return wczytajWzorce(fs.readFileSync(PLIK_WZORCOW, "utf8")); } catch { return []; } };
  if (jest("--zatwierdz")) {
    const w = zatwierdz(czytajPlik(), String(arg("--bez", "")).split(",").map((x) => x.trim()).filter(Boolean));
    fs.writeFileSync(PLIK_WZORCOW, doMd(w));
    console.log(`zatwierdzonych: ${w.filter((x) => x.status === "OK").length}, odrzuconych: ${w.filter((x) => x.status === "ODRZUCONY").length}`);
  } else if (jest("--generuj")) {
    const n = Number(arg("--generuj", "200"));
    const { PYTANIA } = require("../tests/_lawka-v2-pytania.js");
    const lista = await uzupelnijPytania(wybierzPytania(PYTANIA, n), n);
    console.log(`pytań: ${lista.length} (z ławki i uzupełnione); Claude (${MODELE.opus}) pisze wzorce…`);
    const { wpisy, stop } = await generujWzorce(lista, { wpisy: czytajPlik(), limitUsd: Number(arg("--limit-usd", "30")), rownolegle: Number(arg("--rownolegle", "3")), zSiecia: !jest("--bez-sieci"), zapisz: (w) => fs.writeFileSync(PLIK_WZORCOW, doMd(w)) });
    if (stop) console.log("STOP:", stop);
    fs.writeFileSync(PLIK_WZORCOW, doMd(wpisy));
    const s = podsumowanie();
    console.log(`wpisów: ${wpisy.length} → ${PLIK_WZORCOW}\nkoszt punktu: ${(s.narzedzia[NARZEDZIE] || { usd: 0 }).usd.toFixed(2)} USD (łącznie ${s.razem.toFixed(2)} / ${s.stop} USD)`);
  } else console.log("użycie: --generuj 200 [--limit-usd 30] [--rownolegle 3] [--bez-sieci] | --zatwierdz [--bez w007,w123]");
}
