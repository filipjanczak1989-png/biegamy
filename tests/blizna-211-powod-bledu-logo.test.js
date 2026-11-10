/* BLIZNA 211 / POWÓD BŁĘDU KOPIOWANIA LOGO W PANELU (Filip 10.11, D). Zwiad 10.11: publiczny kubełek akcja-firmy-logo ma limit 1 MB (prywatny firmy-zgloszenia 2 MB),
   więc zatwierdzenie logo 1–2 MB z drogi awaryjnej padało z gołym „Nie udało się skopiować logo.”. Teraz komunikat z panelu (js/firmy-panel.mjs: info.textContent = e.message)
   mówi, co się stało: rozmiar i typ pliku, limit kubełka, powód z magazynu, co dalej. Zgłoszenie zostaje „nowe”; nic nie jest zatwierdzane po cichu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const TRENER = { id: '11111111-1111-4111-8111-111111111111' }, ID = '22222222-2222-4222-8222-222222222222';

function atrapa(o) {
  const op = o || {}, rpc = [], usuniete = [];
  const sb = {
    rpc: async (n, a) => { rpc.push([n, a]); if (n === 'akcja_firmy_zatwierdz') return { data: { ok: true, email: null, pliki: [] } }; return { data: { ok: true } }; },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { logo_sciezka: ID + '/logo.png', status: 'nowe' } }) }) }) }),
    storage: { from: (k) => ({
      download: async () => (op.pobraniePada ? { error: { message: 'Object not found' } } : { data: { size: op.rozmiar == null ? 1500 * 1024 : op.rozmiar, type: 'image/png' } }),
      upload: async () => (k === 'akcja-firmy-logo' && op.kopiaPada ? { error: { message: op.kopiaPada } } : { error: null }),
      remove: async (l) => { usuniete.push(...l); return { error: null }; },
      getPublicUrl: (p) => ({ data: { publicUrl: 'https://x/' + p } }),
    }) },
  };
  return { sb, rpc, usuniete };
}

test('kopia logo pada przez limit kubełka: komunikat z rozmiarem, typem, limitem, powodem i co dalej; zgłoszenie nie jest zatwierdzane', async () => {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  const a = atrapa({ kopiaPada: 'The object exceeded the maximum allowed size', rozmiar: 1500 * 1024 });
  const w = await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'zatwierdz', id: ID }, noweId: () => '33333333-3333-4333-8333-333333333333' });
  assert.equal(w.status, 500);
  assert.equal(w.body.blad, 'Nie udało się skopiować logo do publicznego kubełka (plik 1500 KB, PNG; kubełek przyjmuje PNG, JPG i WebP do 1 MB): plik większy niż limit kubełka (1 MB). Zgłoszenie czeka dalej: popraw logo w panelu albo poproś firmę o mniejszy plik.');
  assert.ok(!a.rpc.some((r) => r[0] === 'akcja_firmy_zatwierdz'), 'bez kopii logo nie ma zatwierdzenia'); assert.deepEqual(a.usuniete, [], 'pliki zgłoszenia zostają');
  const b = atrapa({ kopiaPada: 'mime type image/bmp is not supported', rozmiar: 20 * 1024 });
  const w2 = await O.akcjaPanelu({ sb: b.sb, user: TRENER, body: { akcja: 'zatwierdz', id: ID } });
  assert.match(w2.body.blad, /^Nie udało się skopiować logo do publicznego kubełka \(plik 20 KB, PNG; .*\): typ pliku odrzucony przez kubełek: mime type image\/bmp is not supported\. Zgłoszenie czeka dalej/);
  const c = atrapa({ kopiaPada: '   ', rozmiar: 0 });
  assert.match((await O.akcjaPanelu({ sb: c.sb, user: TRENER, body: { akcja: 'zatwierdz', id: ID } })).body.blad, /plik 0 KB.*magazyn nie podał powodu\. Zgłoszenie czeka dalej/);
});

test('pobranie logo ze zgłoszenia pada: komunikat ze ścieżką i powodem; bez błędu kopia i zatwierdzenie jak dotąd', async () => {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  const a = atrapa({ pobraniePada: true });
  const w = await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'zatwierdz', id: ID } });
  assert.equal(w.status, 500); assert.equal(w.body.blad, 'Nie udało się pobrać logo ze zgłoszenia (' + ID + '/logo.png): błąd magazynu: Object not found.');
  const b = atrapa({});
  const ok = await O.akcjaPanelu({ sb: b.sb, user: TRENER, body: { akcja: 'zatwierdz', id: ID }, noweId: () => '33333333-3333-4333-8333-333333333333' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.ok(b.rpc.some((r) => r[0] === 'akcja_firmy_zatwierdz' && r[1].p_logo_url === 'https://x/33333333-3333-4333-8333-333333333333.png'));
  assert.equal(O.powodMagazynu({ message: 'x'.repeat(400) }).length, 'błąd magazynu: '.length + 160, 'powód przycięty do 160 znaków');
  assert.equal(O.powodMagazynu(null), 'magazyn nie podał powodu');
});

test('panel pokazuje treść błędu funkcji przez textContent, a nie połyka jej', () => {
  const p = czytaj('js/firmy-panel.mjs');
  assert.match(p, /throw new Error\(\(d && d\.blad\) \|\| "Nie udało się\. Sprawdź łącze\."\)/, 'blad z funkcji staje się treścią błędu');
  assert.match(p, /\.catch\(function \(e\) \{ tak\.disabled = nie\.disabled = false; info\.textContent = e\.message; \}\)/, 'decyzja: treść w info przez textContent, przyciski wracają');
  assert.doesNotMatch(p.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'), /innerHTML/);
});
