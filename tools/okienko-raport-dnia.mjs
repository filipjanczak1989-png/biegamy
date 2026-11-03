// RAPORT OKIENKA (Filip 3.11: „stały rytm uczenia” + „samo się sprawdza codziennie”). Jedno narzędzie, trzy tryby:
//   node tools/okienko-raport-dnia.mjs            → wczorajsze 👎 (z komentarzem), reakcje („co odwaliłeś”), samosprawdzenie=false, awarie,
//                                                   czasy > 3 s: pytanie → ścieżka → odpowiedź; kandydaci do ławki; zapis docs/okienko-raport/RRRR-MM-DD.md
//   --lawka                                       → dokłada ławkę v2 (--zywy, gdy jest GEMINI_API_KEY; inaczej atrapy) i porównanie z poprzednim raportem
//   --sedzia                                      → drugi model (tools/_sedzia.mjs: SEDZIA=gemini domyślnie, claude do SEDZIA_CLAUDE_DO) OCENIA każdą zebraną odpowiedź wg 5 kryteriów i wzorców (tylko ocenia)
//   --tydzien                                     → wiersz do docs/okienko-postep.md (ławka %, p50/p90, % 👎, koszt)
//   --noc = --lawka --sedzia (+ --tydzien w poniedziałek)   --limit-usd 0.5 (domyślnie) — przekroczenie = przerwanie i wpis w raporcie
// ODCZYT: EF okienko-raport-dane (verify_jwt off, nagłówek x-raport-secret = sekret RAPORT_SECRET) oddaje dane JEDNEJ doby, już zanonimizowane
// po stronie serwera, bez athlete_id (pseudonimy), ≤ 500 wierszy — klucz service NIE opuszcza Supabase (Filip 3.11: repo publiczne).
// ANONIMIZACJA drugi raz tutaj (ta sama funkcja z _shared) PRZED zapisem; strażnik `czysty` odrzuca raport z resztką danych.
// Nigdy automatycznego deployu — raport czyta Filip / cc rano i dopiero wtedy powstaje gałąź z poprawkami.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { anonimizuj, czysty } from "./_anonimizuj.mjs";
import { wybierzSedziego, ocenOdpowiedz, wzorceZatwierdzone, znajdzWzorzec, trescDlaSedziego, MODEL_SEDZIEGO_CLAUDE } from "./_sedzia.mjs";

const KORZEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const ma = (n) => process.argv.includes(n);
const NOC = ma("--noc");
const OPCJE = { lawka: NOC || ma("--lawka"), sedzia: NOC || ma("--sedzia"), tydzien: ma("--tydzien") || (NOC && new Date().getUTCDay() === 1), limitUsd: Number(arg("--limit-usd", "0.5")), dzien: arg("--dzien", null) };
const SB_URL = process.env.SUPABASE_URL || "https://afqojgkaveykxbltxzwm.supabase.co";
const RAPORT_SECRET = process.env.RAPORT_SECRET || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const CENA = { lite: { we: 0.30, wy: 2.50 } };   // USD / 1 M tokenów, zestawienia 10.2026 — przelicznik, nie faktura
const koszt = { usd: 0, przerwano: null };
const dodajUsd = (usd) => { koszt.usd += usd; if (koszt.usd > OPCJE.limitUsd && !koszt.przerwano) koszt.przerwano = `limit ${OPCJE.limitUsd} USD przekroczony (${koszt.usd.toFixed(3)})`; };
const dodajKoszt = (tok, model) => { const c = CENA[model] || CENA.lite; dodajUsd((tok.we * c.we + tok.wy * c.wy) / 1e6); };

const dzis = OPCJE.dzien || new Date().toISOString().slice(0, 10);
const WYBOR_SEDZIEGO = wybierzSedziego({ sedzia: process.env.SEDZIA, dzis, claudeDo: process.env.SEDZIA_CLAUDE_DO, kluczClaude: process.env.ANTHROPIC_API_KEY, kluczGemini: GEMINI });
let dostawcaSedziego = WYBOR_SEDZIEGO.dostawca, uwagaSedziego = WYBOR_SEDZIEGO.uwaga;
const WZORCE = OPCJE.sedzia ? wzorceZatwierdzone() : [];
const od = new Date(Date.parse(dzis + "T00:00:00Z") - 86400000).toISOString(), doD = dzis + "T00:00:00Z";   // wczorajsza doba (UTC — wystarczy do raportu)

/** wczorajsze wpisy obu logów z EF (już zanonimizowane i bez athlete_id) → kształt raportu; bez sekretu → pusto (suchy przebieg) */
async function wpisy() {
  if (!RAPORT_SECRET) return [];
  const r = await fetch(`${SB_URL}/functions/v1/okienko-raport-dane`, { method: "POST", headers: { "x-raport-secret": RAPORT_SECRET, "content-type": "application/json" }, body: JSON.stringify({ dzien: dzis }) });
  if (!r.ok) throw new Error(`okienko-raport-dane: http ${r.status}`);
  const j = await r.json();
  if (!j || !j.ok || !Array.isArray(j.wpisy)) throw new Error("okienko-raport-dane: zła odpowiedź");
  if (j.liczby && j.liczby.uciete) console.error("uwaga: EF ucięła listę do limitu wierszy");
  return j.wpisy.map((w) => ({ wersja: w.wersja, id: w.id, kiedy: w.kiedy, osoba: w.osoba, pytanie: anonimizuj(w.pytanie), sciezka: [w.tryb, ...(w.narzedzia || [])].join(":") + (w.intencja ? ` · ${w.intencja}${w.pewnosc != null ? " " + w.pewnosc : ""}` : ""),
    odpowiedz: w.odpowiedz ? anonimizuj(w.odpowiedz) : null, ok: w.ok, powod: w.powod ? anonimizuj(w.powod) : null, ms: w.ms ?? null, samosprawdzenie: w.samosprawdzenie ?? null,
    ocena: w.ocena ?? null, komentarz: w.komentarz ? anonimizuj(w.komentarz) : null, tok: { we: w.tok_we || 0, wy: w.tok_wy || 0 }, siec: w.zapytania_sieci || 0, tryb: w.tryb, narzedzia: w.narzedzia || [] }));
}

export function klasyfikuj(w) {
  const z = [];
  if (w.ocena === -1) z.push("👎");
  if (w.narzedzia.includes("reakcja")) z.push("reakcja");
  if (w.samosprawdzenie === false) z.push("samosprawdzenie=false");
  if (w.tryb === "blad" || /v2-awaria/.test(w.powod || "")) z.push("awaria");
  if (w.ms != null && w.ms > 3000) z.push(`czas ${w.ms} ms`);
  return z;
}

/** propozycja wiersza do ławki — człowiek decyduje, co wkleić (nigdy automatycznie w kodzie) */
export function kandydatDoLawki(w) {
  const kat = /^(moj|moje|mam|ile)/.test(w.pytanie.toLowerCase()) ? "wlasne" : "poza";
  const oczekiwane = w.ocena === -1 && w.tryb === "siec" ? "router:?" : w.tryb === "v2-niepewne" ? "router:?" : w.sciezka.split(" ")[0];
  return `W('${w.pytanie.replace(/'/g, "\\'")}', '${kat}', 3, '${oczekiwane}', { luka: 'E?', uwaga: 'z życia ${dzis}: ${klasyfikuj(w).join(", ")}' })`;
}

/* SĘDZIA (tools/_sedzia.mjs): drugi model ocenia; wejście = pytanie + ścieżka + odpowiedź (zanonimizowane) + wzorzec, jeśli jest zatwierdzony; niczego nie zmienia.
   Do Claude: najpierw strażnik `czysty` (resztka danych = nie wysyłamy). Błąd Claude (np. koniec kredytów) = reszta nocy na Gemini, z uwagą w raporcie. */
async function sedzia(w) {
  const wzorzec = znajdzWzorzec(w.pytanie, WZORCE);
  if (dostawcaSedziego === "claude" && !czysty(trescDlaSedziego(w, null).replace(/\[OSOBA\]|\[e-mail\]|\[telefon\]/g, ""))) throw new Error("resztka danych: nie wysłano");
  let r;
  try { r = await ocenOdpowiedz({ dostawca: dostawcaSedziego, w, wzorzec, klucz: GEMINI }); }
  catch (e) {
    if (dostawcaSedziego !== "claude" || !GEMINI) throw e;
    uwagaSedziego = `Claude niedostępny (${String(e.message).replace(/[A-Za-z0-9_-]{30,}/g, "…").slice(0, 60)}): reszta nocy gemini`;
    dostawcaSedziego = "gemini";
    r = await ocenOdpowiedz({ dostawca: "gemini", w, wzorzec, klucz: GEMINI });
  }
  dodajUsd(r.usd);
  return { ...r.ocena, wzorzec: wzorzec ? wzorzec.id : null };
}
const opisWzorca = (s) => (s.wzorzec ? `, ze wzorcem ${s.zgodny_ze_wzorcem} (${s.wzorzec})` : "");

/* ŁAWKA: przebieg z tests/_lawka-v2.js (ta sama funkcja co CI); --zywy gdy klucz; porównanie z ostatnim raportem */
async function lawka() {
  const { przebieg, PYTANIA, probkaNocy } = require(path.join(KORZEN, "tests/_lawka-v2.js"));
  const reczne = PYTANIA.filter((r) => r.zrodlo !== "claude"), gen = probkaNocy(PYTANIA, dzis);
  const wsz = await przebieg([...reczne, ...gen], { zywy: !!GEMINI, rownolegle: 4 });
  if (wsz.stat) dodajKoszt({ we: wsz.length * 1000, wy: wsz.length * 60 }, "lite");   // szacunek klasyfikatora na żywo
  const w = wsz.slice(0, reczne.length), wg = wsz.slice(reczne.length);   // procent i alarm z ręcznych (porównywalne z historią); wygenerowane to osobna lista do pracy
  const dobre = w.filter((r) => r.pasuje).length, pct = 100 * dobre / w.length;
  return { pct, dobre, n: w.length, regresje: w.filter((r) => !r.pasuje && !r.luka).map((r) => `${r.p} → oczekiwane ${r.oczekiwane}, jest ${r.slad}`), luki: w.filter((r) => r.luka).length, stat: wsz.stat || null,
    gen: wg.length ? { n: wg.length, wszystkich: PYTANIA.length - reczne.length, dobre: wg.filter((r) => r.pasuje).length, nowe: wg.filter((r) => !r.pasuje && !r.luka).slice(0, 10).map((r) => `${anonimizuj(r.p)} → oczekiwane ${r.oczekiwane}, jest ${r.slad}`) } : null };
}
function poprzedniPct() {
  const dir = path.join(KORZEN, "docs/okienko-raport");
  if (!fs.existsSync(dir)) return null;
  const pliki = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f < dzis + ".md").sort();
  if (!pliki.length) return null;
  const m = fs.readFileSync(path.join(dir, pliki[pliki.length - 1]), "utf8").match(/Ławka: (\d+(?:\.\d+)?) %/);
  return m ? Number(m[1]) : null;
}
const p = (xs, q) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; };

const W = await wpisy().catch((e) => { console.error("logi:", e.message); return []; });
const zle = W.filter((w) => klasyfikuj(w).length);
const md = [`# Raport Okienka — ${dzis} (doba ${od.slice(0, 10)})`, "", `Wpisów: ${W.length} (v2: ${W.filter((w) => w.wersja === "v2").length}, v1: ${W.filter((w) => w.wersja === "v1").length}); do przejrzenia: ${zle.length}. Osoby = pseudonimy na ten raport; teksty zanonimizowane.`, ""];
let L = null;
if (OPCJE.lawka) {
  L = await lawka().catch((e) => ({ blad: e.message }));
  if (L.blad) md.push(`## Ławka`, "", `błąd: ${L.blad}`, "");
  else {
    const pop = poprzedniPct(), spadek = pop != null ? pop - L.pct : 0;
    md.push("## Ławka", "", `Ławka: ${L.pct.toFixed(1)} % (${L.dobre}/${L.n}), znane luki ${L.luki}${pop != null ? `, poprzednio ${pop.toFixed(1)} %` : ""}${L.stat ? `; klasyfikator na żywo: ok ${L.stat.ok}, awarie ${L.stat.awaria}` : " (atrapy)"}`, "");
    if (L.gen) md.push(`Wygenerowane (próbka ${L.gen.n} z ${L.gen.wszystkich}, zmienia się co noc, bez alarmu): dobra ${L.gen.dobre}/${L.gen.n}.`, ...(L.gen.nowe.length ? ["Do przejrzenia (bez znacznika luki):", ...L.gen.nowe.map((r) => `- ${r}`)] : []), "");
    if (L.regresje.length) md.push("**REGRESJE:**", ...L.regresje.map((r) => `- ${r}`), "");
    L.alarm = L.regresje.length > 0 || spadek >= 2;
    if (L.alarm) md.push(`⚠️ ALARM: ${L.regresje.length ? L.regresje.length + " regresji" : ""}${spadek >= 2 ? ` spadek ${spadek.toFixed(1)} pkt %` : ""}`, "");
  }
}
md.push("## Do poprawy (każdy wpis → poprawka z blizną + pytanie do ławki)", "");
if (!zle.length) md.push("Nic — doba bez 👎, reakcji, awarii, samosprawdzenia=false i czasów > 3 s.", "");
for (const w of zle) {
  md.push(`### ${klasyfikuj(w).join(" · ")} — ${w.wersja}, ${w.osoba}, ${w.kiedy.slice(11, 16)} UTC`, "", `- pytanie: ${w.pytanie}`, `- ścieżka: ${w.sciezka}${w.ms != null ? ` · ${w.ms} ms` : ""}${w.powod ? ` · powód: ${w.powod}` : ""}`, `- odpowiedź: ${w.odpowiedz || "(brak skrótu — v1 albo wpis bez zdań)"}`);
  if (w.komentarz) md.push(`- komentarz 👎: ${w.komentarz}`);
  if (OPCJE.sedzia && dostawcaSedziego && !koszt.przerwano && w.odpowiedz) {
    try { const s = await sedzia(w); md.push(`- sędzia: odpowiada ${s.odpowiada}, konkret ${s.konkret}, liczby z pokryciem ${s.liczby_z_pokryciem}, wyciek ${s.wyciek}, ton ${s.ton}${opisWzorca(s)} — ${anonimizuj(s.uzasadnienie)}`); }
    catch (e) { md.push(`- sędzia: błąd (${String(e.message).slice(0, 60)})`); }
  }
  md.push(`- kandydat do ławki: \`${kandydatDoLawki(w)}\``, "");
}
if (OPCJE.sedzia && dostawcaSedziego && !koszt.przerwano) {   // sędzia ocenia też próbkę dobrych (≤ 10) — żeby widzieć, czy „ok” naprawdę jest ok
  const dobre = W.filter((w) => !klasyfikuj(w).length && w.odpowiedz).slice(-10);
  if (dobre.length) { md.push("## Sędzia — próbka odpowiedzi bez sygnału (ostatnie 10)", ""); for (const w of dobre) { if (koszt.przerwano) break; try { const s = await sedzia(w); md.push(`- ${w.pytanie} → ${w.sciezka}: odpowiada ${s.odpowiada}, konkret ${s.konkret}, liczby ${s.liczby_z_pokryciem}, wyciek ${s.wyciek}, ton ${s.ton}${opisWzorca(s)} — ${anonimizuj(s.uzasadnienie)}`); } catch { /* pomijamy */ } } md.push(""); }
}
const czasy = W.filter((w) => w.ms != null).map((w) => w.ms), v2 = W.filter((w) => w.wersja === "v2"), kciuki = v2.filter((w) => w.ocena != null);
const kosztLog = W.reduce((a, w) => a + (w.tok.we * 0.30 + w.tok.wy * 2.50) / 1e6 + w.siec * 0.014, 0);
md.push("## Liczby doby", "", `- czas v2: p50 ${p(czasy, 0.5) ?? "—"} ms, p90 ${p(czasy, 0.9) ?? "—"} ms (cel p90 < 2000)`, `- kciuki: ${kciuki.length} ocen, 👎 ${kciuki.filter((w) => w.ocena === -1).length}`, `- koszt odpowiedzi doby: ${kosztLog.toFixed(3)} USD; koszt tego raportu (ławka na żywo + sędzia): ${koszt.usd.toFixed(3)} USD${koszt.przerwano ? ` — ⚠️ ${koszt.przerwano}` : ""}`,
  ...(OPCJE.sedzia ? [`- sędzia: ${dostawcaSedziego === "claude" ? MODEL_SEDZIEGO_CLAUDE : dostawcaSedziego || "brak klucza"}; wzorców zatwierdzonych: ${WZORCE.length}${uwagaSedziego ? `; ${uwagaSedziego}` : ""}`] : []), "");
if (OPCJE.tydzien) {
  const plik = path.join(KORZEN, "docs/okienko-postep.md");
  const wiersz = `| ${dzis} | ${L && !L.blad ? L.pct.toFixed(1) + " %" : "—"} | ${p(czasy, 0.5) ?? "—"} / ${p(czasy, 0.9) ?? "—"} ms | ${kciuki.length ? (100 * kciuki.filter((w) => w.ocena === -1).length / kciuki.length).toFixed(0) + " % z " + kciuki.length : "—"} | ${kosztLog.toFixed(3)} USD/dobę | ${zle.length} |`;
  fs.appendFileSync(plik, wiersz + "\n");
  md.push(`Wiersz tygodnia dopisany do docs/okienko-postep.md.`, "");
}
const tekst = md.join("\n");
if (!czysty(tekst.replace(/\[OSOBA\]|\[e-mail\]|\[telefon\]|osoba #\d+/g, ""))) { console.error("RAPORT NIEZAPISANY: strażnik anonimizacji znalazł dane osobowe"); process.exit(2); }
const dir = path.join(KORZEN, "docs/okienko-raport"); fs.mkdirSync(dir, { recursive: true });
const wyj = path.join(dir, dzis + ".md"); fs.writeFileSync(wyj, tekst + "\n");
console.log(tekst); console.log("\nzapisano:", path.relative(KORZEN, wyj));
if (L && L.alarm) { fs.writeFileSync(path.join(dir, ".alarm"), `Ławka ${L.pct.toFixed(1)} % — ${L.regresje.length} regresji; patrz docs/okienko-raport/${dzis}.md\n`); process.exitCode = 3; }
