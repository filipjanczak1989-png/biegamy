/* BLIZNA 343 (23.11): „wstecz” w Usuń dane i w Porównaniu według reguły P1 (jak „← Powrót” w kalendarzu, blizna-339).
   Usuń dane: „← Kalendarz startów” był zwykłym linkiem do races.html — dopisywał Kalendarz Startów do historii (pętla z wyszukiwarką wyników) i z Wyników
   prowadził nie tam, skąd przyszliśmy. Teraz: z naszej strony history.back(); z zewnątrz (link z maila, nowa karta) location.replace — zalogowany na
   Kalendarz Startów, niezalogowany na stronę startową. Napis zostaje, gdy wstecz naprawdę prowadzi do Kalendarza Startów, inaczej „← Wstecz”.
   Porównanie: „←” był linkiem do zawodnik.html#section-forma (nowy wpis; kotwica ukrytej sekcji otwierała Dziś, nie Formę). Teraz z naszej strony
   history.back(), z zewnątrz location.replace('zawodnik.html?tab=forma'). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const funkcja = (zrodlo, nazwa) => { const i = zrodlo.indexOf('function ' + nazwa + '('); assert.ok(i >= 0, 'brak ' + nazwa); let g = 0, j = zrodlo.indexOf('{', i);
  for (; j < zrodlo.length; j++) { if (zrodlo[j] === '{') g++; else if (zrodlo[j] === '}' && --g === 0) break; } return zrodlo.slice(i, j + 1); };
const UD = czytaj('usun-dane.html'), CMP = czytaj('compare.html');
const P = 'https://biegamy.run/';

/* ── Usuń dane ── */
const KOD_UD = ['zNaszejStrony', 'zHistorii', 'sesjaUd', 'celZZewnatrz', 'napisPowrotu', 'powrotUd'].map((n) => funkcja(UD, n)).join('\n');
function usunDane({ referrer = '', dlugosc = 3, sesja = true, bladSesji = false } = {}) {
  const zd = [], a = { href: P + 'races.html', textContent: '← Kalendarz startów' };
  const ctx = { document: { referrer }, URL, Promise,
    window: { sb: { auth: { getSession: () => { if (bladSesji) throw new Error('x'); return Promise.resolve({ data: { session: sesja ? { user: {} } : null } }); } } } },
    history: { length: dlugosc, back: () => zd.push('back'), pushState: () => zd.push('PUSH') },
    location: { origin: 'https://biegamy.run', href: P + 'usun-dane.html', replace: (u) => zd.push('replace:' + u), assign: (u) => zd.push('ASSIGN:' + u) } };
  ctx.a = a;
  vm.runInNewContext(KOD_UD + '\nnapisPowrotu(a); powrotUd({ preventDefault() {} });', ctx);
  return new Promise((ok) => setImmediate(() => setImmediate(() => ok({ zd: zd.join(','), napis: a.textContent }))));
}

test('Usuń dane: HTML bez zmian, obsługa kliknięcia podpięta przed startem strony', () => {
  assert.match(UD, /<a class="ud-powrot" href="races\.html">← Kalendarz startów<\/a>/, 'href zostaje bez JS');
  assert.ok(UD.includes("var powrot = document.querySelector('.ud-powrot');\n  if (powrot) { napisPowrotu(powrot); powrot.addEventListener('click', powrotUd); }\n  var root = document.getElementById('usun-dane');"));
});

test('Usuń dane „←”: z naszej strony back; z zewnątrz replace (zalogowany → Kalendarz Startów, gość → strona startowa); napis tylko, gdy prowadzi do Kalendarza', async () => {
  const K = '← Kalendarz startów', W = '← Wstecz';
  assert.deepEqual(await usunDane({ referrer: P + 'races.html' }), { zd: 'back', napis: K }, 'z Kalendarza Startów (wyszukiwarka)');
  assert.deepEqual(await usunDane({ referrer: P + 'wyniki.html' }), { zd: 'back', napis: W }, 'z Wyników („Usuń moje wyniki”): wraca do Wyników');
  assert.deepEqual(await usunDane({ referrer: P + 'bot.html' }), { zd: 'back', napis: W }, 'z bot.html');
  assert.deepEqual(await usunDane({ referrer: '', dlugosc: 1, sesja: true }), { zd: 'replace:races.html', napis: K }, 'z zewnątrz, zalogowany');
  assert.deepEqual(await usunDane({ referrer: '', dlugosc: 1, sesja: false }), { zd: 'replace:index.html', napis: W }, 'z zewnątrz, gość');
  assert.deepEqual(await usunDane({ referrer: 'https://afqojgkaveykxbltxzwm.supabase.co/', dlugosc: 2, sesja: true }), { zd: 'replace:races.html', napis: K }, 'link z maila (przez Supabase)');
  assert.deepEqual(await usunDane({ referrer: P + 'races.html', dlugosc: 1, sesja: false }), { zd: 'replace:index.html', napis: W }, 'nowa karta bez historii, gość');
  assert.deepEqual(await usunDane({ referrer: '', dlugosc: 1, bladSesji: true }), { zd: 'replace:index.html', napis: W }, 'błąd sesji = gość');
});

/* ── Porównanie ── */
const KOD_CMP = funkcja(CMP, 'wsteczPorownania');
function porownanie({ referrer = '', dlugosc = 3 } = {}) {
  const zd = [];
  const ctx = { document: { referrer }, URL, history: { length: dlugosc, back: () => zd.push('back'), pushState: () => zd.push('PUSH') },
    location: { origin: 'https://biegamy.run', replace: (u) => zd.push('replace:' + u), assign: (u) => zd.push('ASSIGN:' + u), set href(u) { zd.push('HREF:' + u); } } };
  vm.runInNewContext(KOD_CMP + '\nwsteczPorownania({ preventDefault() {} });', ctx);
  return zd.join(',');
}

test('Porównanie: „←” bez kotwicy ukrytej sekcji, obsługa kliknięcia podpięta', () => {
  assert.match(CMP, /<a class="bm-hero-wstecz" href="zawodnik\.html\?tab=forma" title="Wróć" aria-label="Wróć">←<\/a>/);
  assert.doesNotMatch(CMP, /href="zawodnik\.html#section-forma"/, 'kotwica ukrytej sekcji otwierała Dziś');
  assert.match(CMP, /var w = document\.querySelector\('\.bm-hero-wstecz'\); if \(w\) w\.addEventListener\('click', wsteczPorownania\);/);
});

test('Porównanie „←”: z naszej strony back, z zewnątrz replace na Formę; nigdy nowy wpis', () => {
  assert.equal(porownanie({ referrer: P + 'zawodnik.html' }), 'back', 'z Dziś');
  assert.equal(porownanie({ referrer: P + 'compare.html?friend=x' }), 'back', 'po zmianie znajomego: krok wstecz jak w telefonie');
  assert.equal(porownanie({ referrer: '', dlugosc: 1 }), 'replace:zawodnik.html?tab=forma', 'z zewnątrz');
  assert.equal(porownanie({ referrer: 'https://l.facebook.com/x' }), 'replace:zawodnik.html?tab=forma', 'obca strona');
  assert.equal(porownanie({ referrer: P + 'zawodnik.html', dlugosc: 1 }), 'replace:zawodnik.html?tab=forma', 'nowa karta');
  assert.equal(porownanie({ referrer: 'nie-adres' }), 'replace:zawodnik.html?tab=forma', 'zepsuty referrer');
});

test('pętla Kalendarz Startów ↔ Usuń dane i Dziś ↔ Porównanie znikła: historia nie rośnie', async () => {
  const stos = ['zawodnik.html', 'races.html', 'usun-dane.html']; let i = 2;
  for (let n = 0; n < 3; n++) {
    assert.equal((await usunDane({ referrer: P + stos[i - 1], dlugosc: stos.length })).zd, 'back'); i--;
    stos.splice(i + 1); stos.push('usun-dane.html'); i++;
  }
  assert.deepEqual(stos, ['zawodnik.html', 'races.html', 'usun-dane.html'], 'dawniej każde „←” dopisywało Kalendarz Startów');
  assert.equal(porownanie({ referrer: P + 'zawodnik.html', dlugosc: 2 }), 'back', 'Dziś → Porównanie → „←” = Dziś bez nowego wpisu');
});
