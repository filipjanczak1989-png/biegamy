// GENERATOR ŁAWKI v2 (Filip 3.11, kredyty Anthropic): Claude pisze ~1500 pytań do ławki Okienka (literówki, slang, skróty, bez polskich znaków,
// dopytania w rozmowie 2–4 tury, pytania poza tematem, wszystkie intencje) z OCZEKIWANĄ intencją. Do API idzie WYŁĄCZNIE opis intencji
// (supabase/functions/okienko-v2/rozumienie.mjs) i stylu — zero danych zawodników; imiona osób zmyślone albo publicznych sportowców.
//
//   deno run -A tools/lawka-generator.mjs --generuj 1500     → tests/_lawka-v2-kandydaci.json + docs/lawka-probka-<data>.md (50 do OK Filipa)
//   deno run -A tools/lawka-generator.mjs --scal [--bez k0007,k0123]
//        → po OK: kandydaci dopisani do tests/_lawka-v2-pytania.js (sekcja „wygenerowane”), `oczekiwane` z mapy intencji;
//          wiersze, których potok dziś nie przechodzi, dostają `luka: 'gen'` + „dziś: <ślad>” (CI zostaje zielone, lista do pracy)
//   node tests/_lawka-v2.js --zywy --rownolegle 8   → nagrania klasyfikatora dla nowych pytań (Gemini ~0,0005 USD/pytanie) do tests/_nagrania-v2-zywe.json
//   deno run -A tools/lawka-generator.mjs --nagrania    → dopisuje BRAKUJĄCE nagrania do tests/_nagrania-v2.json (istniejące, w tym ręczne, nietknięte)
//   deno run -A tools/lawka-generator.mjs --scal --przelicz   → tylko przeliczenie `luka` w sekcji wygenerowanej
// Kandydaci zapisują się po KAŻDEJ partii, więc błąd ani stop budżetu nie marnują wydanych pieniędzy.
// Budżet: tools/_claude.mjs (dziennik poza repo, stop przy 90 USD).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { zapytaj, podsumowanie, MODELE, StopBudzetu } from "./_claude.mjs";
import { INTENCJE } from "../supabase/functions/okienko-v2/rozumienie.mjs";

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const jest = (n) => process.argv.includes(n);
const KORZEN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DZIS = new Date().toISOString().slice(0, 10);
export const PLIK_KANDYDATOW = path.join(KORZEN, "tests", "_lawka-v2-kandydaci.json");
export const PLIK_LAWKI = path.join(KORZEN, "tests", "_lawka-v2-pytania.js");
export const ZNACZNIK_OD = "  // ── WYGENEROWANE (tools/lawka-generator.mjs, Claude; zatwierdzone przez Filipa) — nie edytować ręcznie, przelicza --scal --przelicz ──";
export const ZNACZNIK_DO = "  // ── KONIEC WYGENEROWANYCH ──";

/* intencja → oczekiwany ślad potoku (konwencja ławki: 'router:X' przechodzi też przez rozumienie v2, '…*' = prefiks, 'a|b' = każda droga poprawna).
   Sprawdzone przez prawdziwy potok (blizna-139). Dwie drogi: nie_wiem (bełkot przed klasyfikatorem albo dopytanie po nim), zywienie (baza produktów albo sieć),
   opinia i porownaj (z imieniem i nazwiskiem bramka B2 kieruje do trybu osoby, zgodnie z zasadą ławki). rywal: znana luka E5, dziś idzie do sieci. */
export const MAPA = {
  moj_plan: "router:moj_plan", moje_treningi: "router:moje_treningi", moje_starty: "router:moje_starty", moje_rekordy: "router:moje_rekordy",
  moje_wyniki: "router:moje_wyniki", moja_forma: "router:moja_forma", moj_trener: "router:moj_trener", odznaki: "router:odznaki_moje",
  wyzwania: "router:wyzwania_postep", znajomi: "router:znajomi_tydzien", osoby_z_miasta: "router:osoby_z_miasta", osoba: "osoba", impreza: "impreza",
  biegi_nadchodzace: "router:biegi_nadchodzace", katalog: "router:katalog", kalkulator: "router:kalkulator", pogoda: "klient", zdrowie: "router:zdrowie",
  porada: "siec", zywienie: "siec|v2:produkt", sprzet: "siec", o_nas: "router:o-nas", fakt: "siec", akcja: "router:zagadka", odmowa: "router:odmowa",
  opinia: "v2:opinia|osoba", nawigacja: "router:nawigacja", rywal: "v2:rywal", gotowosc: "v2:gotowosc*", porownaj: "v2:porownaj*|osoba", najdluzszy: "v2:najdluzszy*",
  nie_wiem: "v2-niepewne:*", plan_startowy: "v2:plan_startowy", oboz: "siec",
};
/* udział intencji w 1630 „typowych” pytaniach (szacunek z logów i ławki: własne dane najczęściej) — skalowany do N */
const UDZIAL = { moj_plan: 150, moje_treningi: 150, moje_starty: 80, moje_rekordy: 60, moje_wyniki: 50, moja_forma: 60, moj_trener: 30, odznaki: 30, wyzwania: 30,
  znajomi: 30, osoby_z_miasta: 20, osoba: 50, impreza: 70, biegi_nadchodzace: 80, katalog: 100, kalkulator: 50, pogoda: 30, zdrowie: 60, porada: 100, zywienie: 60,
  sprzet: 40, o_nas: 30, fakt: 40, akcja: 40, odmowa: 30, opinia: 15, nawigacja: 30, rywal: 15, gotowosc: 25, porownaj: 15, najdluzszy: 20, nie_wiem: 40, plan_startowy: 40, oboz: 20 };
const KATEGORIA = (i) => (["moj_plan", "moje_treningi", "moje_starty", "moje_rekordy", "moje_wyniki", "moja_forma", "moj_trener", "odznaki", "wyzwania", "gotowosc", "najdluzszy"].includes(i) ? "wlasne"
  : ["osoba", "osoby_z_miasta", "znajomi", "rywal", "porownaj", "opinia", "odmowa"].includes(i) ? "osoby" : ["impreza", "biegi_nadchodzace"].includes(i) ? "imprezy"
  : ["katalog", "nawigacja", "o_nas", "kalkulator"].includes(i) ? "tresci" : i === "akcja" ? "akcja" : "poza");
const STYLE = ["poprawna polszczyzna", "bez polskich znaków", "literówki", "slang i potoczny język", "skróty (km, tydz., pb, hm)", "pełne długie zdanie z kontekstem",
  "jedno–dwa słowa", "emotki lub wykrzykniki", "dopytanie w rozmowie (pole po: 1–3 wcześniejsze wiadomości)", "pytanie z błędną interpunkcją lub CAPSEM"];

export const SYSTEM_GENERATORA = [
  "Piszesz pytania testowe do ławki asystenta „Okienko” w polskiej aplikacji biegowej BiegaMy. Okienko odpowiada zalogowanemu biegaczowi.",
  "Każde pytanie ma JEDNOZNACZNIE podaną intencję (oceniamy klasyfikację). Piszesz tak, jak piszą prawdziwi biegacze na telefonie — różnie i niedbale.",
  "Imiona i nazwiska osób: wyłącznie zmyślone albo publicznych sportowców (Kipchoge, Korzeniowski, Lewandowski). Nigdy prawdziwych osób prywatnych.",
  "Pole `po` (opcjonalne) to wcześniejsze wiadomości tej samej rozmowy; wtedy `p` to ostatnia wiadomość (np. „a w grudniu?”), a intencja dotyczy `p` w tym kontekście.",
  "Pole `waga` 1–5: jak często prawdziwi użytkownicy zadają takie pytanie. Bez powtórzeń i bez parafraz tego samego zdania.",
].join("\n");
const SCHEMAT = { type: "object", additionalProperties: false, required: ["pytania"], properties: { pytania: { type: "array", items: { type: "object", additionalProperties: false,
  required: ["p", "po", "intencja", "styl", "waga"], properties: { p: { type: "string" }, po: { type: "array", items: { type: "string" } }, intencja: { type: "string", enum: Object.keys(MAPA) },
    styl: { type: "string" }, waga: { type: "integer" } } } } } };

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** ile pytań na intencję przy N (suma = N) */
export function rozdzial(n) {
  const suma = Object.values(UDZIAL).reduce((a, b) => a + b, 0), r = {};
  let razem = 0;
  for (const [k, v] of Object.entries(UDZIAL)) { r[k] = Math.max(1, Math.round((v * n) / suma)); razem += r[k]; }
  const naj = Object.keys(r).sort((a, b) => UDZIAL[b] - UDZIAL[a])[0]; r[naj] += n - razem;
  return r;
}

export async function generuj(n, { model = MODELE.opus, klient, log = console.log, istniejace = [], poPartii = () => {} } = {}) {
  const znane = new Set(istniejace.map(norm)), wynik = [];
  for (const [intencja, ile] of Object.entries(rozdzial(n))) {
    let zostalo = ile, partia = 0;
    while (zostalo > 0) {
      const k = Math.min(50, zostalo); partia++;
      const tresc = [`Intencja: ${intencja} — ${INTENCJE[intencja]}.`, `Wygeneruj ${k} pytań z tą intencją.`,
        `Style (rozłóż równo): ${STYLE.join("; ")}.`, "Pozostałe intencje Okienka (żeby nie pisać pytań, które bardziej pasują gdzie indziej):",
        Object.entries(INTENCJE).filter(([x]) => x !== intencja).map(([x, o]) => `- ${x}: ${o}`).join("\n")].join("\n");
      let r;
      try { r = await zapytaj({ narzedzie: "lawka-generator", model, system: SYSTEM_GENERATORA, messages: [{ role: "user", content: tresc }], schema: SCHEMAT, maxTokens: 16000, effort: "medium", klient }); }
      catch (e) { log(`  ! ${intencja}/${partia}: ${e.message}`); if (e instanceof StopBudzetu) return wynik; zostalo -= k; continue; }
      let dodane = 0;
      for (const q of r.json.pytania || []) {
        const p = String(q.p || "").trim().slice(0, 300), po = (Array.isArray(q.po) ? q.po : []).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 3);
        const klucz = norm(po.join(" | ") + " || " + p);
        if (!p || q.intencja !== intencja || znane.has(klucz) || znane.has(norm(p)) && !po.length) continue;
        znane.add(klucz); dodane++;
        wynik.push({ id: "k" + String(wynik.length + 1).padStart(4, "0"), p, ...(po.length ? { po } : {}), intencja, kat: KATEGORIA(intencja), waga: Math.min(5, Math.max(1, Number(q.waga) || 2)), styl: String(q.styl || "").slice(0, 60) });
      }
      poPartii(wynik);
      log(`  ${intencja}/${partia}: ${dodane}/${k}, ${r.usd.toFixed(4)} USD`);
      zostalo -= Math.max(dodane, 1);
    }
  }
  return wynik;
}

/** rodzina stylu: model zapisuje go różnie („literowki”, „caps i błędna interpunkcja”), a pytanie z `po` to zawsze dopytanie */
export function rodzinaStylu(k) {
  if (k.po && k.po.length) return "dopytanie";
  const s = String(k.styl || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").toLowerCase();
  if (/bez polskich/.test(s)) return "bez polskich znaków";
  if (/literow/.test(s)) return "literówki";
  if (/slang|potoczn/.test(s)) return "slang";
  if (/skrot/.test(s)) return "skróty";
  if (/emotk|wykrzyk/.test(s)) return "emotki";
  if (/caps|interpunk/.test(s)) return "interpunkcja lub CAPS";
  if (/dlugie|pelne/.test(s)) return "długie zdanie";
  if (/jedno|krotkie/.test(s)) return "jedno–dwa słowa";
  if (/dopyt/.test(s)) return "dopytanie";
  return "poprawna polszczyzna";
}

/** 50 do zatwierdzenia: po kolei z każdej intencji i z kolejnym stylem, deterministycznie. Pierwsza wersja brała pierwsze wiersze każdej partii,
    więc wszystkie 50 było „poprawną polszczyzną”: zatwierdzałoby się najłatwiejszą część, bez literówek, slangu i dopytań. */
export function probka(kandydaci, ile = 50) {
  const wg = new Map(), style = [];
  for (const k of kandydaci) {
    const s = rodzinaStylu(k);
    if (!style.includes(s)) style.push(s);
    if (!wg.has(k.intencja)) wg.set(k.intencja, new Map());
    const m = wg.get(k.intencja);
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(k);
  }
  const out = [], n = style.length;
  let wskaznik = 0, zostalo = kandydaci.length;
  while (out.length < ile && zostalo > 0) {
    for (const m of wg.values()) {
      if (out.length >= ile) break;
      for (let t = 0; t < n; t++) {
        const q = m.get(style[(wskaznik + t) % n]);
        if (q && q.length) { out.push(q.shift()); zostalo--; break; }
      }
      wskaznik++;
    }
  }
  return out;
}

function mdProbki(p, wszystkich) {
  const esc = (s) => String(s).replace(/\|/g, "/");
  return [`# Ławka v2 — próbka ${p.length} z ${wszystkich} pytań od Claude (${DZIS}) — do OK Filipa`, "",
    "Każde pytanie ma oczekiwaną intencję (ocena klasyfikacji). Zatwierdzenie próbki = zgoda na dopisanie całości (`--scal`); złe pytania wpisz po `--bez` (id).",
    "Próbka idzie przez wszystkie intencje i style, więc celowo pokazuje też trudne przypadki: literówki, slang, dopytania w rozmowie. Mylić się może oczekiwana intencja; takie pytania też wypisz.", "",
    "| id | rozmowa wcześniej | pytanie | intencja | styl | waga |", "|---|---|---|---|---|---|",
    ...p.map((k) => `| ${k.id} | ${esc((k.po || []).join(" → ")) || "—"} | ${esc(k.p)} | ${k.intencja} | ${rodzinaStylu(k)} | ${k.waga} |`), ""].join("\n");
}

const lit = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
export function wierszW(k, luka) {
  const extra = { intencja: k.intencja, zrodlo: "claude", ...(k.po ? { po: k.po } : {}), ...(luka ? { luka: "gen", uwaga: "dziś: " + luka } : {}) };
  const ex = "{ " + Object.entries(extra).map(([a, b]) => `${a}: ${Array.isArray(b) ? "[" + b.map(lit).join(", ") + "]" : lit(b)}`).join(", ") + " }";
  return `  W(${lit(k.p)}, ${lit(k.kat)}, ${k.waga}, ${lit(MAPA[k.intencja])}, ${ex}),`;
}

/** wstawia/odświeża sekcję wygenerowaną w pliku ławki; `luki` = mapa id → ślad dla wierszy, które dziś nie przechodzą */
export function zapiszSekcje(plik, kandydaci, luki = {}) {
  let s = fs.readFileSync(plik, "utf8"); const CRLF = s.includes("\r\n"); s = s.split("\r\n").join("\n");
  const sekcja = [ZNACZNIK_OD, ...kandydaci.map((k) => wierszW(k, luki[k.id])), ZNACZNIK_DO].join("\n");
  const od = s.indexOf(ZNACZNIK_OD), dO = s.indexOf(ZNACZNIK_DO);
  if (od >= 0 && dO > od) s = s.slice(0, od) + sekcja + s.slice(dO + ZNACZNIK_DO.length);
  else { const koniec = s.lastIndexOf("\n];"); if (koniec < 0) throw new Error("nie znalazłem końca tablicy PYTANIA"); s = s.slice(0, koniec) + "\n" + sekcja + s.slice(koniec); }
  fs.writeFileSync(plik, CRLF ? s.split("\n").join("\r\n") : s);
}

/** nagrania żywe → plik CI: tylko brakujące klucze, bez czasu (ms); istniejące (ręczne `_recznie_*`, starsze) zostają. → ile dopisano */
export function dopiszNagrania(ci, zywe) {
  let dopisano = 0;
  for (const [k, v] of Object.entries(zywe)) {
    if (k in ci || k.startsWith("_")) continue;
    const { ms: _ms, ...bezCzasu } = v;
    ci[k] = bezCzasu; dopisano++;
  }
  return dopisano;
}

if (import.meta.main) {
  const model = arg("--model", MODELE.opus);
  if (jest("--nagrania")) {
    const pCi = path.join(KORZEN, "tests", "_nagrania-v2.json"), pZ = path.join(KORZEN, "tests", "_nagrania-v2-zywe.json");
    const ci = JSON.parse(fs.readFileSync(pCi, "utf8")), n = dopiszNagrania(ci, JSON.parse(fs.readFileSync(pZ, "utf8")));
    fs.writeFileSync(pCi, JSON.stringify(ci, null, 1) + "\n");
    console.log(`dopisano nagrań: ${n}; teraz: deno run -A tools/lawka-generator.mjs --scal --przelicz`);
  } else if (jest("--probka")) {   // nowa próbka z zapisanych kandydatów (0 $)
    const d = JSON.parse(fs.readFileSync(PLIK_KANDYDATOW, "utf8"));
    const pm = path.join(KORZEN, "docs", `lawka-probka-${d.dzis}.md`);
    fs.writeFileSync(pm, mdProbki(probka(d.kandydaci, Number(arg("--probka", "50"))), d.kandydaci.length));
    console.log("próbka:", pm);
  } else if (jest("--generuj")) {
    const n = Number(arg("--generuj", "1500"));
    const { PYTANIA } = require("../tests/_lawka-v2-pytania.js");
    console.log(`Claude (${model}) generuje ${n} pytań…`);
    const zapisz = (lista) => fs.writeFileSync(PLIK_KANDYDATOW, JSON.stringify({ dzis: DZIS, model, kandydaci: lista }, null, 1) + "\n");
    const k = await generuj(n, { model, istniejace: PYTANIA.map((w) => w.p), poPartii: zapisz });
    zapisz(k);
    const pm = path.join(KORZEN, "docs", `lawka-probka-${DZIS}.md`);
    fs.writeFileSync(pm, mdProbki(probka(k), k.length));
    console.log(`kandydaci: ${k.length} → ${PLIK_KANDYDATOW}\npróbka do OK: ${pm}\nkoszt: ${(podsumowanie().narzedzia["lawka-generator"] || { usd: 0 }).usd.toFixed(2)} USD (łącznie ${podsumowanie().razem.toFixed(2)} / 90 USD)`);
  } else if (jest("--scal")) {
    const dane = JSON.parse(fs.readFileSync(PLIK_KANDYDATOW, "utf8")), kandydaci = dane.kandydaci;
    const bez = new Set([...(dane.odrzucone || []), ...String(arg("--bez", "")).split(",").map((x) => x.trim()).filter(Boolean)]);
    fs.writeFileSync(PLIK_KANDYDATOW, JSON.stringify({ ...dane, odrzucone: [...bez] }, null, 1) + "\n");   // --przelicz pamięta odrzucone
    const lista = kandydaci.filter((k) => !bez.has(k.id));
    zapiszSekcje(PLIK_LAWKI, lista);   // najpierw bez luk — przebieg ławki potrzebuje wierszy w pliku
    delete require.cache[require.resolve("../tests/_lawka-v2-pytania.js")];
    const { przebieg } = require("../tests/_lawka-v2.js");
    const wiersze = lista.map((k) => ({ p: k.p, kat: k.kat, waga: k.waga, oczekiwane: MAPA[k.intencja], ...(k.po ? { po: k.po } : {}), id: k.id }));
    const w = await przebieg(wiersze);
    const luki = {}; w.forEach((r, i) => { if (!r.pasuje) luki[lista[i].id] = r.slad || "∅"; });
    zapiszSekcje(PLIK_LAWKI, lista, luki);
    console.log(`dopisano ${lista.length} pytań (pominięte: ${bez.size}); przechodzi dziś ${lista.length - Object.keys(luki).length}, luka 'gen': ${Object.keys(luki).length}`);
  } else {
    console.log("użycie: --generuj 1500 | --scal [--bez id,id] [--przelicz] | --nagrania");
  }
}
