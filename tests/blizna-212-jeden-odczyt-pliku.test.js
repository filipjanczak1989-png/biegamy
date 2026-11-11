/* BLIZNA 212 / JEDEN ODCZYT PLIKU Z TELEFONU (produkcja 10.11, Samsung, Chrome 157, Android 10). Po wybraniu zrzutu wpłaty formularz cegiełki pokazał surowe
   „NotReadableError: The requested file could not be read…”; diagnostyka (kind firma-plik) pokazała dwa wzorce: odczyt bajtów pada od razu albo bajty wchodzą,
   a dekodowanie przez Image pada, bo adres z URL.createObjectURL(plik) czytał plik z dysku drugi raz. Reguły:
   - bajty czyta się raz, od razu po wybraniu (czytajBajty), z jedną automatyczną ponowną próbą (300 ms do 12.11, od F: 500 ms przez FileReader); przygotowanie, podgląd i droga awaryjna pracują na kopii w pamięci;
   - NotReadableError, NotFoundError i SecurityError z odczytu = komunikat po polsku z instrukcją, z przedrostkiem „Logo:” albo „Zrzut wpłaty:”, w firmie i w cegiełce;
   - dekodowanie (createImageBitmap i Image) dostaje Blob z bajtów, nigdy plik;
   - diagnostyka niesie etap (odczyt / dekodowanie) i nazwę błędu przeglądarki;
   - po wybraniu innego pliku komunikat znika, a „Wyślij” wraca. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const TELEFON = 'Telefon nie pozwolił odczytać tego pliku. Wybierz go jeszcze raz z Galerii albo Moich plików (nie z „Ostatnie” ani z chmury). Jeśli dalej nie działa, zrób zrzut ekranu tego zdjęcia i wybierz zrzut.';

const JPEG = (w, h) => { const b = new Uint8Array(64); b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0); b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], 20); return b; };
const domBlad = (nazwa) => Object.assign(new Error(nazwa === 'NotReadableError' ? 'The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.' : 'x'), { name: nazwa });
/** Plik, który liczy odczyty; `pada` = lista wyników kolejnych odczytów: 'ok' albo nazwa błędu DOM. */
function plik(b, pada, nazwa, typ) {
  const p = { name: nazwa || 'IMG_0001.jpg', type: typ || 'image/jpeg', size: b.length, odczyty: 0 };
  p.arrayBuffer = async () => { const w = (pada || [])[p.odczyty++] || 'ok'; if (w !== 'ok') throw domBlad(w); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  return p;
}
/** logo-firmy.mjs w piaskownicy jak w blizna-208; zapisuje, CO dostało createImageBitmap i Image (plik czy Blob). */
function piaskownica(o) {
  const op = o || {}, zrodla = [];
  const ctx2d = () => ({ imageSmoothingQuality: '', drawImage() {}, fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), fillStyle: '' });
  class Blob { constructor(czesci, opcje) { this.czesci = czesci; this.type = (opcje && opcje.type) || ''; this.size = czesci.reduce((s, x) => s + (x.byteLength || x.length || 0), 0); } }
  const c = { Promise, Uint8Array, Uint8ClampedArray, Math, Number, String, Error, Object, Array, RegExp, TextDecoder, TextEncoder, console, setTimeout, Blob,
    URL: { createObjectURL: (z) => { zrodla.push(['image', z]); return 'blob:x'; }, revokeObjectURL() {} },
    document: { createElement: (t) => ({ tag: t, width: 0, height: 0, getContext: () => ctx2d(), toBlob: (cb, typ) => cb({ size: 1000, type: typ }) }) },
    location: { href: 'https://biegamy.run/dla-fabianka.html' } };
  if (op.bitmapa !== false) c.createImageBitmap = (z, opcje) => { zrodla.push(['bitmapa', z]); if (op.bitmapa === 'pada') return Promise.reject(new Error('InvalidStateError')); const sk = opcje.resizeWidth ? opcje.resizeWidth / op.szer : opcje.resizeHeight ? opcje.resizeHeight / op.wys : 1; return Promise.resolve({ width: Math.round(op.szer * sk), height: Math.round(op.wys * sk), close() {} }); };
  c.Image = class { set src(v) { setTimeout(() => { if (op.obrazPada) this.onerror(new Error('dekodowanie')); else { this.naturalWidth = op.szer; this.naturalHeight = op.wys; this.onload(); } }, 0); } };
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(czytaj('js/logo-firmy.mjs'), c);
  return { L: c.BM_LOGO_FIRMY, zrodla, Blob };
}

test('czytajBajty: pierwszy odczyt pada, drugi po przerwie wchodzi; dwa razy pada = komunikat po polsku z przedrostkiem i etapem odczyt', async () => {
  const { L } = piaskownica({ szer: 1, wys: 1 });
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /await czekaj\(odstep == null \? ODSTEP_PONOWIENIA : odstep\);/, 'ponowna próba po ODSTEP_PONOWIENIA (500 ms od F, 12.11; było 300)');
  assert.equal(L.TELEFON_NIE_POZWOLIL, TELEFON);
  const p = plik(JPEG(10, 10), ['NotReadableError', 'ok']);
  const b = await L.czytajBajty(p, 'Logo', 0);
  assert.equal(b.length, 64); assert.equal(p.odczyty, 2, 'awaria + jedna ponowna próba');
  for (const [nazwa, prefiks] of [['NotReadableError', 'Logo'], ['NotFoundError', 'Zrzut wpłaty'], ['SecurityError', 'Logo']]) {
    const z = plik(JPEG(10, 10), [nazwa, nazwa]);
    const e = await L.czytajBajty(z, prefiks, 0).catch((x) => x);
    assert.equal(e.message, prefiks + ': ' + TELEFON, nazwa + ': instrukcja, nie surowy tekst przeglądarki');
    assert.equal(z.odczyty, 2, nazwa + ': dokładnie dwie próby'); assert.equal(e.diag.etap, 'odczyt'); assert.match(e.diag.przyczyna, new RegExp('^' + nazwa + ': '));
    assert.equal(e.diag.rozmiar, 64); assert.equal(e.diag.rozszerzenie, 'jpg'); assert.equal(e.diag.wymiary, null, 'bez bajtów nie ma wymiarów');
  }
  const inny = await L.czytajBajty(plik(JPEG(10, 10), ['TypeError', 'TypeError']), 'Zrzut wpłaty', 0).catch((x) => x);
  assert.equal(inny.message, 'Zrzut wpłaty: nie udało się odczytać pliku. Wybierz plik jeszcze raz. Zrób zrzut ekranu potwierdzenia (PNG albo JPG).', 'inny błąd odczytu: zwykła prośba z „Wybierz plik jeszcze raz” (F, 12.11), bo instrukcja o Galerii by nie pomogła');
  assert.equal(inny.diag.przyczyna, 'TypeError: x');
});

test('przygotuj / przygotujZrzut: bajty raz; dekodowanie z kopii w pamięci (Blob), nigdy z pliku; odmowa odczytu w panelu z tą samą instrukcją', async () => {
  const d = piaskownica({ szer: 4000, wys: 3000 });
  const p1 = plik(JPEG(4000, 3000));
  await d.L.przygotujZrzut(p1);
  assert.equal(p1.odczyty, 1, 'bez opcje.bajty: jeden odczyt');
  assert.equal(d.zrodla.length, 1); assert.equal(d.zrodla[0][0], 'bitmapa'); assert.ok(d.zrodla[0][1] instanceof d.Blob, 'createImageBitmap dostaje Blob'); assert.notEqual(d.zrodla[0][1], p1);
  assert.equal(d.zrodla[0][1].type, 'image/jpeg'); assert.equal(d.zrodla[0][1].size, 64, 'Blob z tych samych bajtów');
  const p2 = plik(JPEG(4000, 3000));
  const bajty = await d.L.czytajBajty(p2, 'Zrzut wpłaty', 0);
  await d.L.przygotujZrzut(p2, { bajty });
  assert.equal(p2.odczyty, 1, 'z opcje.bajty: przygotowanie nie czyta pliku drugi raz');
  const f = piaskownica({ szer: 4000, wys: 3000, bitmapa: 'pada' });
  const p3 = plik(JPEG(4000, 3000));
  await f.L.przygotuj(p3, { pdf: false, bajty: await f.L.czytajBajty(p3, 'Logo', 0) });
  assert.equal(p3.odczyty, 1, 'stara droga przez Image też bez drugiego odczytu');
  assert.deepEqual(f.zrodla.map((z) => z[0]), ['bitmapa', 'image']); assert.ok(f.zrodla[1][1] instanceof f.Blob, 'Image dostaje adres Bloba z bajtów'); assert.notEqual(f.zrodla[1][1], p3);
  const s = czytaj('js/logo-firmy.mjs');
  assert.doesNotMatch(s, /createObjectURL\(plik\)|createImageBitmap\(plik/, 'nic nie dekoduje pliku z dysku');
  assert.match(s, /svg \? new Blob\(\[bajty\], \{ type: "image\/svg\+xml" \}\) : new Blob\(\[bajty\]/);
  const e = await d.L.przygotuj(plik(JPEG(10, 10), ['NotReadableError', 'NotReadableError'], 'logo.jpg'), {}).catch((x) => x);
  assert.equal(e.message, 'Logo: ' + TELEFON, 'panel trenera (przygotuj bez bajtów): ta sama instrukcja');
  const e2 = await d.L.przygotujZrzut(plik(JPEG(10, 10), ['SecurityError', 'SecurityError'])).catch((x) => x);
  assert.equal(e2.message, 'Zrzut wpłaty: ' + TELEFON);
});

test('formularz: logo i zrzut czytane raz, kopia zamiast pliku; po odmowie komunikat z instrukcją i zablokowany „Wyślij”, inny plik odblokowuje; diagnostyka z etapem', async () => {
  const { L } = piaskownica({ szer: 1, wys: 1 });
  const wyslane = [], F = czytaj('js/firma-formularz.mjs');
  const c = { Promise, Uint8Array, Object, String, Number, Math, Error, RegExp, JSON, console, setTimeout, clearTimeout, Blob, SB_URL: 'https://sb', SB_KEY: 'k',
    fetch: (u, o) => { wyslane.push(Object.fromEntries(o.body.p)); return Promise.resolve({ ok: true, status: 200, text: async () => '{"ok":true}' }); },
    FormData: class { constructor() { this.p = []; } append(k, v) { this.p.push([k, v]); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    BM_LOGO_FIRMY: { czytajBajty: L.czytajBajty, przygotuj: (p, o) => Promise.resolve({ blob: { size: 10, type: 'image/webp', bajty: o.bajty } }), przygotujZrzut: (p, o) => Promise.resolve({ size: 10, type: 'image/webp', bajty: o.bajty }) },
    BM_AKCJA: { zUlica: () => {}, dopelniacz: (x) => x }, BM_MODERACJA: { sprawdz: () => ({ ok: true }), komunikat: () => '' } };
  const el = (tag) => { const e = { tag, children: [], attrs: {}, style: {}, files: [], value: '', hidden: false, disabled: false, textContent: '', listeners: {}, appendChild(x) { this.children.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, querySelector() { return null; }, removeChild() {}, scrollIntoView() {} }; Object.defineProperty(e, 'firstChild', { get() { return null; } }); return e; };
  c.document = { createElement: el, getElementById: () => null, head: el('head') };
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(F, c);
  const sekcja = el('section'); sekcja.querySelector = () => null;
  c.BM_FIRMA_FORMULARZ.zamontuj(sekcja, { wystartowala: true, firmy_zgloszenia: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000, imie: 'Marek' });
  const wszystkie = []; (function zbierz(e) { wszystkie.push(e); (e.children || []).forEach(zbierz); })(sekcja);
  const logo = wszystkie.find((e) => e.name === 'ff-logo'), zrzut = wszystkie.find((e) => e.name === 'ff-zrzut'), wyslij = wszystkie.find((e) => e.tag === 'button' && e.type === 'submit'), info = wszystkie.find((e) => e.className === 'ff-info'), kFirma = wszystkie.find((e) => e.value === 'firma'), kOsoba = wszystkie.find((e) => e.value === 'osoba');
  assert.ok(logo && zrzut && wyslij && info && kFirma && kOsoba, 'pola formularza');
  const zmiana = (pole, p) => { pole.files = p ? [p] : []; pole.listeners.change.forEach((f) => f()); };
  const odczekaj = (ms) => new Promise((r) => setTimeout(r, ms));
  /* cegiełka (osoba): zrzut z galerii, którego telefon nie daje odczytać */
  kOsoba.checked = true; kFirma.checked = false; kOsoba.listeners.change.forEach((f) => f());
  const zly = plik(JPEG(720, 1600), ['NotReadableError', 'NotReadableError'], 'Screenshot_1.jpg');
  const t0 = Date.now(); zmiana(zrzut, zly); await odczekaj(620);
  assert.equal(zly.odczyty, 2, 'odczyt + jedna ponowna próba (bez FileReadera w piaskownicy: arrayBuffer)'); assert.ok(Date.now() - t0 >= 500);
  assert.equal(wyslij.disabled, true, 'odmowa odczytu zrzutu = „Wyślij” zablokowany'); assert.equal(info.textContent, 'Zrzut wpłaty: ' + TELEFON);
  assert.equal(wyslane.length, 1, 'diagnostyka raz');
  assert.equal(wyslane[0].pole, 'zrzut'); assert.equal(wyslane[0].etap, 'odczyt'); assert.match(wyslane[0].przyczyna, /^NotReadableError: The requested file could not be read/); assert.equal(wyslane[0].wymiary, '', 'bez bajtów nie ma wymiarów');
  assert.equal(wyslane[0].blad, 'Error: Zrzut wpłaty: ' + TELEFON);
  /* ten sam plik wybrany drugi raz z Galerii: nowy obiekt File, tym razem czytelny */
  const dobry = plik(JPEG(720, 1600), [], 'Screenshot_1.jpg');
  zmiana(zrzut, dobry); await odczekaj(20);
  assert.equal(dobry.odczyty, 1, 'dobry plik: dokładnie jeden odczyt'); assert.equal(wyslij.disabled, false, 'inny plik = „Wyślij” wraca'); assert.equal(info.textContent, '', 'komunikat znika');
  assert.equal(wyslane.length, 1, 'bez diagnostyki przy powodzeniu');
  /* firma: logo, odczyt pada pierwszy raz, druga próba po 500 ms wchodzi; przygotuj dostaje te same bajty, pliku nie czyta */
  kOsoba.checked = false; kFirma.checked = true; kFirma.listeners.change.forEach((f) => f());
  const chwiejne = plik(JPEG(300, 120), ['NotReadableError', 'ok'], 'logo.jpg');
  zmiana(logo, chwiejne); await odczekaj(620);
  assert.equal(chwiejne.odczyty, 2); assert.equal(wyslij.disabled, false, 'druga próba wystarczyła: bez komunikatu'); assert.equal(info.textContent, ''); assert.equal(wyslane.length, 1);
  /* firma: logo, którego nie da się odczytać; potem inne logo */
  const zleLogo = plik(JPEG(300, 120), ['NotFoundError', 'NotFoundError'], 'logo2.jpg');
  zmiana(logo, zleLogo); await odczekaj(620);
  assert.equal(wyslij.disabled, true); assert.equal(info.textContent, 'Logo: ' + TELEFON); assert.equal(wyslane.length, 2); assert.equal(wyslane[1].pole, 'logo'); assert.equal(wyslane[1].etap, 'odczyt'); assert.equal(wyslane[1].przyczyna, 'NotFoundError: x');
  zmiana(logo, plik(JPEG(300, 120), [], 'logo3.jpg')); await odczekaj(20);
  assert.equal(wyslij.disabled, false); assert.equal(info.textContent, '');
  /* droga awaryjna w formularzu: kopia bajtów, nigdy plik */
  const Fm = c.BM_FIRMA_FORMULARZ, pada = { czytajBajty: L.czytajBajty, przygotuj: () => Promise.reject(new Error('Logo: awaria')), przygotujZrzut: () => Promise.reject(new Error('Zrzut wpłaty: awaria')) };
  c.BM_LOGO_FIRMY = pada;
  const p = plik(JPEG(10, 10)), k1 = await Fm.logoDoWyslania(p), k2 = await Fm.zrzutDoWyslania(p);
  assert.ok(k1 instanceof Blob && k2 instanceof Blob, 'kopia w pamięci'); assert.equal(k1.type, 'image/jpeg'); assert.equal(k1.size, 64); assert.equal(p.odczyty, 2, 'dwie bramki = dwa wołania, każde czyta raz');
  assert.doesNotMatch(F, /return plik;|plik\.slice\(|typSurowy/, 'formularz nie oddaje pliku z dysku i nie czyta go po kawałku');
});

test('funkcja firma-zgloszenie: etap w diagnostyce (do 12 znaków)', async () => {
  const O = czytaj('supabase/functions/_shared/firma-obsluga.mjs');
  assert.match(O, /etap: pole\("etap", 12\)/);
});
