// CZUJKA intervals ↔ Garmin (Filip 3.11, plan B pkt 3): co noc sprawdza wątek forum intervals „API access to Intervals.icu” (Discourse JSON,
// t/609) — nowy post AUTORA WĄTKU (david) ze słowem „Garmin” od ostatniego sprawdzenia → plik alarmu (workflow robi issue z cytatem i linkiem).
// Raz w tygodniu (poniedziałek, albo --szukaj) dodatkowo wyszukanie „intervals.icu Garmin API” (DuckDuckGo HTML, best-effort) → lista tytułów
// w alarmie informacyjnie. Stan: docs/czujka-intervals.json (ostatni_post) — commitowany razem z raportem nocy. Zero sekretów, zero zapisu
// poza tym plikiem. Kod wyjścia 4 = nowy post Davida o Garminie.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KORZEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WATEK = "https://forum.intervals.icu/t/609";
const PLIK_STANU = path.join(KORZEN, "docs/czujka-intervals.json");
const PLIK_ALARMU = path.join(KORZEN, "docs/okienko-raport/.czujka-alarm");
const tekst = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** czysta: z listy postów i stanu → nowe posty autora wątku o Garminie */
export function noweOGarminie(posty, autor, ostatniPost) {
  return (Array.isArray(posty) ? posty : []).filter((p) => p && p.username === autor && Number(p.post_number) > Number(ostatniPost || 0) && /garmin/i.test(p.cooked || ""))
    .map((p) => ({ post_number: p.post_number, created_at: p.created_at, url: `${WATEK}/${p.post_number}`, cytat: tekst(p.cooked).slice(0, 400) }));
}

export async function sprawdzForum(fetchFn = fetch) {
  const t = await (await fetchFn(WATEK + ".json", { headers: { Accept: "application/json" } })).json();
  const autor = (t.details && t.details.created_by && t.details.created_by.username) || "david";
  const n = Number(t.posts_count || 0);
  const okno = await (await fetchFn(`${WATEK}/${Math.max(1, n)}.json`, { headers: { Accept: "application/json" } })).json();   // ~20 postów wokół ostatniego
  const posty = (okno.post_stream && okno.post_stream.posts) || [];
  return { autor, posts_count: n, posty, max_post: Math.max(0, ...posty.map((p) => Number(p.post_number) || 0)) };
}

/** best-effort: tytuły z DuckDuckGo HTML (bez klucza); pusto przy błędzie */
export async function szukajWSieci(fetchFn = fetch, zapytanie = "intervals.icu Garmin API") {
  try {
    const r = await fetchFn("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(zapytanie), { headers: { "User-Agent": "Mozilla/5.0 (BiegaMy czujka)" } });
    const html = await r.text();
    return [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, 8).map((m) => ({ url: m[1], tytul: tekst(m[2]).slice(0, 120) }));
  } catch { return []; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stan = { ostatni_post: 0, sprawdzono: null };
  try { stan = JSON.parse(fs.readFileSync(PLIK_STANU, "utf8")); } catch { /* pierwszy raz */ }
  const f = await sprawdzForum();
  const nowe = noweOGarminie(f.posty, f.autor, stan.ostatni_post);
  const szukaj = process.argv.includes("--szukaj") || new Date().getUTCDay() === 1;
  const wyniki = szukaj ? await szukajWSieci() : [];
  const linie = [];
  if (nowe.length) { linie.push(`NOWE POSTY ${f.autor} O GARMINIE (${WATEK}):`); for (const p of nowe) linie.push(`- #${p.post_number} ${p.created_at.slice(0, 10)}: „${p.cytat}” — ${p.url}`); }
  if (wyniki.length) { linie.push("", "Wyszukiwanie „intervals.icu Garmin API” (tydzień):"); for (const w of wyniki) linie.push(`- ${w.tytul} — ${w.url}`); }
  fs.mkdirSync(path.dirname(PLIK_ALARMU), { recursive: true });
  if (nowe.length) fs.writeFileSync(PLIK_ALARMU, linie.join("\n") + "\n"); else { try { fs.unlinkSync(PLIK_ALARMU); } catch { /* nie było */ } }
  fs.writeFileSync(PLIK_STANU, JSON.stringify({ ostatni_post: Math.max(stan.ostatni_post || 0, f.max_post), sprawdzono: new Date().toISOString().slice(0, 10), posts_count: f.posts_count, autor: f.autor }, null, 1) + "\n");
  console.log(`czujka: wątek ${f.posts_count} postów, ostatni widziany ${stan.ostatni_post} → ${Math.max(stan.ostatni_post || 0, f.max_post)}; nowe o Garminie: ${nowe.length}${szukaj ? `; wyszukiwanie: ${wyniki.length} wyników` : ""}`);
  if (linie.length) console.log(linie.join("\n"));
  process.exitCode = nowe.length ? 4 : 0;
}
