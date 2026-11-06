/* BLIZNA 159 / PRZEPŁYW FIRM (Filip 4.11, D1): zgłoszenie → wiersz → push → zatwierdzenie → firma w liczniku → zrzut usunięty. Plus odrzucenie, brak subskrypcji, kolejka, progi. Prawdziwy kod EF (_shared/firma-obsluga.mjs) na atrapie bazy; ten sam scenariusz przeszedł na PGlite z prawdziwym SQL. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('./_firmy-przeplyw.js');
const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const TRENER = { id: '11111111-1111-4111-8111-111111111111' };
const P_LOGO = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/';

function atrapa() {
  const zgl = [], firmy = [], kubelki = { 'firmy-zgloszenia': new Map(), 'akcja-firmy-logo': new Map() };
  const rpc = async (n, a) => {
    if (n === 'akcja_firmy_wpusc') return { data: { ok: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000 } };
    if (n === 'akcja_firmy_zgloszenie_dodaj') { zgl.push({ id: a.p_id, slug: a.p_slug, rodzaj: a.p_rodzaj, nazwa: a.p_nazwa, link: a.p_link, email: a.p_email, logo: a.p_logo, zrzut: a.p_zrzut, kwota_gr: a.p_kwota_gr, zgoda_na_kwote: a.p_zgoda_kwota, status: 'nowe', utworzono: new Date().toISOString() }); return { data: { ok: true } }; }
    if (n === 'akcja_firmy_zgloszenia_lista') return { data: { zgloszenia: zgl.map((z) => ({ ...z, proba: z.slug === 'proba' })), prog_domku_zl: 100, prog_wiezowca_zl: 1000, firmy_zgloszenia: false } };
    const z = zgl.find((x) => x.id === a.p_id);
    if (!z) return { data: { ok: false, powod: 'nie_ma' } };
    if (z.status !== 'nowe') return { data: { ok: false, powod: 'juz_decyzja' } };
    const pl = [z.zrzut, z.logo].filter(Boolean);
    if (n === 'akcja_firmy_zatwierdz') { firmy.push({ nazwa: z.nazwa, rodzaj: z.rodzaj, logo_url: a.p_logo_url, kwota_gr: z.zgoda_na_kwote ? z.kwota_gr : null, slug: z.slug }); z.status = 'zatwierdzone'; z.zrzut = z.logo = null; return { data: { ok: true, email: z.email, pliki: pl } }; }
    if (n === 'akcja_firmy_odrzuc') { z.status = 'odrzucone'; z.powod = a.p_powod; z.zrzut = z.logo = null; return { data: { ok: true, pliki: pl } }; }
    throw new Error('atrapa: ' + n);
  };
  const sb = {
    rpc,
    from: () => ({ select: () => ({ eq: (_k, id) => ({ maybeSingle: async () => { const z = zgl.find((x) => x.id === id); return { data: z ? { logo_sciezka: z.logo, status: z.status } : null }; } }) }) }),
    storage: { from: (k) => ({
      upload: async (p, b) => { kubelki[k].set(p, b); return { error: null }; },
      download: async (p) => (kubelki[k].has(p) ? { data: kubelki[k].get(p) } : { error: { message: 'brak' } }),
      remove: async (l) => { l.forEach((p) => kubelki[k].delete(p)); return { error: null }; },
      createSignedUrl: async (p) => ({ data: { signedUrl: 'https://x/' + p + '?token=t' } }),
      getPublicUrl: (p) => ({ data: { publicUrl: P_LOGO + p } }),
    }) },
  };
  return { sb, licznik: async () => ({ firmy: firmy.filter((f) => f.slug === 'proba') }), pliki: async () => [...kubelki['firmy-zgloszenia'].keys()] };
}
async function kontekst() {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  await zaladuj('js/moderacja.mjs');
  const a = atrapa();
  return { O, sb: a.sb, moderacja: globalThis.BM_MODERACJA, trener: TRENER, licznik: a.licznik, pliki: a.pliki, wlaczFormularz: async () => {} };
}

test('zgłoszenie, push, zatwierdzenie, firma w liczniku, zrzut usunięty, mail', async () => { await S.zatwierdzenie(await kontekst()); });
test('odrzucenie: zrzut skasowany, nic publicznego', async () => { await S.odrzucenie(await kontekst()); });
test('bez subskrypcji push: zgłoszenie czeka w panelu, licznik świeci', async () => { await S.bezSubskrypcji(await kontekst()); });
test('kilka zgłoszeń: osobne pushe; progi i pułapka', async () => { await S.kolejkaIProgi(await kontekst()); });

test('panel: dotknięcie pushu otwiera to jedno zgłoszenie, licznik do sprawdzenia, PRÓBA; EF cienkie, sekrety z env', () => {
  const p = czytaj('js/firmy-panel.mjs');
  assert.match(p, /if \(m\) otworzNakladke\(m\[1\]\)/);
  assert.match(p, /"Zgłoszenia do sprawdzenia \(firmy i cegiełki\): " \+ n/);   // od blizny 192 także cegiełki od osób prywatnych
  assert.match(p, /"PRÓBA"/);
  assert.doesNotMatch(p.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'), /innerHTML/);
  const z = czytaj('supabase/functions/firma-zgloszenie/index.ts'), pn = czytaj('supabase/functions/firma-panel/index.ts');
  assert.match(z, /x-push-secret": SEKRET/); assert.match(z, /przyjmijZgloszenie\(/);
  assert.match(pn, /from\("coaches"\)\.select\("id"\)\.eq\("id", user\.id\)\.maybeSingle\(\)/); assert.match(pn, /akcjaPanelu\(/);
  assert.match(pn, /if \(!RESEND\) return;/, 'bez klucza mail pomijany bez błędu');
  assert.match(czytaj('js/akcja.mjs'), /akcja_firmy_do_sprawdzenia/, 'licznik na Dziś trenera');
});
