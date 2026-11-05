/* BLIZNA 183 / POSTĘP RUND NA PRÓBIE (Filip 6.11).
   - rundy w podglądzie liczą cegły, poziom, awanse, plansze i dziennik tylko na urządzeniu, bez zapisu do bazy i rankingu;
   - klucze osobne, więc prawdziwy stan gracza na tym samym telefonie zostaje nietknięty;
   - „Od zera” czyści postęp: na tym urządzeniu od razu, na innym przez porównanie chwili startu próby;
   - po rundzie pasek do następnego poziomu i „Graj dalej”, u wszystkich, bo próba ma wyglądać jak sobota. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const K = czytaj('js/cegielki-konto.js'), G = czytaj('js/cegielki.js'), H = czytaj('gra-cegielki.html'), S = czytaj('start-akcji.html');

function kluczProbyZKodu(stan) {
  const wz = K.match(/KLUCZE_PROBY = (\/.+?\/), TEKST_PROBY/)[1], fn = K.match(/function kluczProby\(k\) \{ (return .+?;) \}/)[1];
  return new Function('stan', 'PREFIKS_PROBY', 'KLUCZE_PROBY', 'k', fn).bind(null, stan, 'cegielki_proba_', eval(wz));
}

test('klucze: na próbie osobne, poza próbą bez zmian, ustawienia urządzenia wspólne', () => {
  const na = kluczProbyZKodu({ podglad: true }), poza = kluczProbyZKodu({ podglad: false });
  for (const [a, b] of [['cegielki_suma', 'cegielki_proba_suma'], ['cegielki_plansze', 'cegielki_proba_plansze'], ['cegielki_kartka1', 'cegielki_proba_kartka1'], ['cegielki_kupione', 'cegielki_proba_kupione'], ['cegielki_stroje', 'cegielki_proba_stroje'], ['cegielki_rekord', 'cegielki_proba_rekord'], ['cegielki_odznaki', 'cegielki_proba_odznaki'], ['cegielki_wyzwanie_2026-11-07', 'cegielki_proba_wyzwanie_2026-11-07']]) {
    assert.equal(na(a), b); assert.equal(poza(a), a, 'prawdziwa gra na swoich kluczach');
  }
  for (const k of ['cegielki_podglad', 'cegielki_dzwiek', 'cegielki_imie', 'cegielki_premiera', 'cegielki_postac']) assert.equal(na(k), k, 'ustawienie, nie postęp: ' + k);
  assert.equal(kluczProbyZKodu(undefined)('cegielki_suma'), 'cegielki_suma', 'przed wstaniem stanu nie rzuca');
});

test('runda na próbie: suma lokalnie, nagrody, awans i dziennik; bez rundy na serwerze i bez wyniku', () => {
  const po = K.slice(K.indexOf('async function poRundzie'), K.indexOf('async function pobierzRanking'));
  const blok = po.slice(po.indexOf('if (stan.podglad) {'), po.indexOf('/* Bez konta suma'));
  assert.ok(blok, 'gałąź próby przed zapisem na serwer');
  assert.match(blok, /stan\.cegly \+= w\.cegly; zapiszJson\("cegielki_suma", stan\.cegly\); nagrodyNaUrzadzeniu\(\); rysujPostacie\(przedProba\);/);
  assert.match(blok, /return;\n\s*\}$/m, 'bez dalszej drogi do gra_zapisz_wynik');
  assert.doesNotMatch(blok, /gra_zapisz_wynik|gra_start_rundy/);
  assert.ok(po.indexOf('if (w.maly)') < po.indexOf('if (stan.podglad) {'), 'Mały budowniczy dalej bez postępu');
  assert.match(K, /if \(stan\.podglad \|\| premiera\) return;\n\s*var runda = /, 'przed rundą bez gra_start_rundy');
  assert.match(K, /if \(!stan\.zalogowany \|\| przyklad \|\| stan\.podglad \|\| !window\.sb\) return;\n\s*clearTimeout\(zegarStrojow\);/, 'strój z próby nie idzie do bazy');
  assert.match(K, /stan\.podglad = true;\n\s*wczytajPostepProby\(w\.proba_od\);/, 'poziom z lokalnej sumy, zanim gra narysuje postacie');
  assert.match(G, /localStorage\.getItem\(kluczSchowka\(k\)\)/); assert.match(G, /localStorage\.setItem\(kluczSchowka\(k\), v\)/);
});

test('Od zera: to urządzenie od razu, inne przez chwilę startu próby', async () => {
  assert.match(S, /await wyczyscLokalnie\(\); wyczyscPremiere\(\); wyczyscPostepGry\(\);/);
  assert.match(S, /k\.indexOf\('cegielki_proba_'\) === 0\) localStorage\.removeItem\(k\)/);
  const f = K.slice(K.indexOf('function wczytajPostepProby'), K.indexOf('function czyJestSesja') > 0 ? K.indexOf('var gotowe = Promise') : undefined);
  assert.match(f, /localStorage\.getItem\(PREFIKS_PROBY \+ "od"\) !== String\(od\)/);
  assert.match(f, /if \(od !== undefined\) \{/, 'starsza funkcja bez pola nie kasuje postępu');
  const W = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/proba-wizerunek.mjs')).href);
  const sb = (wyst) => ({ from: (t) => { const q = {}; const b = { select: () => b, eq: (k, v) => { q[k] = v; return b; }, maybeSingle: async () => ({ data: t === 'coaches' ? { id: 1 } : t === 'akcje' ? { nazwa: 'x' } : null }) }; return b; }, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'u' } }) }) }, rpc: async () => ({ data: { wystartowala_at: wyst, firmy: [] } }) });
  assert.equal((await W.odpowiedzWizerunku(sb('2026-11-07T08:00:00Z'), { id: 1 })).body.proba_od, '2026-11-07T08:00:00Z');
  assert.equal((await W.odpowiedzWizerunku(sb(null), { id: 1 })).body.proba_od, null, 'po „Od zera” inna wartość niż przy poprzednim guziku');
});

test('po rundzie: pasek tuż nad „Graj dalej”, Mały budowniczy bez paska, pasek rusza od poprzedniego stanu', () => {
  const ek = H.slice(H.indexOf('id="koniec"'), H.indexOf('id="plecak-runda"'));
  assert.match(ek, /<div id="k-poziom" class="poziom"><\/div>\n\s*<div class="guziki">\n\s*<button class="g" id="k-znow">Graj dalej<\/button>/);
  assert.doesNotMatch(ek, /Jeszcze raz/);
  assert.match(G, /\$\("k-poziom"\)\.hidden = g\.maly;/);
  assert.match(G, /\$\("k-znow"\)\.addEventListener\("click", function \(\) \{ start\(ostatniaPostac\); \}\);/);
  assert.match(K, /k\._poziom === pp\.poziom \? k\._procent : 0/, 'po awansie pasek od zera');
  assert.match(H, /prefers-reduced-motion:no-preference\) \{ #k-poziom \.pz-pasek span \{ transition:width/);
  const po = K.slice(K.indexOf('async function poRundzie'), K.indexOf('if (w.maly)'));
  assert.match(po, /\$\("k-awans"\)\.hidden = true;/, 'napis o awansie nie wisi z poprzedniej rundy'); assert.match(po, /\$\("k-kartka"\)\.hidden = true;/);
});

test('zamrożone pliki i sekrety: nic nowego', () => {
  const blok = K.slice(K.indexOf('PRÓBA (Filip 6.11)'), K.indexOf('var gotowe = Promise'));
  assert.doesNotMatch(blok, /s[lł]awek|wigr|fabian/i);
  assert.doesNotMatch(K + G, /rpc\("akcja_licznik"\)/, 'gra dalej nie woła licznika akcji');
});
