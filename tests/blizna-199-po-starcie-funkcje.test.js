/* BLIZNA 199 / PO STARCIE AKCJI: FUNKCJE (Filip 9.11). Migracja: blizna-198. Front: blizna-200.
   - akcja-wyprawa-slad: mapa wyłączona, ślad GPS nie wychodzi do nikogo (każdy odczyt = 410); zostaje pobieranie z intervals do km wyprawy (cron, webhook, sekret);
   - firma-zgloszenie: cegiełka z kwotą opcjonalnie (od 100 zł złota); kwota zostaje w zgłoszeniu, w pushu i publicznie jej nie ma;
   - firma-panel: przełącznik „Złota cegła” przy zatwierdzaniu nadpisuje to, co baza ustawiła z kwoty; firma bez zmian. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const TRENER = { id: '11111111-1111-4111-8111-111111111111' };
const PNG = () => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, 900); new DataView(b.buffer).setUint32(20, 1600); return b; };
const plik = (b) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
const formularz = (pola) => { const m = new Map(Object.entries(pola)); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };

/* Atrapa: zgłoszenia i mur; zatwierdzenie cegiełki jak 20261109_akcja_po_starcie (złota od 10 000 gr). */
function atrapa() {
  const zgl = [], mur = [], aktualizacje = [];
  const sb = {
    rpc: async (n, a) => {
      if (n === 'akcja_firmy_wpusc') return { data: { ok: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000 } };
      const z = zgl.find((x) => x.id === a.p_id);
      if (n === 'akcja_firmy_zatwierdz') {
        if (!z || z.status !== 'nowe') return { data: { ok: false, powod: 'nie_ma' } };
        z.status = 'zatwierdzone';
        if (z.rodzaj === 'cegielka') { const c = { id: 'c-' + (mur.length + 1), imie: z.nazwa, zlota: (z.kwota_gr || 0) >= 10000 }; mur.push(c); return { data: { ok: true, cegla: c.id, zlota: c.zlota, email: null, pliki: [] } }; }
        return { data: { ok: true, firma: 'f-1', email: null, pliki: [] } };
      }
      throw new Error('atrapa: ' + n);
    },
    from: (t) => ({
      insert: async (w) => { assert.equal(t, 'akcja_firmy_zgloszenia'); zgl.push({ status: 'nowe', ...w }); return { error: null }; },
      select: () => ({ eq: (_k, id) => ({ maybeSingle: async () => { const z = zgl.find((x) => x.id === id); return { data: z ? { logo_sciezka: null, status: z.status } : null }; } }) }),
      update: (w) => ({ eq: async (k, v) => { assert.equal(t, 'akcja_cegielki', 'przełącznik rusza tylko mur'); assert.deepEqual(Object.keys(w), ['zlota']); aktualizacje.push([v, w.zlota]); const c = mur.find((x) => x[k] === v); if (c) c.zlota = w.zlota; return { error: null }; } }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };
  return { sb, zgl, mur, aktualizacje };
}
async function kontekst() {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  await zaladuj('js/moderacja.mjs');
  return { O, M: globalThis.BM_MODERACJA, a: atrapa() };
}
let nr = 0;
const noweId = () => '4444444' + (nr++ % 10) + '-4444-4444-8444-444444444444';
const cegielka = (nad) => formularz({ slug: 'dla-fabianka', rodzaj: 'cegielka', imie: 'Patryk', zgoda_imie: 'tak', zrzut: plik(PNG()), ...nad });

test('cegiełka: kwota opcjonalna, w groszach; zła kwota = odmowa po ludzku; kwota nie trafia do pushu', async () => {
  const Z = await zaladuj('supabase/functions/_shared/firma-zgloszenie.mjs');
  const { O, M, a } = await kontekst();
  for (const [kwota, gr] of [[null, null], ['', null], ['  ', null], ['150', 15000], ['99,99 zł', 9999], ['1 000', 100000]]) {
    const w = Z.sprawdzCegielke({ imie: 'Ola', zgoda_imie: 'tak', kwota }, M);
    assert.equal(w.blad, undefined, String(kwota)); assert.equal(w.wiersz.kwota_gr, gr, String(kwota));
  }
  for (const kwota of ['abc', '0', '-5', '12.345']) assert.match(Z.sprawdzCegielke({ imie: 'Ola', kwota }, M).blad, /Kwota: podaj liczbę złotych/, kwota);
  const pushe = [];
  const w = await O.przyjmijZgloszenie({ dane: cegielka({ kwota: '150' }), ipSkrot: 'ip-1', sb: a.sb, moderacja: M, powiadom: async (p) => { pushe.push(p); }, noweId });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(a.zgl[0].kwota_gr, 15000); assert.equal(a.zgl[0].rodzaj, 'cegielka');
  assert.doesNotMatch(JSON.stringify(pushe), /150|zł/, 'kwota cegiełki nie idzie w pushu');
  const bez = await O.przyjmijZgloszenie({ dane: cegielka({ imie: 'Ola' }), ipSkrot: 'ip-1', sb: a.sb, moderacja: M, powiadom: async () => {}, noweId });
  assert.equal(bez.status, 200); assert.equal(a.zgl[1].kwota_gr, null, 'bez kwoty dalej przechodzi');
});

test('panel: złota z kwoty zostaje bez przełącznika; przełącznik nadpisuje w obie strony; firma ignoruje przełącznik', async () => {
  const { O, M, a } = await kontekst();
  const wyslij = async (nad) => (await O.przyjmijZgloszenie({ dane: cegielka(nad), ipSkrot: 'ip-2', sb: a.sb, moderacja: M, powiadom: async () => {}, noweId })).body.id;
  const sto = await wyslij({ kwota: '150' }), piec = await wyslij({ imie: 'Ola', kwota: '50' }), zero = await wyslij({ imie: 'Ewa' }), zgaszona = await wyslij({ imie: 'Jan', kwota: '200' });
  const zatwierdz = (id, zlota) => O.akcjaPanelu({ sb: a.sb, user: TRENER, body: zlota === undefined ? { akcja: 'zatwierdz', id } : { akcja: 'zatwierdz', id, zlota } });
  assert.equal((await zatwierdz(sto)).status, 200);
  assert.equal((await zatwierdz(piec, true)).status, 200);
  assert.equal((await zatwierdz(zero, false)).status, 200);
  assert.equal((await zatwierdz(zgaszona, false)).status, 200);
  assert.deepEqual(a.mur.map((c) => [c.imie, c.zlota]), [['Patryk', true], ['Ola', true], ['Ewa', false], ['Jan', false]]);
  assert.deepEqual(a.aktualizacje, [['c-2', true], ['c-4', false]], 'zapis tylko, gdy przełącznik różni się od bazy');
  assert.equal((await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'zatwierdz', id: '55555555-5555-4555-8555-555555555555', zlota: true } })).status, 409);
  assert.equal(a.aktualizacje.length, 2, 'odmowa zatwierdzenia nic nie przełącza');
  const src = czytaj('supabase/functions/_shared/firma-obsluga.mjs');
  assert.match(src, /if \(data\.cegla && typeof body\.zlota === "boolean" && body\.zlota !== data\.zlota\)/, 'firma (bez cegla) ignoruje przełącznik');
});

test('akcja-wyprawa-slad: mapa wyłączona, każdy odczyt 410, punkty i segmenty nie wychodzą; pobieranie do km zostaje', () => {
  const ef = czytaj('supabase/functions/akcja-wyprawa-slad/index.ts');
  assert.match(ef, /if \(req\.method !== "POST" \|\| body\.rodzaj !== "odswiez"\) return J\(410, \{ blad: "mapa wyprawy wyłączona" \}, \{ "Cache-Control": "no-store" \}\);/);
  assert.ok(ef.indexOf('return J(410') < ef.indexOf('createClient(SB_URL'), 'odczyt odmawia, zanim funkcja w ogóle sięgnie do bazy');
  assert.doesNotMatch(ef, /segmenty|async function slad|pamiecSladu|ukryj\(|jednoKontoNaDzien|rowerzysta/, 'nic do składania śladu dla odbiorcy');
  assert.doesNotMatch(ef, /select\("[^"]*punkty/, 'punktów nikt nie czyta z bazy');
  assert.match(ef, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
  assert.match(ef, /if \(!SEKRET \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== SEKRET\) return J\(401/);
  assert.match(ef, /raporty\.push\(await odswiez\(sb, a, od, tylko\)\)/);
  assert.match(ef, /await sb\.from\("akcja_wyprawa_slad"\)\.insert\(/, 'ślad dalej się zapisuje: z niego akcja_licznik liczy km wyprawy');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-wyprawa-slad\]\nverify_jwt = false\s+# WYPRAWA: mapa wyłączona 9\.11/);
  /* Tabela śladu: RLS bez polityk, zero grantów dla przeglądarki (migawka), a akcja_licznik oddaje z niej tylko sumę km. */
  const rls = czytaj('supabase/schema/rls/akcja_wyprawa_slad.txt');
  assert.match(rls, /anon\s+: — brak/); assert.match(rls, /authenticated\s+: — brak/); assert.match(rls, /POLITYKI \(0\)/);
  const lic = czytaj('supabase/schema/funkcje/akcja_licznik.sql');
  assert.doesNotMatch(lic, /punkty/, 'licznik nie czyta punktów');
  assert.match(lic, /sum\(case when s\.athlete_id = v_glowny then s\.dystans_m end\)/);
});
