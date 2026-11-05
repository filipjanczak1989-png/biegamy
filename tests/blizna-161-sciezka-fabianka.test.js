/* BLIZNA 161 / ŚCIEŻKA FABIANKA (Filip 4.11): pełna próba od zera na akcji proba.
   - rysunek i film na próbie tylko dla trenera i konta testowego, osobną funkcją, na 15 minut; anon i zwykłe konto nie dostają adresu;
   - licznik nadal nigdy nie oddaje ich dla akcji testowej (blizna-155);
   - przed naciśnięciem guzik nie prosi o adres;
   - po „od zera” film akcji zagra jeszcze raz, a prawdziwa akcja stoi nietknięta;
   - podgląd postaci w grze: bez zapisu i rankingu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const TRENER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', TESTOWY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ZWYKLY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ATH_T = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ATH_Z = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
function atrapa() {
  const zapytania = { coaches: { [TRENER]: { id: TRENER } }, athletes: { [TESTOWY]: { id: ATH_T }, [ZWYKLY]: { id: ATH_Z } } };
  const podpisane = [];
  return {
    podpisane,
    sb: {
      from: (t) => {
        const f = {}; const b = { select: () => b, eq: (k, v) => { f[k] = v; return b; }, maybeSingle: async () => {
          if (t === 'coaches') return { data: zapytania.coaches[f.id] || null };
          if (t === 'athletes') return { data: zapytania.athletes[f.user_id] || null };
          if (t === 'akcje') return { data: f.slug === 'proba' && f.testowa === true ? { konta_testowe: [ATH_T] } : null };
          return { data: null };
        } };
        return b;
      },
      storage: { from: () => ({ createSignedUrl: async (p, s) => { podpisane.push([p, s]); return { data: { signedUrl: 'https://x/' + p + '?token=t' } }; } }) },
      rpc: async () => ({ data: { firmy: [{ nazwa: 'Partner Próbny' }] } }),
    },
  };
}

test('rysunek na próbie: anon 401, zwykłe konto 403 bez adresu; trener i konto testowe dostają adresy na 15 minut', async () => {
  const W = await zaladuj('supabase/functions/_shared/proba-wizerunek.mjs');
  let a = atrapa();
  assert.deepEqual(await W.odpowiedzWizerunku(a.sb, null), { status: 401, body: { ok: false } });
  assert.equal(a.podpisane.length, 0);
  assert.deepEqual(await W.odpowiedzWizerunku(a.sb, { id: ZWYKLY }), { status: 403, body: { ok: false } });
  assert.equal(a.podpisane.length, 0, 'zwykłe konto nie uruchamia podpisywania');
  for (const id of [TRENER, TESTOWY]) {
    a = atrapa();
    const w = await W.odpowiedzWizerunku(a.sb, { id });
    assert.equal(w.status, 200);
    assert.match(w.body.koparka_url, /fabianek-koparka\.webp/); assert.match(w.body.film_akcji_url, /film-akcja\.mp4/);
    assert.ok(a.podpisane.every((p) => p[1] === 900), 'adres ważny 15 minut');
  }
  assert.equal(W.WAZNOSC_S, 900);
  const ef = czytaj('supabase/functions/akcja-proba-wizerunek/index.ts');
  assert.match(ef, /odpowiedzWizerunku\(sb, user\)/); assert.match(ef, /wymagajUsera\(req\)/); assert.match(ef, /no-store/);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-proba-wizerunek\]\nverify_jwt = false/);
});

test('guzik: panel dopiero po zgodzie bazy, adres rysunku dopiero po naciśnięciu, „Dotarliśmy” pod ⋯ z przytrzymaniem, blokada ekranu zwolniona', () => {
  const s = czytaj('start-akcji.html');
  assert.match(s, /var SCIEZKA = PROBA && new URLSearchParams\(location\.search\)\.get\('sciezka'\) === '1'/);
  assert.match(s, /var r = await window\.sb\.rpc\('akcja_sciezka_stan'\);\s+if \(r\.error\) return;\s+budujPanelSciezki\(\);/, 'odmowa bazy = panelu nie ma');
  assert.match(s, /if \(SCIEZKA && d && d\.wystartowala && AKC\.wizerunekProby\)/, 'rysunek po starcie próby');
  assert.doesNotMatch(s, /<a /, 'na zwykłym ekranie guzika nie ma linków');
  assert.match(s, /DOTARCIE_MS = 2000/);
  assert.match(s, /id="dotarcie-miejsce"/);
  assert.match(s, /zwolnijBlokade\(\)/);
  assert.match(s, /kod === '42501'/); assert.match(s, /LIMIT_RPC_MS = 8000/);
});

test('cytaty: konto testowe dostaje film z funkcji, po „od zera” film gra jeszcze raz, film akcji od 10 s w pełnej klatce', async () => {
  await zaladuj('js/akcja-cytaty.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  const f = A.filmAkcjiZLicznika({ wystartowala: true, film_akcji_url: 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/film-akcja.mp4?token=a.b-c' });
  assert.deepEqual(f.pozycje[1], { od: 10, pos: '50% 50%', fit: 'contain' });
  const k = czytaj('js/akcja-cytaty.mjs');
  assert.match(k, /slug === "proba" && d && d\.wystartowala && g\.document/, 'funkcja tylko dla próby, tylko w przeglądarce');
  assert.match(k, /removeItem\("film_akcji"\)/);
  const sb = czytaj('sb.js');
  assert.match(sb, /function dopasowanie\(film, t\)/); assert.doesNotMatch(sb, /film\.skala|skala: 1\.25/, 'powiększenie banera cofnięte');
});

test('gra: podgląd postaci tylko po zgodzie funkcji, bez zapisu rundy i bez wymiany; suwak i firmy testowe tylko na próbie', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /if \(stan\.podglad \|\| premiera\) \{ stan\.ulepszenie = null; return; \}/, 'przed rundą bez numeru rundy');
  assert.match(k, /if \(stan\.podglad\) \{ info\("Podgląd postaci: bez zapisu i bez rankingu\."\)/, 'po rundzie bez zapisu');
  assert.match(k, /var w = r && r\.data && r\.data\.ok \? r\.data : null;\s+if \(!w\) return;/, 'odmowa = bez przełącznika');
  const m = czytaj('supabase/migrations/20261105_akcja_sciezka.sql');
  assert.doesNotMatch(m.replace(/--[^\n]*/g, ''), /akcja_slug = 'dla-fabianka'|slug = 'dla-fabianka' and testowa/, 'funkcje próby nie sięgają prawdziwej akcji');
  assert.match(m, /check \(proba_sym_km is null or \(testowa and proba_sym_km >= 0\)\)/, 'symulacja tylko na akcji testowej');
});

test('plan Z: migracja ścieżki i jej wycofanie nie ruszają daty zapowiedzi, baza przełącza się sama w zapowiedz_zmiana_at', () => {
  for (const p of ['supabase/migrations/20261105_akcja_sciezka.sql', 'supabase/migrations/20261105_WYCOFANIE_akcja_sciezka.sql']) assert.doesNotMatch(czytaj(p), /data_zapowiedzi|zapowiedz_zmiana_at/, p);
  assert.match(czytaj('supabase/migrations/20261104_akcja_firmy.sql'), /when a\.zapowiedz_zmiana_at is not null and now\(\) >= a\.zapowiedz_zmiana_at then coalesce\(a\.data_zapowiedzi_po/);
  assert.match(czytaj('dla-fabianka.html'), /krotka\(d && \(d\.data_zapowiedzi \|\| d\.start\)\)/, 'teaser czyta datę z licznika');
});
