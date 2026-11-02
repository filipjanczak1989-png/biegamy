// KALENDARZ L4 — okładki imprez z maszyny wyników HURTEM, LOKALNIE (decyzja Filipa 2.11: nie z klienta; limit 30/dobę;
// ta sama impreza w kolejnych latach = ta sama okładka → klucz BEZ ROKU, js/kalendarz-lista.mjs kluczBezRoku).
//   node tools/kalendarz/generuj-okladki.mjs <kalendarz.csv> [--ile N] [--na-sucho] [--od YYYY-MM-DD] [--dni 365]
// Wejście: eksport kalendarza maszyny (Downloads\kalendarz-mapa.csv: nazwa,data,miasto,dystanse,…,odwolane). Dla każdej
// imprezy w oknie (od dziś, domyślnie 365 dni, bez odwołanych) liczy klucz bez roku; pomija klucze, które już są w
// public.imprezy_okladki; generuje najwyżej N (domyślnie 30, licząc także wiersze z DZIŚ w bazie) obrazów 21:9 1K tym samym
// modelem i tą samą konwencją promptu co EF race-image (zbudujPrompt: forma, dystans, miasto, nazwa jako inspiracja, pora roku,
// sceneria z typu, noc, bez tekstu); wysyła do bucketa race-covers jako impreza-<sha1(klucz)>.jpg i wpisuje wiersz.
// Sekrety z env: GEMINI_API_KEY, SUPABASE_SERVICE_KEY (klucz serwisowy — tylko w pamięci procesu, nigdy w pliku). Koszt ≈ $0,034/kadr.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const KORZEN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
await import(pathToFileURL(path.join(KORZEN, "js", "tekst.mjs")).href);
await import(pathToFileURL(path.join(KORZEN, "js", "kalendarz-lista.mjs")).href);
const K = globalThis.BM_KALENDARZ, T = globalThis.BM_TEKST;

const SB_URL = "https://afqojgkaveykxbltxzwm.supabase.co", BUCKET = "race-covers", MODEL = "gemini-nano-banana-2.1", LIMIT_DOBA = 30;
const args = process.argv.slice(2);
const plik = args.find((a) => !a.startsWith("--"));
const opcja = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const naSucho = args.includes("--na-sucho");
const ile = Math.min(LIMIT_DOBA, Number(opcja("--ile", LIMIT_DOBA)) || LIMIT_DOBA);
const od = opcja("--od", K.dzien()), dniOkna = Number(opcja("--dni", 365)) || 365;
const doD = new Date(Date.parse(od + "T12:00:00Z") + dniOkna * 86400000).toISOString().slice(0, 10);
if (!plik) { console.error("użycie: generuj-okladki.mjs <kalendarz.csv> [--ile N] [--na-sucho] [--od YYYY-MM-DD] [--dni 365]"); process.exit(2); }
const GEMINI = process.env.GEMINI_API_KEY, SERWIS = process.env.SUPABASE_SERVICE_KEY;
if (!naSucho && (!GEMINI || !SERWIS)) { console.error("brak GEMINI_API_KEY albo SUPABASE_SERVICE_KEY w env"); process.exit(2); }

/* CSV (prosty parser: cudzysłowy, przecinki w polach, BOM) */
function csv(tekst) {
  const wiersze = [], re = /("([^"]|"")*"|[^,\n\r]*)(,|\r?\n|$)/g; let w = [], m;
  tekst = tekst.replace(/^﻿/, "");
  while ((m = re.exec(tekst)) && m[0] !== "") { w.push(m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]); if (m[3] !== ",") { wiersze.push(w); w = []; } }
  const kol = wiersze.shift();
  return wiersze.filter((r) => r.length >= kol.length && r.some(Boolean)).map((r) => Object.fromEntries(kol.map((k, i) => [k, r[i]])));
}
const dystanse = (v) => String(v || "").split(/[;,|]/).map((x) => Number(String(x).replace(",", ".").replace(/[^\d.]/g, ""))).filter((x) => x > 0).slice(0, 6);

/* ten sam prompt co EF race-image (zbudujPrompt), z typem z BM_KALENDARZ zamiast samej heurystyki po nazwie */
const SCENERIE = { ulica: "ulice miasta, zabudowa w tle", "ulica-noc": "ulice miasta nocą, zabudowa w tle, mokry asfalt", trail: "leśna lub górska ścieżka, naturalny teren",
  ultra: "bardzo długa droga przez rozległy krajobraz, wzgórza aż po horyzont", przelaj: "leśna ścieżka przełajowa, korzenie i liście, drzewa", nordic: "szeroka żwirowa aleja, dwie osoby idące z kijkami nordic walking" };
const przytnij = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
function dystansOpis(d) { const km = d[0]; if (!km) return "bieg"; if (Math.abs(km - 42.195) < 0.3) return "maraton"; if (Math.abs(km - 21.0975) < 0.3) return "półmaraton"; if (km >= 50) return "bieg ultra"; return `bieg na ${Math.round(km * 10) / 10} km`; }
function prompt(e) {
  const miesiac = Number(String(e.data).slice(5, 7)), pora = miesiac <= 2 || miesiac === 12 ? "zima" : miesiac <= 5 ? "wiosna" : miesiac <= 8 ? "lato" : "jesień";
  return [`Szeroka okładka wydarzenia biegowego: ${e.typ === "nordic" ? "marsz nordic walking" : dystansOpis(e.dystanse)}`, e.miasto ? `w miejscowości ${przytnij(e.miasto, 60)}` : "",
    `(${przytnij(e.nazwa, 80)}), pora roku: ${pora}.`, `Sceneria: ${SCENERIE[e.typ]}.`,
    e.typ === "ulica-noc" ? "Realistyczna fotografia reportażowa nocą: ciemne niebo, światło latarni i czołówek biegaczy." : "Realistyczna fotografia reportażowa, naturalne światło dzienne.",
    "Kadr: jeden albo dwóch biegaczy, widzianych z dystansu i od tyłu, daleko od siebie, na pustym odcinku trasy.",
    "Żadnego tłumu, żadnej grupy biegaczy, żadnego peletonu ani startu masowego.",
    "Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło.",
    "Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów."].filter(Boolean).join(" ");
}
function obraz(json) {
  for (const krok of json.steps || []) for (const el of krok.content || []) if (el && el.type === "image" && typeof el.data === "string" && el.data) return { bajty: Buffer.from(el.data, "base64"), mime: String(el.mime_type || "") };
  return null;
}
const naglowki = { apikey: SERWIS, Authorization: "Bearer " + SERWIS };
async function rest(sciezka, init = {}) {
  const r = await fetch(SB_URL + sciezka, { ...init, headers: { ...naglowki, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${sciezka}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

/* 1. kandydaci z CSV: okno, bez odwołanych, po jednym na klucz (najbliższa edycja) */
const wiersze = csv(readFileSync(plik, "utf8"));
/* nazwy UCIĘTE w eksporcie („…") dałyby inny klucz niż pełna nazwa z F6 w przeglądarce → okładka by się nie znalazła; pomijamy */
const okno = wiersze.filter((r) => r.data >= od && r.data <= doD && r.odwolane !== "tak" && r.nazwa && r.nazwa_ucieta !== "tak" && !/\.{3}$|…$/.test(r.nazwa)).sort((a, b) => a.data < b.data ? -1 : 1);
const kand = new Map();
for (const r of okno) { const k = K.kluczBezRoku(r.nazwa, r.miasto); if (!k.startsWith("|") && !kand.has(k)) kand.set(k, { klucz: k, nazwa: r.nazwa, miasto: r.miasto || null, data: r.data, dystanse: dystanse(r.dystanse), typ: K.typImprezy(r.nazwa, dystanse(r.dystanse)) }); }
console.log(`okno ${od}…${doD}: ${okno.length} imprez, ${kand.size} kluczy bez roku`);

/* 2. już są w bazie + licznik dzisiejszych (limit 30/dobę liczony łącznie z bazą) */
let sa = new Set(), dzisWBazie = 0;
if (!naSucho) {
  const rows = await rest(`/rest/v1/imprezy_okladki?select=klucz,wygenerowano_at`);
  sa = new Set(rows.map((x) => x.klucz)); dzisWBazie = rows.filter((x) => String(x.wygenerowano_at).slice(0, 10) === K.dzien()).length;
}
const doZrobienia = [...kand.values()].filter((e) => !sa.has(e.klucz));
const budzet = Math.max(0, Math.min(ile, LIMIT_DOBA - dzisWBazie));
console.log(`w bazie ${sa.size}, do zrobienia ${doZrobienia.length}, dziś już ${dzisWBazie}, zrobię ${Math.min(budzet, doZrobienia.length)}${naSucho ? " (NA SUCHO)" : ""}`);
if (naSucho) { for (const e of doZrobienia.slice(0, budzet)) console.log(` · ${e.data} ${e.typ.padEnd(9)} ${e.nazwa} — ${e.miasto || "—"} [${e.klucz}]`); process.exit(0); }

/* 3. generuj → storage → wiersz */
let ok = 0;
for (const e of doZrobienia.slice(0, budzet)) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI },
      body: JSON.stringify({ model: MODEL, input: prompt(e), response_modalities: ["image"], generation_config: { image_config: { aspect_ratio: "21:9", image_size: "1K" } } }) });
    const tekst = await r.text();
    if (!r.ok) throw new Error(`gemini ${r.status} ${tekst.slice(0, 160)}`);
    const o = obraz(JSON.parse(tekst));
    if (!o || !/jpeg|png|webp/.test(o.mime)) throw new Error("brak obrazu w odpowiedzi");
    const nazwaPliku = `impreza-${createHash("sha1").update(e.klucz).digest("hex")}.jpg`;
    const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${nazwaPliku}`, { method: "POST", headers: { ...naglowki, "Content-Type": o.mime || "image/jpeg", "x-upsert": "true", "cache-control": "max-age=31536000" }, body: o.bajty });
    if (!up.ok) throw new Error(`storage ${up.status} ${(await up.text()).slice(0, 160)}`);
    const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${nazwaPliku}?v=${Date.now()}`;
    await rest(`/rest/v1/imprezy_okladki`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ klucz: e.klucz, url, typ: e.typ, nazwa: przytnij(e.nazwa, 140), miasto: e.miasto ? przytnij(e.miasto, 60) : null, zrodlo: MODEL }) });
    ok++;
    console.log(`✓ ${e.typ.padEnd(9)} ${e.nazwa} — ${e.miasto || "—"} (${Math.round(o.bajty.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) { console.error(`✗ ${e.nazwa}: ${err.message}`); }
}
console.log(`gotowe: ${ok} okładek`);
