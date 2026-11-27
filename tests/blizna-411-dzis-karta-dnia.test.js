// Blizna #411 (27.11.2026, P1d) — nowe Dziś: karta dnia (karta treningu do udostępnienia) z dwóch miejsc.
//
// Co istnieje: SHARECARD w sb.js (przycisk „Zobacz kartę” w oknie edycji wpisu i w kalendarzu). Po dotknięciu: funkcja share-card
// (POST z log_id; renderuje obraz albo oddaje gotowy ze Storage) i pobranie tego obrazu, potem podgląd z „Zapisz” i „Udostępnij”.
// Na karcie: imię, zdjęcie profilu, data (godzina tylko z zegarka), dystans, rodzaj, czas i tempo, przewyższenie, kalorie;
// tętno tylko przy hr_public (wybór zawodnika). Bez komentarza i bez odczucia (share-card ich nie czyta).
// Nowe wejścia (oba przez SHARECARD.otworz, bez kopii kodu karty w module):
//   1. „Karta dnia ›” w prawym górnym rogu kafla „Ostatni trening” (styl .dn-link jak „Plan ›”), tylko trening z dziś albo z wczoraj;
//   2. „Zrób kartę dnia ›” pod zdaniem po udanym zapisie „Jak poszło?”, do tego samego treningu; z linkiem podziękowanie zostaje
//      do następnego odświeżenia (2,6 s nie wystarczy, żeby trafić); bez karty jak dotąd znika po 2,6 s.
// Pierwszy ekran: zero nowych zapytań (pobieranie dopiero po dotknięciu). Bez sieci linku nie ma.
// Brak SHARECARD na wczytanej stronie albo błąd przy otwarciu = linku nie ma / wpis client_errors „karta-dnia”.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { strona, wpis, MODUL, czytaj } = require('./_dzis-nowy-strona.js');
const { zaladujSb } = require('./_srodowisko.js');

const EF = czytaj('supabase/functions/share-card/index.ts');
const plain = (x) => JSON.parse(JSON.stringify(x));
/** Dotknięcie elementu z data-dn i data-log (wspólna atrapa podaje tylko data-dn i data-kod). */
const dotknijKarte = (s, id) => s.korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? 'karta' : k === 'data-log' ? id : null) } : null) } });
const zgl = (s) => s.zgloszenia.map((a) => a[0] && a[0].message);
const wczytana = async (o) => { const s = strona(o); s.B.start(); await s.doKonca(); return s; };

test('(1) „Ostatni trening” z wczoraj: „Karta dnia ›” w rogu jak „Plan ›”; dotknięcie otwiera kartę TEGO wpisu; zero nowych zapytań', async () => {
  const bez = await wczytana({ bezKarty: true }), s = await wczytana();
  const h = s.kafel('ostatni').innerHTML;
  assert.match(h, /^<div class="dn-gora"><div><h2 class="dn-etykieta">Ostatni trening<\/h2><div class="dn-kto">Spokojny · wczoraj<\/div><\/div><button type="button" class="dn-link" data-dn="karta" data-log="l1">Karta dnia ›<\/button><\/div>/);
  assert.deepEqual(s.zapytania.map((z) => z.nazwa), bez.zapytania.map((z) => z.nazwa), 'te same zapytania z kartą i bez');
  const ile = s.zapytania.length;
  dotknijKarte(s, 'l1'); await s.tik();
  assert.deepEqual(s.stare, ['SHARECARD.otworz l1 {"mozeEdytowac":true}']);
  assert.equal(s.zapytania.length, ile, 'moduł sam nic nie pobiera; kartę pobiera SHARECARD po dotknięciu');
  assert.deepEqual(zgl(s), []);
});

test('(2) tylko dziś albo wczoraj: przedwczoraj i starsze bez linku; dziś z linkiem; bez dystansu (share-card odrzuca) bez linku', async () => {
  assert.match((await wczytana({ wpisy: [wpis('l1', 2)] })).kafel('ostatni').innerHTML, /Spokojny · dziś<\/div><\/div><button type="button" class="dn-link" data-dn="karta" data-log="l1">Karta dnia ›/);
  for (const [w0, opis] of [[wpis('l1', 40), 'przedwczoraj'], [wpis('l1', 24 * 9), '9 dni'], [wpis('l1', 2, { distance_km: null }), 'bez dystansu']]) {
    const s = await wczytana({ wpisy: [w0] });
    assert.doesNotMatch(s.kafel('ostatni').innerHTML, /data-dn="karta"/, opis);
    assert.deepEqual(zgl(s), [], opis + ': to nie błąd');
  }
  assert.doesNotMatch((await wczytana({ wpisy: [] })).kafel('ostatni').innerHTML, /karta/, 'bez treningów');
});

test('(3) bez sieci linku nie ma i nic nie idzie do client_errors', async () => {
  const s = await wczytana({ online: false });
  assert.doesNotMatch(s.kafel('ostatni').innerHTML, /data-dn="karta"/);
  assert.deepEqual(zgl(s), []);
});

test('(4) brak SHARECARD na wczytanej stronie: linku nie ma, jeden wpis client_errors „karta-dnia”; błąd przy otwarciu też', async () => {
  const s = await wczytana({ bezKarty: true });
  assert.doesNotMatch(s.kafel('ostatni').innerHTML, /data-dn="karta"/);
  assert.deepEqual(zgl(s), ['karta-dnia']);
  assert.deepEqual(plain(s.zgloszenia[0][0]), { kind: 'dzis-nowy', message: 'karta-dnia', url: '/zawodnik.html' });
  const z = await wczytana(); z.st.karta = false;
  dotknijKarte(z, 'l1'); await z.tik();
  assert.deepEqual(zgl(z), ['karta-dnia'], 'otworz oddał false (EF albo sieć): zgłoszenie');
  const nieznany = await wczytana(); dotknijKarte(nieznany, 'obcy-id'); await nieznany.tik();
  assert.deepEqual(nieznany.stare, [], 'dotknięcie z id spoza wpisów nic nie otwiera');
});

test('(5) „Jak poszło?”: po udanym zapisie pod zdaniem „Zrób kartę dnia ›” do tego samego treningu; podziękowanie zostaje', async () => {
  const s = await wczytana({ wpisy: [wpis('l1', 20)] });   // atrapa odsyła na update całą listę wpisów, a moduł przyjmuje tylko jeden wiersz
  s.dotknij('jp-mina', 'good'); s.dotknij('jp-zapisz'); await s.doKonca();
  assert.equal(s.jp('jp').className, 'dn-jp-ok');
  assert.equal(s.jp('jp').innerHTML, '<b>Zapisane — dzięki!</b><p>Trener to zobaczy, a forma policzy się dokładniej.</p><p class="dn-jp-karta"><button type="button" class="dn-link" data-dn="karta" data-log="l1">Zrób kartę dnia ›</button></p>');
  assert.equal(s.czasomierze.filter((c) => c.zywy && c.ms === 2600).length, 0, 'z linkiem podziękowanie nie znika po 2,6 s');
  dotknijKarte(s, 'l1'); await s.tik();
  assert.deepEqual(s.stare, ['SHARECARD.otworz l1 {"mozeEdytowac":true}']);
  assert.equal(s.zapytania.filter((z) => /update/.test(z.opis)).length, 1, 'jeden zapis odczucia, karta nic nie zapisuje');
});

test('(6) „Jak poszło?” bez karty (brak SHARECARD): jak dotąd, bez linku, podziękowanie znika po 2,6 s', async () => {
  const s = await wczytana({ bezKarty: true, wpisy: [wpis('l1', 20)] });
  s.dotknij('jp-mina', 'good'); s.dotknij('jp-zapisz'); await s.doKonca();
  assert.equal(s.jp('jp').innerHTML, '<b>Zapisane — dzięki!</b><p>Trener to zobaczy, a forma policzy się dokładniej.</p>');
  assert.equal(s.czasomierze.filter((c) => c.zywy && c.ms === 2600).length, 1);
});

test('(7) SHARECARD.otworz (prawdziwy sb.js): bez wpisu z dystansem nic; czekacz, share-card z log_id, podgląd; błąd = false i komunikat; drugi dotyk w trakcie nic nie pobiera', async () => {
  const ctx = zaladujSb(), dom = {}, dodane = [], fetche = [], toasty = [];
  const el = () => ({ id: '', style: {}, innerHTML: '', textContent: '', remove() { delete dom[this.id]; }, querySelector: () => ({ addEventListener() {} }), addEventListener() {} });
  ctx.document.createElement = el; ctx.document.getElementById = (id) => dom[id] || null;
  ctx.document.body = { appendChild(e) { dodane.push(e.id); if (e.id) dom[e.id] = e; } };
  ctx.File = File; ctx.toast = (m) => toasty.push(m);
  ctx.sb = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  let odpowiedz = 'ok';
  ctx.fetch = async (url, o) => { fetche.push([String(url), o ? o.body : null]); if (String(url).endsWith('/share-card')) return odpowiedz === 'ok' ? { ok: true, json: async () => ({ url: 'https://x.test/karta.jpg' }) } : { ok: false, status: 500, json: async () => ({ error: 'x' }) }; return { blob: async () => new Blob(['jpg']) }; };
  const S = ctx.SHARECARD;
  assert.equal(typeof S.otworz, 'function');
  assert.equal(await S.otworz({ id: 'l9', distance_km: null }), false);
  assert.equal(await S.otworz(null), false);
  assert.equal(fetche.length, 0, 'bez dystansu: nic nie pobiera');
  const p = S.otworz({ id: 'l1', distance_km: 8.2 }, { mozeEdytowac: true });
  assert.deepEqual(dodane, ['sc-czekacz'], 'od razu czekacz');
  assert.equal(await S.otworz({ id: 'l1', distance_km: 8.2 }), true, 'drugi dotyk w trakcie');
  assert.equal(await p, true);
  assert.ok(fetche[0][0].endsWith('/functions/v1/share-card')); assert.equal(fetche[0][1], JSON.stringify({ log_id: 'l1' }));
  assert.equal(fetche[1][0], 'https://x.test/karta.jpg');
  assert.equal(fetche.length, 2, 'dwa pobrania: funkcja i obraz');
  assert.deepEqual(dodane, ['sc-czekacz', 'sc-podglad']); assert.ok(!dom['sc-czekacz'] && dom['sc-podglad'], 'czekacz zdjęty, podgląd otwarty');
  delete dom['sc-podglad']; odpowiedz = 'blad';
  assert.equal(await S.otworz({ id: 'l2', distance_km: 5 }), false);
  assert.deepEqual(toasty, ['Nie udało się przygotować karty']); assert.ok(!dom['sc-czekacz'] && !dom['sc-podglad']);
});

test('(8) zawartość karty: share-card nie czyta komentarza ani odczucia; tętno tylko przy hr_public', () => {
  const sel = /\.from\("training_logs"\)\s*\.select\("([^"]+)"\)\s*\.eq\("id", log_id\)/.exec(EF);
  assert.ok(sel, 'zapytanie o wpis w share-card');
  assert.doesNotMatch(sel[1], /comment|feel|notes/);
  assert.match(EF, /if \(ath\.hr_public && log\.heart_rate != null\) \{/);
  assert.match(EF, /if \(ath\.user_id !== user\.id && ath\.coach_id !== user\.id\) return json\(\{ error: "nie twój trening" \}, 403\);/, 'cudzych kart nie ma');
});

test('(9) źródło: moduł nie kopiuje karty, tylko woła SHARECARD.otworz; jedno miejsce decyzji o linku; etap w liście zgłoszeń', () => {
  assert.doesNotMatch(MODUL, /["']share-card|createObjectURL|navigator\.share|["']card-bg/, 'kodu karty w module nie ma (nazwa funkcji tylko w komentarzu)');
  assert.equal((MODUL.match(/\.otworz\(/g) || []).length, 1);
  assert.match(MODUL, /ostatniHtml\(l\[0\] \|\| null, undefined, kartaWpisu\(l\[0\], true\)\)/);
  assert.match(MODUL, /var zKarta = kartaWpisu\(wpis, false\);/);
  assert.ok(plain(strona().B.ETAPY).includes('karta-dnia'));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'supabase/functions/share-card/index.ts')));
});
