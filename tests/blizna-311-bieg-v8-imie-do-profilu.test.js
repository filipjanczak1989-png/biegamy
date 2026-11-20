/* BLIZNA 311 / 20.11: regulamin v8 (decyzja Filipa) — imię pełnoletniego uczestnika z publicznym profilem prowadzi na liście „Ukończyli” do profilu.
   Front PRZED migracją 20261218 (ona sama przestawia bieg-mikolajki na v8): strona przyjmuje v2–v8. § 8 ust. 1 v8 = brzmienie z v5–v7 i zdanie Filipa na końcu,
   komunikat zmiany słowo w słowo. Pole `profil` liczy baza; front robi link tylko z poprawnego UUID, przy imieniu, nigdy u dziecka. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { globalThis.escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'); await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });
const BIEG = (w) => ({ slug: 'bieg-mikolajki', nazwa: 'Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: w, regulamin_od: '2026-11-20' });
const LICZNIK = { imie: 'Fabianek' }, LINK = 'https://example.org/zbiorka';
const ZDANIE = 'U pełnoletnich uczestników z publicznym profilem w BiegaMy imię na liście prowadzi do tego profilu.';
const KOMUNIKAT = 'Zmiana regulaminu: imię na liście „Ukończyli” prowadzi do publicznego profilu w BiegaMy (tylko pełnoletni z profilem publicznym).';
const UUID = '0b6c2a1e-3f4d-4c5b-9a8e-7d6f5e4c3b2a';
const paragraf8 = (w) => { const b = B.regulaminBloki(B.wartosciTekstow(BIEG(w), LICZNIK, LINK)), i = b.findIndex((x) => x.tekst === '§ 8. Lista osób, które ukończyły, i dane osobowe'); return b.slice(i + 1, i + 5).map((x) => x.tekst); };

test('v8 obowiązuje, strona przyjmuje v2–v8; § 8 ust. 1 = v7 + zdanie Filipa; v8 różni się od v7 tylko § 8 ust. 1 i linią wersji', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v8');
  assert.deepEqual([...B.WERSJE_TEKSTOW], ['2026-11-v2', '2026-11-v3', '2026-11-v4', '2026-11-v5', '2026-11-v6', '2026-11-v7', '2026-11-v8']);
  const v8 = paragraf8('2026-11-v8'), v7 = paragraf8('2026-11-v7');
  assert.equal(v8[0], v7[0] + ' ' + ZDANIE); assert.ok(v8[0].endsWith(ZDANIE)); assert.doesNotMatch(v7[0], /publicznym profilem/);
  assert.deepEqual(v8.slice(1), v7.slice(1));
  const t8 = B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v8'), LICZNIK, LINK)).split('\n'), t7 = B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v7'), LICZNIK, LINK)).split('\n');
  const rozne = t8.filter((l, i) => l !== t7[i]);
  assert.equal(rozne.length, 2, rozne.join(' | ')); assert.ok(rozne.includes(v8[0])); assert.ok(rozne.some((l) => /^3\. Wersja regulaminu: 2026-11-v8, obowiązuje od /.test(l)));
  assert.match(paragraf8('2026-11-v8')[0], /^1\. Na stronie biegu widoczne są liczby zbiorcze/);
});

test('komunikat zmiany: zapisani na v7 — zdanie Filipa słowo w słowo; na v8 nic; na v6 obie zmiany; przy v7 w bazie bez zdania o profilu', () => {
  assert.equal(B.komunikatZmiany(BIEG('2026-11-v8'), [{ regulamin_wersja: '2026-11-v7' }]), KOMUNIKAT);
  assert.equal(B.komunikatZmiany(BIEG('2026-11-v8'), [{ regulamin_wersja: '2026-11-v8' }]), '');
  assert.equal(B.komunikatZmiany(BIEG('2026-11-v8'), [{ regulamin_wersja: '2026-11-v6' }]),
    'Zmiana regulaminu: bieg zalicza trening z czasem (np. 45:00 albo 1:05:00); imię na liście „Ukończyli” prowadzi do publicznego profilu w BiegaMy (tylko pełnoletni z profilem publicznym).');
  assert.doesNotMatch(B.komunikatZmiany(BIEG('2026-11-v7'), [{ regulamin_wersja: '2026-11-v6' }]), /profilu/);
});

test('lista: imię z polem profil (UUID) → link do profil.html?id=; bez pola, z śmieciem, u dziecka albo bez imienia — bez linku', () => {
  const html = (u) => B.ukonczyliHtml({ razem: 1, lista: [Object.assign({ numer: 3, dystans_km: 5 }, u)] }, []);
  assert.match(html({ imie: 'Anna', profil: UUID }), new RegExp('<span class="bw-imie"><a class="bw-imie-link" href="profil\\.html\\?id=' + UUID + '" data-profil>Anna</a></span>'));
  assert.match(html({ imie: 'Anna', profil: UUID.toUpperCase() }), new RegExp('href="profil\\.html\\?id=' + UUID + '"'), 'adres małymi literami');
  assert.match(html({ imie: 'Anna' }), /<span class="bw-imie">Anna<\/span>/);
  for (const zly of ['javascript:alert(1)', '"><img src=x onerror=alert(1)>', UUID + '?x=1', '../profil', 12, null]) {
    const h = html({ imie: 'Anna', profil: zly });
    assert.doesNotMatch(h, /data-profil|<a /, String(zly)); assert.doesNotMatch(h, /onerror|javascript:/, String(zly));
  }
  assert.doesNotMatch(html({ imie: 'Zosia', dziecko: true, profil: UUID }), /data-profil/, 'dziecko: nigdy');
  const bez = html({ imie: null, profil: UUID });
  assert.doesNotMatch(bez, /data-profil/); assert.match(bez, /bez imienia/);
  assert.equal(B.linkProfilu({ imie: 'Anna', profil: UUID }), 'profil.html?id=' + UUID);
  assert.match(czytaj('bieg.html'), /\.bw-imie-link \{ display: inline-block;/);   // pole dotyku: blizna-313
  assert.match(czytaj('profil.html'), /const _pubId = new URLSearchParams\(location\.search\)\.get\('id'\);/, 'profil.html?id= otwiera publiczny profil także bez logowania');
});
