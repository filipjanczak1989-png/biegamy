#!/usr/bin/env node
// Kadry dnia v2 (31.10.2026, „Dziś v2" commit B) — generator lokalny, NIE front.
//
// Kadr NN = ten sam numer co solo-NN i _SOLO_PODPISY[NN-1]; tagi (pogoda/typ) czytane z sb.js (SOLO.TAGI),
// żeby nie było drugiej kopii mapy. Model gemini-nano-banana-2.1 (Interactions API), 9:16, 2K → dłuższy bok
// 1600 px + JPEG q80 (q75, gdy po q80 > 300 KB) tym samym jpeg.wasm co EF race-image (imagescript 1.2.15).
// Klucz z GEMINI_API_KEY. Pora roku = tag s: z SOLO.sezonKadru (sb.js): p:snieg → zima, p:upal → lato, reszta
// n % 4. SOLO wyklucza kadr innej pory niż dzień (data w Warszawie), więc pora w obrazie MUSI zgadzać się z tagiem.
//
// Użycie:
//   node tools/kadry/generuj-kadry.mjs --out <katalog> [--nr 46,31,7 | --od 1 --do 65] [--odstep 10] [--force]
//                                      [--log <plik>] [--podglad tools/kadry/podglad.html] [--tylko-podglad] [--pokaz-prompty]
//                                      [--dociagnij-rozmiar]  ← istniejące pliki > 300 KB → q75, bez wywołania API
//                                      [--kolumny 6]          ← liczba kolumn siatki podglądu (pora roku i osie przy każdym kafelku)
//   Domyślnie pomija istniejące kadr-NN.jpg (--force nadpisuje). 401/403/429/5xx przerywa pętlę; brak obrazu → dalej.
//   --out bez wartości = ODMOWA: katalog wyjściowy podaje się jawnie (biegamy-assets dopiero po akceptacji).
//   --pula dzis (kadr-NN, 9:16, podpisy + TAGI) | pejzaz (pejzaz-NN, 21:9, bez tagów) | typ | strona (tematy: G3/G4)
//   --format 9x16 (2K → dłuższy bok 1600) | 21x9 (1K → szerokość 1200); domyślny wynika z puli.
//   Osie wariantów (Grafiki v4): tools/kadry/osie.mjs — jedno źródło dla generatora i testu blizna-57.
import { osie, zdaniaOsi } from "./osie.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KORZEN = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL = "gemini-nano-banana-2.1";
const JPEG_WASM = "https://deno.land/x/imagescript@1.2.15/utils/wasm/jpeg.wasm";
const JPEG_Q = 80, JPEG_Q_CIEZKI = 75, PROG_PRZEKODOWANIA = 400 * 1024, PROG_CIEZKI = 300 * 1024;

// ── argumenty ─────────────────────────────────────────────────────────────
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const OUT = arg("out"); if (!OUT || OUT === true) { console.error("podaj --out <katalog>"); process.exit(2); }
const FORCE = arg("force", false) === true, ODSTEP = Number(arg("odstep", 10));
const LOG = arg("log", join(OUT, `kadry-${new Date().toISOString().slice(0, 10)}.log`));
const PODGLAD = arg("podglad", null);
const KOLUMNY = Number(arg("kolumny", 6));
const PULE = {
  dzis:   { prefiks: "kadr-",   format: "9x16", N: null, gotowa: true },
  pejzaz: { prefiks: "pejzaz-", format: "21x9", N: 40,   gotowa: true },
  typ:    { prefiks: "typ-",    format: "21x9", N: null, gotowa: false, kiedy: "G4 (zwiad typów z TRAINING_TYPE_BANNERS)" },
  strona: { prefiks: "strona-", format: "21x9", N: null, gotowa: false, kiedy: "G3 (tematy stron wewnętrznych)" },
};
const FORMATY = {
  "9x16": { aspect: "9:16", rozmiar: "2K", cel: (W, H) => { const b = Math.max(W, H); return b > 1600 ? [Math.round(W * 1600 / b), Math.round(H * 1600 / b)] : null; } },
  "21x9": { aspect: "21:9", rozmiar: "1K", cel: (W, H) => W > 1200 ? [1200, Math.round(H * 1200 / W)] : null },
};
const PULA = String(arg("pula", "dzis"));
if (!PULE[PULA]) { console.error(`--pula: ${Object.keys(PULE).join(" | ")}`); process.exit(2); }
const FORMAT = String(arg("format", PULE[PULA].format));
if (!FORMATY[FORMAT]) { console.error(`--format: ${Object.keys(FORMATY).join(" | ")}`); process.exit(2); }
if (!PULE[PULA].gotowa) { console.error(`pula „${PULA}": tematy jeszcze nie zatwierdzone — ${PULE[PULA].kiedy}`); process.exit(2); }

// ── źródła prawdy: TAGI z sb.js, podpisy z zawodnik.html ──────────────────
const sb = readFileSync(join(KORZEN, "sb.js"), "utf8");
const mTagi = sb.match(/var TAGI = (\{[\s\S]*?\});/);
if (!mTagi) { console.error("nie znalazłem `var TAGI = {...};` w sb.js"); process.exit(2); }
const TAGI = new Function("return " + mTagi[1])();
/* Pora roku kadru (tag s:) — ta sama funkcja co SOLO.sezonKadru w sb.js, wycięta z pliku, nie przepisana. */
const mSezon = sb.match(/var PORY = (\[[^\]]*\]);\s*function sezonKadru\(n\)\{([^\r\n]*)\}/);
if (!mSezon) { console.error("nie znalazłem `var PORY` + `function sezonKadru` w sb.js"); process.exit(2); }
const zbudujSezon = new Function("TAGI", "var PORY = " + mSezon[1] + "; return function(n){" + mSezon[2] + "};");
const sezonKadru = zbudujSezon(TAGI);
/* Pejzaż ma własną numerację — tagi kadrów Dziś go nie dotyczą: ta sama reguła (noce n % 12, reszta n % 4) bez TAGI. */
const sezonPejzazu = zbudujSezon({});
const PORA_SLOWNIE = { wiosna: "Wiosna", lato: "Lato", jesien: "Jesień", zima: "Zima" };
const zaw = readFileSync(join(KORZEN, "zawodnik.html"), "utf8");
const a = zaw.indexOf("const _SOLO_PODPISY = ["), b = zaw.indexOf("]", zaw.indexOf("'Jutro pobiegniesz *z nami*?'", a));
const PODPISY = new Function("return " + zaw.slice(a + "const _SOLO_PODPISY = ".length, b + 1))();
const N = PULA === "dzis" ? PODPISY.length : PULE[PULA].N;
const POKAZ = arg("pokaz-prompty", false) === true;

let numery;
if (arg("nr")) numery = String(arg("nr")).split(",").map((x) => Number(x.trim())).filter(Boolean);
else { const od = Number(arg("od", 1)), dO = Number(arg("do", N)); numery = []; for (let n = od; n <= dO; n++) numery.push(n); }
if (numery.some((n) => n < 1 || (!POKAZ && n > N))) { console.error(`numery poza 1..${N} (pula ${PULA}; podgląd promptów dopuszcza więcej)`); process.exit(2); }

// ── prompt (Dzis-v2-projekt.md 5.3 — jedyna „kreatywna" tabela, bez własnych dopisków) ──
const SCENA = {
  "p:deszcz": "deszcz, mokra nawierzchnia odbija światło, kaptur; ulica osiedla albo alejka parku",
  "p:snieg": "świeży śnieg na drodze, ślady butów, zimowe ubranie, para z oddechu; droga polna lub park",
  "p:upal": "letni upał, ostre południowe światło, cień drzew na asfalcie; droga wzdłuż pól",
  "p:wiatr": "wiatr, pochylone trawy i drzewa, otwarta przestrzeń; wał rzeczny lub grobla",
  "p:mgla": "gęsta mgła, miękkie światło, widoczność kilkadziesiąt metrów; leśna droga",
  "t:interwaly": "bieżnia stadionu, linie torów, pusta trybuna w tle",
  "t:tempo": "równa asfaltowa droga, długa prosta, horyzont",
  "t:regeneracja": "spokojna ścieżka w parku, miękkie światło, ławka",
  "t:dlugie": "długa droga przez las lub pola, zakręt znikający w głębi",
  "t:silownia": "siłownia: hantle, mata, okno",
};
/* Nawierzchnia sceny (klucz NAWIERZCHNIE w osie.mjs) — kompozycja odmienia ją zamiast pisać „drogę" na sztywno. */
const NAW_TAGU = { "p:deszcz": "ulica", "p:snieg": "droga", "p:upal": "droga", "p:wiatr": "droga", "p:mgla": "droga",
  "t:interwaly": "tor", "t:tempo": "droga", "t:regeneracja": "sciezka", "t:dlugie": "droga", "t:silownia": "droga" };
const BEZ_TAGU = [
  { opis: "zwykła trasa treningowa: osiedle", naw: "ulica" }, { opis: "zwykła trasa treningowa: park", naw: "alejka" },
  { opis: "zwykła trasa treningowa: droga polna", naw: "droga" }, { opis: "zwykła trasa treningowa: nabrzeże", naw: "bulwar" },
];
const PEJZAZE = [
  { opis: "droga polna między polami", naw: "droga" }, { opis: "szlak w lesie", naw: "szlak" },
  { opis: "bieżnia stadionu z pustą trybuną", naw: "tor" }, { opis: "most nad rzeką", naw: "kladka" },
  { opis: "nabrzeże rzeki", naw: "bulwar" }, { opis: "park miejski z alejką", naw: "alejka" },
];
function scenaNumeru(n) {
  const wyj = PULA === "dzis" ? SCENA_Z_PODPISU[n] : null, tag = tagKadru(n);
  if (wyj) return { opis: wyj.scena, naw: wyj.naw || "droga" };
  if (PULA === "pejzaz") return PEJZAZE[n % PEJZAZE.length];
  if (tag) return { opis: SCENA[tag], naw: NAW_TAGU[tag] || "droga" };
  return BEZ_TAGU[n % 4];
}
/* Scena z podpisu — WYJĄTKI zatwierdzone przez Filipa 31.10; podpis opisuje konkretny obraz, którego tagi nie niosą.
   Nowy wyjątek = decyzja, nie dopisek. */
const SCENA_Z_PODPISU = {
  5: { scena: "para butów do biegania na progu przed drzwiami, poranne światło, widok nisko przy ziemi", poraDnia: "świt",
       kadr: "Kadr: bez człowieka i bez dłoni — tylko para butów do biegania, widok nisko przy ziemi. Żadnych ludzi.",
       kompozycja: "Kompozycja pionowa: buty w środkowej części kadru, dolna jedna trzecia spokojna — pusta podłoga albo próg, cień, bez ważnych szczegółów.",
       styl: "Styl dokumentalny: obiektyw 35 mm, niedoskonałe, nieustawiane poranne światło." },
  14: { scena: "droga polna w złotych i czerwonych liściach, liście na nawierzchni, ciepłe niskie słońce" },
  22: { scena: "pusta linia startu namalowana na asfalcie, jeden biegacz w rozgrzewce przy linii", poraDnia: "świt" },
  /* G2 (31.10.2026) — sceny z projektu „Grafiki v4", pkt 1 */
  71: { scena: "pusta zaśnieżona droga, ślady butów na śniegu", poraDnia: "świt",
        kadr: "Kadr: bez człowieka — tylko pusta zaśnieżona droga i ślady butów. Żadnych ludzi.",
        kompozycja: "Kompozycja: ślady prowadzą wzrok w głąb drogi, dolna część spokojna — gładki śnieg, bez ważnych szczegółów." },
  75: { scena: "bidon i zegarek sportowy na murku, ostre światło", poraDnia: "południe", ogniskowa: 2,
        kadr: "Kadr: zbliżenie — bidon i zegarek sportowy na murku, bez człowieka: żadnej twarzy, żadnych dłoni ani części ciała w kadrze.",
        kompozycja: "Kompozycja: przedmioty w środkowej części kadru, tło miękko rozmyte, dolna część spokojna, bez ważnych szczegółów." },
  83: { scena: "mokry park, pusta alejka", poraDnia: "świt", naw: "alejka",
        kadr: "Kadr: bez człowieka — pusta mokra alejka w parku. Żadnych ludzi.",
        kompozycja: "Kompozycja: alejka prowadzi wzrok w głąb, dolna część spokojna — mokra nawierzchnia, bez ważnych szczegółów." },
  /* 88 bez numeru startowego (decyzja Filipa po siatce G2): podpis o starcie czytelny bez cyfr na kadrze */
  88: { scena: "buty startowe i agrafki na stole, obok zegarek sportowy, poranek", poraDnia: "rano", ogniskowa: 2,
        kadr: "Kadr: zbliżenie — buty startowe i agrafki na stole, obok zegarek sportowy, bez człowieka: żadnej twarzy, żadnych dłoni ani części ciała w kadrze.",
        kompozycja: "Kompozycja: przedmioty w środkowej części kadru, tło miękko rozmyte, dolna część spokojna, bez ważnych szczegółów." },
};

function tagKadru(n) { if (PULA !== "dzis") return null; const t = TAGI[n] || {}; return t.p ? "p:" + t.p : t.t ? "t:" + t.t : null; }
function sezon(n) { return PULA === "dzis" ? sezonKadru(n) : sezonPejzazu(n); }
function osieNumeru(n) {
  const t = PULA === "dzis" ? (TAGI[n] || {}) : {};
  return osie(n, { pula: PULA, sezon: sezon(n), tagP: t.p, tagT: t.t, wyjatek: PULA === "dzis" ? SCENA_Z_PODPISU[n] : null, nawierzchnia: scenaNumeru(n).naw });
}
function prompt(n) {
  const tag = tagKadru(n);
  const wyj = PULA === "dzis" ? SCENA_Z_PODPISU[n] : null;
  const o = osieNumeru(n);
  const scena = o.scenaNocna || scenaNumeru(n).opis;
  const z = zdaniaOsi(o, wyj);
  const naglowek = FORMAT === "21x9" ? "Poziomy, szeroki kadr (21:9) dla aplikacji biegowej, Polska." : "Pionowy kadr dnia dla biegacza, Polska.";
  return [
    `${naglowek} ${scena[0].toUpperCase() + scena.slice(1)}. ${PORA_SLOWNIE[sezon(n)]}, ${o.poraDnia}${o.pogoda ? ", " + o.pogoda : ""}.`,
    z.kadr, z.styl, z.kompozycja,
    "Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.",
  ].filter(Boolean).join(" ");
}

// ── jpeg.wasm (ten sam co EF) ─────────────────────────────────────────────
let w = null;
async function wasm() {
  if (w) return w;
  const r = await fetch(JPEG_WASM); if (!r.ok) throw new Error("jpeg.wasm " + r.status);
  w = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(await r.arrayBuffer()))).exports;
  return w;
}
const u8 = (p, n) => new Uint8Array(w.memory.buffer, p, n);
function dekoduj(b) { const p = w.walloc(b.length); u8(p, b.length).set(b); const f = w.decode(p, b.length, 0, 0); if (f <= 1) throw new Error("dekod " + f);
  const r = { W: w.decode_width(f), H: w.decode_height(f), piks: u8(w.decode_buffer(f), w.wlen()).slice() }; w.decode_free(f); return r; }
function koduj(rgba, W, H, q = JPEG_Q) { const p = w.walloc(rgba.length); u8(p, rgba.length).set(rgba); const o = w.encode(p, W, H, q); const r = u8(o, w.wlen()).slice(); w.wfree(o, w.wlen()); return r; }
async function przeskaluj(bajty, mime) {
  if (mime !== "image/jpeg") return { bajty, opis: "oryginał (" + mime + ")" };
  await wasm();
  const { W, H, piks } = dekoduj(bajty), kan = piks.length / (W * H);
  if (kan !== 1 && kan !== 3) return { bajty, opis: `oryginał (${kan} kanały)` };
  const cel = FORMATY[FORMAT].cel(W, H);
  if (!cel && bajty.length <= PROG_PRZEKODOWANIA) return { bajty, opis: `oryginał ${W}×${H}` };
  const [DW, DH] = cel || [W, H];
  const sx = W / DW, sy = H / DH, rgba = new Uint8Array(DW * DH * 4);
  for (let y = 0; y < DH; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), H - 1), y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < DW; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), W - 1), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), wx = fx - x0, o = (y * DW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const cc = kan === 1 ? 0 : c;
        const p00 = piks[(y0 * W + x0) * kan + cc], p01 = piks[(y0 * W + x1) * kan + cc], p10 = piks[(y1 * W + x0) * kan + cc], p11 = piks[(y1 * W + x1) * kan + cc];
        rgba[o + c] = Math.round((p00 * (1 - wx) + p01 * wx) * (1 - wy) + (p10 * (1 - wx) + p11 * wx) * wy);
      }
      rgba[o + 3] = 255;
    }
  }
  let wynik = koduj(rgba, DW, DH), q = JPEG_Q;
  if (wynik.length > PROG_CIEZKI) { wynik = koduj(rgba, DW, DH, JPEG_Q_CIEZKI); q = JPEG_Q_CIEZKI; }
  return { bajty: wynik, opis: `${W}×${H} → ${DW}×${DH} q${q}` };
}

// ── generowanie ───────────────────────────────────────────────────────────
function obrazZOdpowiedzi(j) {
  for (const k of j.steps || []) for (const e of Array.isArray(k.content) ? k.content : [])
    if (e && e.type === "image" && typeof e.data === "string" && e.data) return { bajty: new Uint8Array(Buffer.from(e.data, "base64")), mime: String(e.mime_type || "") };
  return null;
}
/* LIMIT CZASU (31.10.2026): bez niego jedno zawieszone połączenie blokowało kolejkę — kadr 32 wisiał 19 min,
   kadr 35 prawie 3 h, zanim fetch padł. Zmierzone generowanie to 31–109 s, więc 150 s z zapasem; po przekroczeniu
   albo zerwaniu połączenia JEDNO ponowienie, potem kadr zostaje brakujący (do dorobienia kolejnym przebiegiem). */
const LIMIT_MS = 150000;
async function generujRaz(n) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ model: MODEL, input: prompt(n), response_modalities: ["image"],
      generation_config: { image_config: { aspect_ratio: FORMATY[FORMAT].aspect, image_size: FORMATY[FORMAT].rozmiar } } }),
    signal: AbortSignal.timeout(LIMIT_MS),
  });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); e.status = r.status; throw e; }
  const obraz = obrazZOdpowiedzi(JSON.parse(t)); if (!obraz) throw new Error("odpowiedź bez obrazu");
  return obraz;
}
async function generuj(n) {
  try { return await generujRaz(n); }
  catch (e) {
    if (e.status) throw e;                                  // odpowiedź HTTP — decyduje pętla (STOP albo dalej)
    log(`kadr ${n}: ${e.name === "TimeoutError" ? "limit " + LIMIT_MS / 1000 + " s" : e.message} — ponawiam raz`);
    await czekaj(5000);
    return await generujRaz(n);
  }
}
const log = (s) => { const l = `${new Date().toISOString()} ${s}`; console.log(l); appendFileSync(LOG, l + "\n"); };
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
const plik = (n) => join(OUT, `${PULE[PULA].prefiks}${String(n).padStart(2, "0")}.jpg`);

function podglad() {
  if (!PODGLAD) return;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const kafle = [];
  const doPodgladu = arg("nr") || arg("od") ? numery : Array.from({ length: N }, (_, i) => i + 1);
  for (const n of doPodgladu) {
    const p = plik(n); if (!existsSync(p)) continue;
    const o = osieNumeru(n);
    const osieTxt = `${sezon(n)} · ${o.kompozycja.nazwa} · ${o.podmiot}${o.detal ? ": " + o.detal : ""} · ${o.poraDnia} · ${o.pogoda || "pogoda z tagu"} · ${["24", "50", "85"][o.ogniskowaNr]} mm${o.wyjatek ? " · WYJĄTEK" : ""}`;
    const url = "file:///" + resolve(p).replace(/\\/g, "/");
    kafle.push(`<figure><img src="${esc(url)}" alt="kadr ${n}" loading="lazy"><figcaption><b>${String(n).padStart(2, "0")}</b> ${esc(tagKadru(n) || "bez tagu")} · ${Math.round(statSync(p).size / 1024)} KB<br><span class="osie">${esc(osieTxt)}</span><br><i>${esc((PODPISY[n - 1] || "").replace(/\*/g, ""))}</i><details><summary>prompt</summary>${esc(prompt(n))}</details></figcaption></figure>`);
  }
  writeFileSync(PODGLAD, `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kadry dnia v2 — podgląd</title><style>
body{margin:0;padding:16px;background:#07070a;color:#f0ede8;font:13px/1.4 system-ui,sans-serif}h1{font-size:18px;margin:0 0 12px}
.siatka{display:grid;grid-template-columns:repeat(${KOLUMNY},1fr);gap:12px}.osie{color:#ff9060}figure{margin:0;background:#0f0f14;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden}
img{display:block;width:100%;aspect-ratio:${FORMAT === "21x9" ? "21/9" : "9/16"};object-fit:cover}figcaption{padding:8px;font-size:11px}i{color:rgba(240,237,232,.65)}details{margin-top:4px;color:#8a8798}
@media(max-width:900px){.siatka{grid-template-columns:repeat(3,1fr)}}</style></head><body>
<h1>Kadry dnia v2 — ${kafle.length} z ${N} (${esc(resolve(OUT))})</h1><div class="siatka">${kafle.join("\n")}</div></body></html>`);
  console.log("podgląd: " + resolve(PODGLAD));
}

if (arg("tylko-podglad", false) === true) { podglad(); process.exit(0); }
if (arg("dociagnij-rozmiar", false) === true) {
  await wasm();
  for (const n of numery) {
    const p = plik(n); if (!existsSync(p)) continue;
    const b = new Uint8Array(readFileSync(p)); if (b.length <= PROG_CIEZKI) continue;
    const { W, H, piks } = dekoduj(b), kan = piks.length / (W * H); if (kan !== 3) continue;
    const rgba = new Uint8Array(W * H * 4); for (let i = 0, j = 0; i < W * H; i++, j += 3) { rgba[i*4] = piks[j]; rgba[i*4+1] = piks[j+1]; rgba[i*4+2] = piks[j+2]; rgba[i*4+3] = 255; }
    const nowe = koduj(rgba, W, H, JPEG_Q_CIEZKI); writeFileSync(p, nowe);
    console.log(`kadr ${n}: ${b.length} B → q${JPEG_Q_CIEZKI} ${nowe.length} B (bez API)`);
  }
  podglad(); process.exit(0);
}
if (POKAZ) {
  for (const n of numery) {
    const o = osieNumeru(n), i = o.indeksy;
    console.log(`--- ${PULA} ${n} [${tagKadru(n) || "bez tagu"}] pora roku: ${sezon(n)}${PULA === "dzis" ? " · podpis: " + (PODPISY[n - 1] || "(brak — G2)") : ""}`);
    console.log(`    osie: kompozycja ${i.kompozycja} „${o.kompozycja.nazwa}" · podmiot ${o.podmiotNr ?? "—"} „${o.podmiot}${o.detal ? ": " + o.detal : ""}" · pora dnia „${o.poraDnia}" · pogoda „${o.pogoda || (o.scenaNocna ? "(z linii nocy)" : "(z tagu/wnętrza)")}" · ogniskowa ${["24", "50", "85"][o.ogniskowaNr]} mm${o.wyjatek ? " · WYJĄTEK SCENY" : ""}`);
    console.log(prompt(n));
  }
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY) { console.error("brak GEMINI_API_KEY w środowisku"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
log(`start: pula ${PULA}, format ${FORMAT}, ${numery.length} kadrów (${numery.join(",")}), N=${N}, model ${MODEL}, out ${resolve(OUT)}`);
let zrobione = 0;
for (let i = 0; i < numery.length; i++) {
  const n = numery[i];
  if (!FORCE && existsSync(plik(n))) { log(`kadr ${n}: jest, pomijam`); continue; }
  const t0 = Date.now();
  try {
    const obraz = await generuj(n);
    const { bajty, opis } = await przeskaluj(obraz.bajty, obraz.mime);
    writeFileSync(plik(n), bajty); zrobione++;
    log(`kadr ${n} [${tagKadru(n) || "bez tagu"}]: ${obraz.mime} ${obraz.bajty.length} B → ${opis}, ${bajty.length} B, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    log(`kadr ${n}: BŁĄD ${e.message}`);
    if (e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500) { log("STOP"); break; }   // brak obrazu / błąd dekodu → następny numer
  }
  if (i < numery.length - 1) await czekaj(ODSTEP * 1000);
}
log(`koniec: wygenerowano ${zrobione}`);
podglad();
