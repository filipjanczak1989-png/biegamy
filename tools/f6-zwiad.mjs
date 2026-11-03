// ZWIAD W MASZYNIE WYNIKÓW (F6, api.biegamy.run) — Filip 3.11 (wyniki pkt 3 i 5): maszyna nie wpuszcza bez zalogowanej sesji, więc narzędzie
// uruchamia Filip własnym kontem (hasło tylko z env, jak tools/okienko-ab.mjs):
//   OKIENKO_EMAIL=… OKIENKO_HASLO=… node tools/f6-zwiad.mjs --osoby "Damian Bolewski;Mateusz Janczak" [--biegi "Maraton Poznań;Bieg Lwa"] [--wyjscie <katalog>]
// Robi WYŁĄCZNIE odczyt w naszej maszynie (search_runners, runner_results, erasure_preview → źródło każdego wyniku, events_search) —
// NIE szuka nazwisk w zewnętrznych bazach (decyzja Filipa: prywatność). Wynik: JSON + MD do Downloads\biegamy-podglady (poza repo — dane osób).
// JSON zawodnika (runner_results) służy też jako dane do zrzutu karty „jak manager” (tools/zrzut-karty-zawodnika.mjs, następny krok).
import fs from "node:fs";
import path from "node:path";

const PROD = { url: "https://afqojgkaveykxbltxzwm.supabase.co", key: "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY" };   // publiczne (== sb.js)
const F6 = "https://api.biegamy.run";
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const osoby = String(arg("--osoby", "Damian Bolewski;Mateusz Janczak")).split(";").map((x) => x.trim()).filter(Boolean);
const biegi = String(arg("--biegi", "")).split(";").map((x) => x.trim()).filter(Boolean);
const wyjscie = arg("--wyjscie", path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "biegamy-podglady"));
const dzis = new Date().toISOString().slice(0, 10);

async function token() {
  if (process.env.OKIENKO_JWT) return process.env.OKIENKO_JWT;
  const email = process.env.OKIENKO_EMAIL, haslo = process.env.OKIENKO_HASLO;
  if (!email || !haslo) throw new Error("ustaw OKIENKO_EMAIL i OKIENKO_HASLO (albo OKIENKO_JWT) w env");
  const r = await fetch(`${PROD.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PROD.key, "content-type": "application/json" }, body: JSON.stringify({ email, password: haslo }) });
  if (!r.ok) throw new Error("logowanie: http " + r.status);
  return (await r.json()).access_token;
}
async function rpc(tok, nazwa, args) {
  const r = await fetch(`${F6}/rpc/${nazwa}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(args) });
  if (!r.ok) return { blad: `${nazwa}: http ${r.status}` };
  return r.json();
}
const czas = (s) => { s = Math.round(Number(s) || 0); if (!s) return "—"; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

const tok = await token();
const wynik = { dzis, osoby: [], biegi: [] };
const md = [`# Zwiad w maszynie wyników — ${dzis}`, "", "Tylko odczyt naszej maszyny (bez zewnętrznych baz). Dane publicznych wyników zawodów.", ""];
for (const q of osoby) {
  const kand = await rpc(tok, "search_runners", { q });
  const lista = Array.isArray(kand) ? kand.slice(0, 5) : [];
  md.push(`## ${q} — kandydatów: ${Array.isArray(kand) ? kand.length : "błąd " + (kand.blad || "")}`, "");
  const o = { q, kandydaci: [] };
  for (const k of lista) {
    const w = await rpc(tok, "runner_results", { p_runner_key: k.runner_key });
    const e = await rpc(tok, "erasure_preview", { p_runner_key: k.runner_key });
    const wyniki = Array.isArray(w) ? w : [];
    const zrodla = {}; for (const x of Array.isArray(e) ? e : []) zrodla[x.source || "?"] = (zrodla[x.source || "?"] || 0) + 1;
    const lata = wyniki.map((x) => String(x.event_date || "").slice(0, 4)).filter(Boolean).sort();
    o.kandydaci.push({ ...k, wyniki, zrodla });
    md.push(`### ${k.display_name} (${k.yob ?? "rocznik ?"}) — klucz \`${k.runner_key}\`, wyników ${wyniki.length}${lata.length ? `, lata ${lata[0]}–${lata[lata.length - 1]}` : ""}`,
      `Źródła (firmy pomiaru / strony wyników): ${Object.entries(zrodla).map(([s, n]) => `${s} ${n}`).join(", ") || "—"}`, "",
      "| data | bieg | miasto | km | czas | open | kat. |", "|---|---|---|---|---|---|---|",
      ...wyniki.slice(0, 40).map((x) => `| ${x.event_date || ""} | ${x.event_name || ""} | ${x.event_city || ""} | ${x.distance_km ?? ""} | ${czas(x.time_seconds)} | ${x.position_total ?? ""} | ${x.position_category ?? ""}${x.category ? " " + x.category : ""} |`), "");
  }
  wynik.osoby.push(o);
}
if (biegi.length) {
  md.push("## Biegi do sprawdzenia: czy maszyna je zna (kalendarz) i czy ma wyniki", "", "| bieg | w kalendarzu maszyny | trafienia |", "|---|---|---|");
  for (const b of biegi) {
    const r = await rpc(tok, "events_search", { p_q: b, p_limit: 5 });
    const t = Array.isArray(r) ? r : [];
    wynik.biegi.push({ q: b, trafienia: t });
    md.push(`| ${b} | ${t.length ? "tak" : "nie"} | ${t.map((x) => `${x.nazwa} (${x.data || "?"}, ${x.miejscowosc || "?"})`).join("; ") || "—"} |`);
  }
  md.push("", "Uwaga: „w kalendarzu” ≠ „są wyniki” — wyniki osoby z danego biegu widać w tabeli zawodnika wyżej (źródło przy każdym wierszu w erasure_preview).");
}
fs.mkdirSync(wyjscie, { recursive: true });
const pj = path.join(wyjscie, `f6-zwiad-${dzis}.json`), pm = path.join(wyjscie, `f6-zwiad-${dzis}.md`);
fs.writeFileSync(pj, JSON.stringify(wynik, null, 1)); fs.writeFileSync(pm, md.join("\n") + "\n");
console.log(md.slice(0, 60).join("\n")); console.log(`\nzapisano: ${pm}\n          ${pj}`);
