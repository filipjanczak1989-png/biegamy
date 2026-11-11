/* BLIZNA 226 / ZRZUT WPŁATY NA STARSZYCH ANDROIDACH (12.11.2026, F). Diagnostyka kind firma-plik z 10–11.11 (jeden telefon, Android 10, Chrome 157):
   NotReadableError przy odczycie 81–597 KB jpg, także po ponowieniu po 300 ms, oraz „nie da się otworzyć jako obrazu” przy poprawnych wymiarach
   (ucięty odczyt dekodowany jako całość). Reguły (decyzja 12.11):
   - pierwszy odczyt Blob.arrayBuffer; przy błędzie ALBO odczycie uciętym (bajty < plik.size) drugi odczyt po 500 ms przez FileReader.readAsArrayBuffer;
   - ucięty odczyt nigdy nie idzie do dekodowania;
   - dalej nie = komunikat „Wybierz plik jeszcze raz”, błąd z `odczytPadl`, formularz czyści pole pliku (nowy uchwyt przy następnym wyborze);
   - każdy komunikat „Zrzut wpłaty: …” kończy się wyjściem awaryjnym z adresem akcji (window.BM_EMAIL_AKCJI; bez adresu zdania nie ma);
   - telemetria: `odczytano` (bajty) obok `rozmiar`, w EF na białej liście;
   - rozjazd rozmiaru (decyzja Filipa 12.11 wieczór): dwa ZGODNE krótsze odczyty = prawdziwy rozmiar, idą do dekodowania, ale formularz zgłasza
     OdczytKrotszy (etap odczyt, odczytano), a każdy błąd dekodowania niesie `odczytano` w diag; po nieudanym dekodowaniu i tak komunikat z wyjściem awaryjnym. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const WYJSCIE = ' Nie działa? Wyślij zrzut i nazwę firmy na akcja@przyklad.pl — dopiszemy ręcznie.';

const JPEG = (w, h) => { const b = new Uint8Array(64); b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0); b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], 20); return b; };
const domBlad = (nazwa) => Object.assign(new Error('x'), { name: nazwa });
/** plik: `arrayBuffer` wg listy `ab` ('ok' | nazwa błędu | liczba = tyle bajtów uciętych), `reader` wg listy `fr` tak samo. */
function plik(b, ab, fr) {
  const p = { name: 'IMG_0001.jpg', type: 'image/jpeg', size: b.length, odczytyAB: 0, odczytyFR: 0 };
  const wynik = (w) => { if (w !== 'ok' && typeof w !== 'number') throw domBlad(w); const n = typeof w === 'number' ? w : b.length; return b.buffer.slice(b.byteOffset, b.byteOffset + n); };
  p.arrayBuffer = async () => wynik((ab || [])[p.odczytyAB++] || 'ok');
  p._fr = (fr || []); return p;
}
function piaskownica(o) {
  const op = o || {};
  class FileReader {
    readAsArrayBuffer(p) { const w = p._fr[p.odczytyFR++] || 'ok'; setTimeout(() => { if (w !== 'ok' && typeof w !== 'number') { this.error = domBlad(w); this.onerror && this.onerror(); return; } const b = JPEG(10, 10); const n = typeof w === 'number' ? w : b.length; this.result = b.buffer.slice(0, n); this.onload && this.onload(); }, 0); }
  }
  const c = { Promise, Uint8Array, Uint8ClampedArray, Math, Number, String, Error, Object, Array, RegExp, TextDecoder, TextEncoder, console, setTimeout, Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, document: { createElement: () => ({ getContext: () => ({}) }) }, location: { href: 'https://biegamy.run/dla-fabianka.html' } };
  if (op.fileReader !== false) c.FileReader = FileReader;
  if (op.email) c.BM_EMAIL_AKCJI = op.email;
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(czytaj('js/logo-firmy.mjs'), c);
  return c.BM_LOGO_FIRMY;
}

test('odczyt: NotReadableError za pierwszym razem → drugi przez FileReader wchodzi; po 500 ms domyślnie', async () => {
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /var ODSTEP_PONOWIENIA = 500;/); assert.match(s, /await czekaj\(odstep == null \? ODSTEP_PONOWIENIA : odstep\);/);
  assert.match(s, /r\.readAsArrayBuffer\(plik\);/, 'druga droga przez FileReader');
  const L = piaskownica();
  const p = plik(JPEG(10, 10), ['NotReadableError'], ['ok']);
  const b = await L.czytajBajty(p, 'Zrzut wpłaty', 0);
  assert.equal(b.length, 64); assert.equal(p.odczytyAB, 1); assert.equal(p.odczytyFR, 1, 'drugi odczyt przez FileReader, nie arrayBuffer');
});

test('ucięty odczyt (bajty < plik.size) = ponowienie, nie dekodowanie; ucięty dwa razy = błąd z odczytano', async () => {
  const L = piaskownica();
  const p = plik(JPEG(10, 10), [30], ['ok']);
  const b = await L.czytajBajty(p, 'Zrzut wpłaty', 0);
  assert.equal(b.length, 64, 'po uciętym odczycie pełny z FileReader'); assert.equal(p.odczytyFR, 1);
  const z = plik(JPEG(10, 10), [30], [40]);
  const e = await L.czytajBajty(z, 'Zrzut wpłaty', 0).catch((x) => x);
  assert.match(e.message, /^Zrzut wpłaty: odczyt pliku urwał się w połowie\. Wybierz plik jeszcze raz\./);
  assert.equal(e.odczytPadl, true); assert.equal(e.diag.etap, 'odczyt'); assert.equal(e.diag.odczytano, 40); assert.equal(e.diag.rozmiar, 64);
});

test('rozjazd rozmiaru: dwa zgodne krótsze odczyty idą dalej; błąd dekodowania niesie odczytano; formularz zgłasza OdczytKrotszy osobnym kluczem', async () => {
  const L = piaskownica({ email: 'akcja@przyklad.pl' });
  const p = plik(JPEG(10, 10), [40], [40]);
  const b = await L.czytajBajty(p, 'Zrzut wpłaty', 0);
  assert.equal(b.length, 40, 'dwa odczyty po 40 B przy size 64 = plik ma 40 B'); assert.equal(p.odczytyAB, 1); assert.equal(p.odczytyFR, 1);
  const smieci = new Uint8Array(40);
  const e = await L.przygotujZrzut(plik(smieci, ['ok']), { bajty: smieci }).catch((x) => x);
  assert.ok(/^Zrzut wpłaty: /.test(e.message) && e.message.endsWith(WYJSCIE), 'po nieudanym dekodowaniu komunikat z wyjściem awaryjnym: ' + e.message);
  assert.equal(e.diag.odczytano, 40, 'odczytano w diag każdej awarii z bajtami'); assert.equal(e.diag.rozmiar, 40);
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /rozmiar: plik && plik\.size \|\| 0, odczytano: bajty \? bajty\.length : 0,/);
  const f = czytaj('js/firma-formularz.mjs');
  assert.match(f, /function zapamietajOdczyt\(plik, bajty\) \{ try \{ plik\._bmOdczytano = bajty\.length; \} catch \(_\) \{\} \}/);
  assert.equal((f.match(/\n\s*zapamietajOdczyt\(plik, bajty\);/g) || []).length, 2, 'logo i zrzut zapamiętują długość odczytu');
  assert.match(f, /if \(plik\._bmOdczytano != null && plik\.size > 0 && plik\._bmOdczytano !== plik\.size\) diagnostyka\(pole, plik, \{ name: "OdczytKrotszy", message: "odczytano " \+ plik\._bmOdczytano \+ " z " \+ plik\.size \+ " B", diag: \{ etap: "odczyt", odczytano: plik\._bmOdczytano \} \}\);/);
  assert.match(f, /\+ \(e && e\.name === "OdczytKrotszy" \? ":krotszy" : ""\)/, 'zgłoszenie krótszego odczytu nie blokuje zgłoszenia awarii tego samego pliku');
});

test('dwa razy odmowa: instrukcja, odczytPadl, bez FileReadera zapas przez arrayBuffer', async () => {
  const L = piaskownica();
  const z = plik(JPEG(10, 10), ['NotReadableError'], ['NotReadableError']);
  const e = await L.czytajBajty(z, 'Zrzut wpłaty', 0).catch((x) => x);
  assert.equal(e.message, 'Zrzut wpłaty: ' + L.TELEFON_NIE_POZWOLIL); assert.equal(e.odczytPadl, true); assert.equal(e.diag.odczytano, 0);
  const L2 = piaskownica({ fileReader: false });
  const p = plik(JPEG(10, 10), ['NotReadableError', 'ok']);
  assert.equal((await L2.czytajBajty(p, 'Logo', 0)).length, 64); assert.equal(p.odczytyAB, 2, 'bez FileReadera drugi odczyt arrayBuffer');
});

test('wyjście awaryjne: każdy komunikat „Zrzut wpłaty: …” kończy się zdaniem z adresem akcji; bez adresu nic; „Logo:” bez zdania', async () => {
  const L = piaskownica({ email: 'akcja@przyklad.pl' });
  assert.equal(L.wyjscieAwaryjne('Zrzut wpłaty'), WYJSCIE); assert.equal(L.wyjscieAwaryjne('Logo'), '');
  const e = await L.czytajBajty(plik(JPEG(10, 10), ['NotReadableError'], ['NotReadableError']), 'Zrzut wpłaty', 0).catch((x) => x);
  assert.ok(e.message.endsWith(WYJSCIE), e.message);
  const l = await L.czytajBajty(plik(JPEG(10, 10), ['NotReadableError'], ['NotReadableError']), 'Logo', 0).catch((x) => x);
  assert.ok(!l.message.includes('dopiszemy'), 'logo bez wyjścia awaryjnego');
  const pdf = new Uint8Array(64); pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 0);   // %PDF-1.4
  const ePdf = await L.przygotujZrzut(plik(pdf, ['ok']), {}).catch((x) => x);
  assert.ok(/^Zrzut wpłaty: to plik PDF\./.test(ePdf.message) && ePdf.message.endsWith(WYJSCIE), ePdf.message);
  const s = czytaj('js/logo-firmy.mjs');
  assert.equal((s.match(/new Error\("Zrzut wpłaty:/g) || []).length, 1, 'jedyne surowe new Error("Zrzut wpłaty:") to definicja bladZrzutu; reszta komunikatów przez bladZrzutu (z wyjściem awaryjnym)');
  assert.equal(piaskownica().wyjscieAwaryjne('Zrzut wpłaty'), '', 'bez adresu akcji zdania nie ma');
});

test('formularz: po dwukrotnej odmowie pole pliku wyczyszczone (nowy uchwyt), komunikat zostaje; diagnostyka niesie odczytano; EF ma je na białej liście', () => {
  const f = czytaj('js/firma-formularz.mjs');
  assert.match(f, /if \(e && e\.odczytPadl\) \{ try \{ var inp = pole === "logo" \? logo : zrzut; if \(inp\) inp\.value = ""; \} catch \(_\) \{\} gotowe\[pole\] = null; \}/);
  assert.match(f, /dane\.append\("odczytano", String\(d\.odczytano \|\| 0\)\);/);
  assert.match(f, /"Zrzut wpłaty: nie udało się przygotować pliku\." \+ awaryjne\(\)/);
  assert.match(f, /Zrzut wpłaty: nie udało się przygotować pliku\. Zrób zrzut ekranu potwierdzenia \(PNG albo JPG\)\." \+ awaryjne\(\)/);
  const ef = czytaj('supabase/functions/_shared/firma-obsluga.mjs');
  assert.match(ef, /odczytano: Number\(pole\("odczytano", 12\)\) \|\| 0,/);
});
