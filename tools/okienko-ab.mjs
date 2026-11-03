// TEST A/B OKIENKA (Filip 3.11 15:25 pkt 5): te same pytania przez okienko (v1) i okienko-v2, obok siebie, plik HTML do
// Downloads\biegamy-podglady — Filip wybiera lepszą odpowiedź przy każdym, HTML liczy wynik i wycieki. v2 dla wszystkich dopiero,
// gdy wygrywa ≥ 80 % i 0 wycieków. Uruchamia go FILIP z własną sesją (pytania z jego logu wymagają jego danych):
//   OKIENKO_EMAIL=... OKIENKO_HASLO=... node tools/okienko-ab.mjs [--wersja v1|v2|obie] [--wyjscie <katalog>] [--pytania <plik.json>]
// albo OKIENKO_JWT=<access_token> zamiast e-maila i hasła. Hasło tylko z env (nigdy argument — historia powłoki). Nic nie zapisuje w bazie
// poza zwykłym logiem okienka (EF). ⚠️ limit sieci 20/dobę na wersję — przy 30 pytaniach część może dostać „limit”; wtedy uruchom
// drugi raz nazajutrz z --wersja v2 (plik JSON scala wyniki, puste pola uzupełnia).
import fs from "node:fs";
import path from "node:path";
import { wygladaNaOsobe, wygladaNaNazwisko } from "../supabase/functions/okienko/pamiec.mjs";

const PROD = { url: "https://afqojgkaveykxbltxzwm.supabase.co", key: "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY" };   // literały publiczne (== sb.js)
const EF = { v1: "okienko", v2: "okienko-v2" };
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const wersja = arg("--wersja", "obie"), wersje = wersja === "obie" ? ["v1", "v2"] : [wersja];
const wyjscie = arg("--wyjscie", path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "biegamy-podglady"));
const plikPytan = arg("--pytania", new URL("./okienko-ab-pytania.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const dzis = new Date().toISOString().slice(0, 10);
const PUBLICZNI = /Korzeniowski|Lewandowski|Kipchoge|Kasia na 100km/i;

async function jwt() {
  if (process.env.OKIENKO_JWT) return process.env.OKIENKO_JWT;
  const email = process.env.OKIENKO_EMAIL, haslo = process.env.OKIENKO_HASLO;
  if (!email || !haslo) throw new Error("ustaw OKIENKO_EMAIL i OKIENKO_HASLO (albo OKIENKO_JWT) w env");
  const r = await fetch(`${PROD.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PROD.key, "content-type": "application/json" }, body: JSON.stringify({ email, password: haslo }) });
  if (!r.ok) throw new Error("logowanie: http " + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error("logowanie: brak tokena");
  return j.access_token;
}
async function zapytaj(token, w, tekst) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${PROD.url}/functions/v1/${EF[w]}`, { method: "POST", headers: { Authorization: "Bearer " + token, apikey: PROD.key, "content-type": "application/json" }, body: JSON.stringify({ tekst }) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ms: Date.now() - t0, tryb: j.tryb || (j.limit ? "limit:" + j.limit : j.blad ? "blad:" + j.blad : "?"), zdania: j.zdania || [], zrodla: j.zrodla || [], karty: (j.karty || []).length, chipy: (j.chipy || []).map((c) => c.etykieta), akcja: j.akcja || null, intencja: j.intencja || null, wersja: j.wersja || r.headers.get("X-Okienko-Wersja") || null };
  } catch (e) { return { status: 0, ms: Date.now() - t0, tryb: "blad:siec", zdania: [], zrodla: [], karty: 0, chipy: [], blad: String(e.message) }; }
}
/* wyciek = pytanie o osobę prywatną, a odpowiedź poszła do sieci (źródła) — dokładnie to, czego B2 zabrania */
const wyciek = (p, o) => !!o && (o.tryb === "siec" || (o.zrodla || []).length > 0) && !PUBLICZNI.test(p.p) && (p.prywatne === true || wygladaNaOsobe(p.p) || wygladaNaNazwisko(p.p));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function html(wyniki) {
  const wiersz = (r, i) => {
    const kol = (w) => { const o = r[w]; if (!o) return '<td class="brak">— (nie pytano)</td>';
      return `<td class="${wyciek(r, o) ? "wyciek" : ""}"><div class="tryb">${esc(o.tryb)}${o.intencja ? " · " + esc(o.intencja) : ""} · ${o.ms} ms${o.karty ? " · kart " + o.karty : ""}${o.chipy.length ? " · chipy: " + esc(o.chipy.join(", ")) : ""}</div>`
        + (o.zdania.length ? o.zdania.map((z) => `<p>${esc(z)}</p>`).join("") : '<p class="pusto">(brak zdań)</p>')
        + (o.akcja && o.akcja.nawiguj ? `<p class="akcja">→ ${esc(o.akcja.nawiguj)}</p>` : "")
        + (o.zrodla.length ? `<ul class="zr">${o.zrodla.map((z) => `<li><a href="${esc(z.url)}" target="_blank" rel="noopener noreferrer">${esc(z.tytul)}</a></li>`).join("")}</ul>` : "")
        + (wyciek(r, o) ? '<div class="wy">⚠ WYCIEK: pytanie o osobę prywatną poszło do sieci</div>' : "") + "</td>"; };
    return `<tr data-i="${i}"><td class="nr">${i + 1}<div class="zr-p">${esc(r.zrodlo)}</div></td><td class="p">${esc(r.p)}</td>${kol("v1")}${kol("v2")}<td class="wyb">`
      + ["v1", "v2", "remis"].map((v) => `<label><input type="radio" name="w${i}" value="${v}"> ${v}</label>`).join("<br>") + "</td></tr>";
  };
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Okienko A/B ${dzis}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:system-ui,sans-serif;font-size:13px;margin:16px;background:#0f1115;color:#e6e6e6}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;vertical-align:top}
th{background:#1b1f27;position:sticky;top:0}td.nr{width:36px;color:#888}td.p{width:200px;font-weight:600}td.wyb{width:70px;white-space:nowrap}.tryb{font-size:11px;color:#8fa;margin-bottom:4px;font-family:monospace}
.pusto{color:#888;font-style:italic}.akcja{color:#7cf2b0;font-size:12px}.zr{margin:4px 0 0 16px;padding:0;font-size:11px}.zr a{color:#9cf}.brak{color:#666;font-style:italic}.wyciek{outline:2px solid #e55;outline-offset:-2px}
.wy{color:#e55;font-weight:700;margin-top:6px}.zr-p{font-size:10px;color:#666}#pods{position:sticky;bottom:0;background:#1b1f27;padding:10px;border-top:1px solid #333;margin-top:12px}
button{background:#7cf2b0;color:#0f1115;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer}textarea{width:100%;height:120px;margin-top:8px;background:#0f1115;color:#e6e6e6;border:1px solid #333}
tr.v1 td.p{border-left:4px solid #fc6}tr.v2 td.p{border-left:4px solid #7cf2b0}tr.remis td.p{border-left:4px solid #999}</style></head><body>
<h1>Okienko A/B — ${dzis} · ${wyniki.length} pytań</h1><p>Przy każdym pytaniu zaznacz lepszą odpowiedź. Wybory zapisują się w tej przeglądarce. „Podsumowanie” liczy wynik v2 i wycieki; v2 dla wszystkich dopiero przy ≥ 80 % i 0 wycieków.</p>
<table><thead><tr><th>#</th><th>pytanie</th><th>v1 (okienko)</th><th>v2 (okienko-v2)</th><th>lepsza</th></tr></thead><tbody>${wyniki.map(wiersz).join("")}</tbody></table>
<div id="pods"><button onclick="podsumuj()">Podsumowanie</button> <button onclick="kopiuj()">Kopiuj</button> <span id="wynik"></span><textarea id="txt" readonly></textarea></div>
<script>
const K='okienko-ab-${dzis}', N=${wyniki.length}, WYCIEKI=${JSON.stringify(wyniki.map((r) => ({ v1: wyciek(r, r.v1), v2: wyciek(r, r.v2) })))};
let W={}; try{W=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
document.querySelectorAll('input[type=radio]').forEach(function(i){ const n=i.name.slice(1); if(W[n]===i.value){i.checked=true; i.closest('tr').className=i.value;} i.addEventListener('change',function(){ W[n]=i.value; i.closest('tr').className=i.value; try{localStorage.setItem(K,JSON.stringify(W))}catch(e){} }); });
function podsumuj(){ let v1=0,v2=0,r=0,bez=0; for(let i=0;i<N;i++){ const w=W[i]; if(w==='v1')v1++; else if(w==='v2')v2++; else if(w==='remis')r++; else bez++; }
  const ocen=v1+v2+r, pct=ocen?Math.round(100*(v2+r/2)/ocen):0, wy=WYCIEKI.filter(function(x){return x.v2}).length, wy1=WYCIEKI.filter(function(x){return x.v1}).length;
  const t='Okienko A/B '+'${dzis}'+': v2 lepsze '+v2+', v1 lepsze '+v1+', remis '+r+', bez oceny '+bez+' → v2 '+pct+' % (cel ≥ 80 %); wycieki v2: '+wy+' (cel 0), v1: '+wy1+'\\n'
    + Array.from(document.querySelectorAll('tbody tr')).map(function(tr,i){ return (i+1)+'. '+tr.querySelector('td.p').textContent+' → '+(W[i]||'-'); }).join('\\n');
  document.getElementById('txt').value=t; document.getElementById('wynik').textContent='v2: '+pct+' % · wycieki v2: '+wy; return t; }
function kopiuj(){ const t=podsumuj(); if(navigator.clipboard) navigator.clipboard.writeText(t); }
</script></body></html>`;
}

const pytania = JSON.parse(fs.readFileSync(plikPytan, "utf8"));
fs.mkdirSync(wyjscie, { recursive: true });
const plikJson = path.join(wyjscie, `okienko-ab-${dzis}.json`), plikHtml = path.join(wyjscie, `okienko-ab-${dzis}.html`);
let wyniki = pytania.map((p) => ({ ...p, v1: null, v2: null }));
try { const stare = JSON.parse(fs.readFileSync(plikJson, "utf8")); wyniki = wyniki.map((r) => { const s = stare.find((x) => x.p === r.p); return s ? { ...r, v1: s.v1, v2: s.v2 } : r; }); } catch { /* pierwszy przebieg */ }
const token = await jwt();
for (const r of wyniki) {
  for (const w of wersje) {
    if (r[w] && !/^(limit|blad)/.test(r[w].tryb)) continue;   // scalanie: pytamy tylko o brakujące / nieudane
    r[w] = await zapytaj(token, w, r.p);
    process.stdout.write(`${w} | ${r[w].tryb.padEnd(14)} | ${r[w].ms} ms | ${r.p}\n`);
    await new Promise((res) => setTimeout(res, 1200));
  }
  fs.writeFileSync(plikJson, JSON.stringify(wyniki, null, 1));
}
fs.writeFileSync(plikHtml, html(wyniki));
const wy = wyniki.filter((r) => wyciek(r, r.v2)).length;
console.log(`\nzapisano: ${plikHtml}\nwycieki v2: ${wy}; limity: ${wyniki.filter((r) => wersje.some((w) => r[w] && /^limit/.test(r[w].tryb))).length} (powtórz jutro z --wersja v2/v1 — scali)`);
