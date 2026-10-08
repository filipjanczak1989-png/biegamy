#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// WERSJONOWANIE ZASOBÓW TREŚCIĄ — uruchamiane w deploy.yml na ARTEFAKCIE (/tmp/site), nigdy na repo.
//
// PO CO (08.10.2026, smoke Filipa po a3e546c, odtworzone w tools/smoke-offline.js SMOKE_SW=1 scenariusz G):
// nawigacja HTML idzie network-first (świeży zawodnik.html), a skrypty z własnego originu szły
// stale-while-revalidate z cache wersji, która KONTROLUJE stronę. Pierwsze wejście po deployu
// dostawało więc NOWY HTML ze STARYM sb.js / js/dzis-offline.js — nowy kod wołał funkcje, których
// stary JS nie miał (TypeError połykany przez try/catch loaderów). To klasa błędu, nie jeden plik.
//
// JAK: adres zasobu niesie hash jego treści (`sb.js?v=<sha256:10>`). Nowy HTML wskazuje NOWY adres,
// więc żaden cache (SW ani HTTP) nie może podać do niego starej treści — HTML i JS jednego deployu
// są parą z definicji. Plik niezmieniony między deployami ma ten sam hash → dalej z cache.
// To samo przepisanie dotyka wpisów PRECACHE_URLS / PRECACHE_KRYTYCZNE w sw.js, żeby precache
// trzymał dokładnie te adresy, których żąda HTML (offline: trafienie dokładne).
//
// DLACZEGO W ARTEFAKCIE, NIE W REPO: repo zostaje bez ?v= (diffy bez szumu, testy i smoke na
// czystych adresach), a artefakt Pages jest budowany w tym samym przebiegu co bump CACHE_VERSION —
// HTML, JS i sw.js jednego wdrożenia powstają razem.
// AWARIA NARZĘDZIA: krok w deploy.yml ma continue-on-error — artefakt zostaje bez ?v= (zachowanie
// sprzed 8.10), deploy i rollback działają. Narzędzie najpierw liczy WSZYSTKO w pamięci, potem
// zapisuje — błąd w trakcie liczenia nie zostawia połowicznie przepisanych plików.
//
// Użycie:  node tools/wersjonuj-zasoby.js <katalog-artefaktu> [--sprawdz]
//   --sprawdz: nic nie zapisuje, kod 1 gdy którekolwiek odwołanie nie ma aktualnego hasha.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROZSZERZENIA = /\.(js|css)$/i;

function hash(bufor) { return crypto.createHash('sha256').update(bufor).digest('hex').slice(0, 10); }

/* Odwołania src="…" / href="…" do plików .js/.css z WŁASNEGO originu, które istnieją w katalogu.
   Pomija adresy absolutne (http:, //), data:, szablony ${…} i kotwice. Zdejmuje istniejące ?v=. */
function odwolania(html) {
  const out = [];
  const re = /\b(src|href)=("|')([^"'<>]+?)\2/g;
  let m;
  while ((m = re.exec(html))) {
    const surowy = m[3];
    if (/^(?:[a-z]+:|\/\/|#|\$\{)/i.test(surowy) || surowy.includes('${')) continue;
    const bezQ = surowy.split('?')[0].split('#')[0];
    if (!ROZSZERZENIA.test(bezQ)) continue;
    out.push({ calosc: m[0], atrybut: m[1], cudzyslow: m[2], surowy, sciezka: bezQ.replace(/^\.?\//, '') });
  }
  return out;
}

function wersjonuj(katalog, opcje) {
  opcje = opcje || {};
  const kat = path.resolve(katalog);
  if (fs.existsSync(path.join(kat, '.git'))) throw new Error('to wygląda na repo (.git) — narzędzie działa tylko na artefakcie wdrożenia');
  const strony = fs.readdirSync(kat).filter((f) => /\.html$/i.test(f));
  if (!strony.length) throw new Error('brak stron .html w ' + kat);
  const hashe = new Map();
  const hashPliku = (rel) => {
    if (!hashe.has(rel)) {
      const p = path.join(kat, rel);
      hashe.set(rel, fs.existsSync(p) && fs.statSync(p).isFile() ? hash(fs.readFileSync(p)) : null);
    }
    return hashe.get(rel);
  };
  const zmiany = [];      // { plik, tresc }
  const nieaktualne = [];
  let liczbaOdwolan = 0;
  for (const s of strony) {
    const p = path.join(kat, s);
    const html = fs.readFileSync(p, 'utf8');
    let nowy = html;
    for (const o of odwolania(html)) {
      const h = hashPliku(o.sciezka);
      if (!h) continue;                                    // nie nasz plik (np. ścieżka z innego katalogu)
      liczbaOdwolan++;
      const cel = o.surowy.split('?')[0] + '?v=' + h;
      if (o.surowy !== cel) nieaktualne.push(s + ': ' + o.surowy);
      nowy = nowy.split(o.calosc).join(o.atrybut + '=' + o.cudzyslow + cel + o.cudzyslow);
    }
    if (nowy !== html) zmiany.push({ plik: p, tresc: nowy });
  }
  // sw.js: '/sciezka' (opcjonalnie z ?v=…) w literałach → '/sciezka?v=hash' dla każdego zwersjonowanego pliku
  const swP = path.join(kat, 'sw.js');
  let swWpisow = 0;
  if (fs.existsSync(swP)) {
    const sw = fs.readFileSync(swP, 'utf8');
    let nowy = sw;
    for (const [rel, h] of hashe) {
      if (!h) continue;
      const re = new RegExp("'/" + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:\\?v=[0-9a-f]+)?'", 'g');
      nowy = nowy.replace(re, () => { swWpisow++; return "'/" + rel + '?v=' + h + "'"; });
    }
    if (nowy !== sw) zmiany.push({ plik: swP, tresc: nowy });
  }
  // kontrola PRZED zapisem: HTML z ?v= bez precache z ?v= = offline bez trafień dokładnych
  if (!opcje.sprawdz && fs.existsSync(swP) && swWpisow === 0) throw new Error('w sw.js nie przepisano żadnego wpisu precache — przerwane bez zapisu');
  if (!opcje.sprawdz) for (const z of zmiany) fs.writeFileSync(z.plik, z.tresc);
  return { strony: strony.length, odwolan: liczbaOdwolan, plikow: [...hashe.values()].filter(Boolean).length, swWpisow,
           zapisanych: opcje.sprawdz ? 0 : zmiany.length, nieaktualne, hashe: Object.fromEntries(hashe) };
}

module.exports = { wersjonuj, odwolania, hash };

if (require.main === module) {
  const kat = process.argv[2];
  const sprawdz = process.argv.includes('--sprawdz');
  if (!kat) { console.error('Użycie: node tools/wersjonuj-zasoby.js <katalog-artefaktu> [--sprawdz]'); process.exit(2); }
  try {
    const w = wersjonuj(kat, { sprawdz });
    console.log('wersjonuj-zasoby: ' + w.strony + ' stron, ' + w.odwolan + ' odwołań do ' + w.plikow + ' plików, sw.js wpisów ' + w.swWpisow + ', zapisanych plików ' + w.zapisanych);
    for (const [rel, h] of Object.entries(w.hashe)) if (h) console.log('  ' + rel + '?v=' + h);
    if (sprawdz && w.nieaktualne.length) { console.error('Nieaktualne odwołania:\n  ' + w.nieaktualne.join('\n  ')); process.exit(1); }
  } catch (e) { console.error('wersjonuj-zasoby BŁĄD: ' + e.message); process.exit(1); }
}
