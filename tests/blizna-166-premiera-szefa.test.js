/* BLIZNA 166 / PREMIERA SZEFA (Filip 5.11): po guziku „Zagraj jako Szef”: gra od razu koparką, tylko na tym urządzeniu, raz, bez konta i rankingu.
   - cegły trafiają do muru jako pierwsze cegły tylko na prawdziwej akcji i tylko przy zgodzie; na próbie bez zapisu;
   - zapisuje osobna funkcja, do tabeli gry: gra dalej nie pisze do akcji (blizna-154);
   - przycisk powstaje po starcie, rysunku ani adresu nie ma w stronie guzika ani w znaczniku (blizna-96, blizna-155).
   Po skutku: tools/gra-poziomy-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261106_gra_poziomy.sql';
const WYC = 'supabase/migrations/20261106_WYCOFANIE_gra_poziomy.sql';
const jest = (p) => fs.existsSync(path.join(__dirname, '..', p));

test('strona guzika: znacznik przy naciśnięciu, przycisk po starcie, adres z serwera, reset czyści', () => {
  const h = czytaj('start-akcji.html'), s = h.slice(h.indexOf('<script>\n(function'));
  assert.match(s, /await zapiszLokalnie\(t\);\n\s+zapiszZnacznikPremiery\(\);/, 'znacznik tylko przy naciśnięciu na tym urządzeniu');
  assert.match(s, /JSON\.stringify\(\{ slug: SLUG, sciezka: SCIEZKA \}\)/, 'w znaczniku nie ma adresu rysunku');
  assert.match(s, /if \(!d \|\| !d\.wystartowala \|\| !z \|\| z\.slug !== SLUG \|\| z\.zagrana\)/, 'tylko po starcie, tylko swój znacznik, raz');
  assert.match(s, /if \(typeof ark !== 'string' \|\| !ADRES_RYSUNKU\.test\(ark\)\) return;/, 'bez zgody licznik nie ma adresu, więc nie ma przycisku');
  assert.match(s, /przyciskDotarcia\(d\); przyciskPremiery\(d\);/);
  assert.equal((s.match(/wyczyscLokalnie\(\); wyczyscPremiere\(\);/g) || []).length, 2, 'reset i „od zera” zwracają premierę na próbie');
  assert.doesNotMatch(h.slice(0, h.indexOf('<script>\n(function')), /zagraj-szef"/, 'w statycznym HTML nie ma przycisku');
});

test('gra: tylko ze znacznikiem, bez konta, rankingu, plansz i rekordu; próba nie zapisuje', () => {
  const k = czytaj('js/cegielki-konto.js'), s = czytaj('js/cegielki.js'), h = czytaj('gra-cegielki.html');
  assert.match(k, /if \(parametry\.get\("premiera"\) !== "1"\) return null;/);
  assert.match(k, /return z && \(z\.slug === "dla-fabianka" \|\| z\.slug === "proba"\) \? z : null;/, 'bez znacznika zwykła gra');
  assert.match(k, /if \(stan\.podglad \|\| premiera\) \{ stan\.ulepszenie = null; return; \}/, 'bez gra_start_rundy');
  assert.match(k, /async function poRundzie\(w\) \{\n\s+if \(premiera\) \{ koniecPremiery\(w\); return; \}/, 'bez gra_zapisz_wynik i bez sumy na urządzeniu');
  assert.match(k, /function poziomGracza\(\) \{ return premiera \? 1 : L\.poziom\(stan\.cegly\); \}/, 'poziom 1, ×1');
  assert.match(k, /&& !premiera\) document\.body\.classList\.add\("gra-zamknieta"\)/, 'guzik działa, zanim gra jest publiczna');
  assert.match(k, /if \(premiera\.zagrana\) \{ pokazKoniecPremiery\(\); return; \}/, 'raz: po rundzie ekran końcowy, nie druga runda');
  assert.match(k, /premiera\.zapisane = premieraNaProbie\(\);/);
  assert.match(k, /if \(premieraNaProbie\(\)\) \{ \$\("pr-info"\)\.textContent = "Próba: te cegły nie trafiają do muru\."; return; \}/, 'na próbie bez zapisu');
  assert.match(k, /rpc\("premiera_szefa_zapisz", \{ p_cegly: premiera\.cegly, p_czas: premiera\.czas \}\)/);
  assert.equal((k.match(/premiera_szefa_zapisz/g) || []).length, 2, 'zapis w jednym miejscu (plus opis)');
  assert.match(k, /akcja-proba-wizerunek/, 'na próbie arkusz z funkcji próby: trener i konto testowe');
  assert.match(k, /d\.pierwsze_cegly != null\) k\.appendChild\(el\("div", "mur-pierwsze", "Pierwsze cegły: Szef"\)\)/);
  assert.match(s, /K\.planszeDoPokazania \|\| K\.premiera\(\)\) return Promise\.resolve\(\)/);
  assert.match(s, /\|\| !K \|\| K\.premiera\(\)\) return rusz\(\);/);
  assert.match(s, /if \(nowy && !\(window\.BM_CEGIELKI_KONTO && window\.BM_CEGIELKI_KONTO\.premiera\(\)\)\) schowek\.zapisz\("cegielki_rekord"/);
  assert.match(h, /body\.w-premierze #menu, body\.w-premierze #koniec/);
  assert.match(czytaj('js/ulica-scena.mjs'), /d\.pierwsze_cegly != null\) el\("span", "", m, "Pierwsze cegły: Szef"\)/);
});

test('baza: osobna funkcja poza gra_, tylko startujący, po starcie, przy zgodzie, raz, z limitem; mur w cegłach', { skip: !jest(MIG) && 'migracja poza commitem' }, () => {
  const m = czytaj(MIG);
  assert.match(m, /create function public\.premiera_szefa_zapisz\(p_cegly integer, p_czas numeric\)/);
  assert.match(m, /public\.akcja_startujacy s where s\.akcja_id = a\.id and s\.athlete_id = v_ja/);
  assert.match(m, /a\.wystartowala_at is null then return jsonb_build_object\('ok', false, 'powod', 'przed_startem'\)/);
  assert.match(m, /if not a\.wizerunek_zgoda then return/);
  assert.match(m, /p_cegly > 45 \* p_czas/);
  assert.match(m, /on conflict \(slug\) do nothing;/);
  assert.match(m, /check \(slug = 'dla-fabianka'\)/, 'próba nie ma tu wiersza');
  assert.match(m, /'pierwsze_cegly', \(select p\.cegly from public\.gra_pierwsze_cegly p/);
  assert.match(m, /as \$\$ select \(select coalesce\(sum\(w\.cegly\), 0\) from public\.gra_wyniki w\)::bigint \+ coalesce\(\(select p\.cegly from public\.gra_pierwsze_cegly p/);
  assert.doesNotMatch(m, /insert into public\.akcje|update public\.akcje/i, 'gra nie zmienia akcji');
  const w = czytaj(WYC);
  assert.match(w, /premiera_szefa_zapisz/); assert.match(w, /gra_pierwsze_cegly/);
});
