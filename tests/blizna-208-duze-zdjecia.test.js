/* BLIZNA 208 / DUŻE ZDJĘCIA Z TELEFONU W FORMULARZU FIRMY (Filip 10.11, A2). Zwiad 10.11: tester z Samsunga nie wysłał zgłoszenia z JPG 4 MB, a formularz pokazał
   tylko ogólny komunikat; przyczyny nie dało się odczytać, bo client_errors przyjmuje wpisy tylko od zalogowanych.
   - dekodowanie: najpierw createImageBitmap z resizeWidth/resizeHeight (≤ 1600 po dłuższym boku z nagłówka pliku) i imageOrientation 'from-image';
     dopiero gdy rzuci albo go nie ma, stara droga przez Image; SVG zawsze przez Image;
   - logo i zrzut przygotowane przy wyborze pliku; gdy przygotowanie padnie, „Wyślij” zablokowane z komunikatem, a do sieci nie idzie nic, co nie przeszło bramki;
   - diagnostyka awarii (bez pliku) do client_errors przez funkcję firma-zgloszenie (rodzaj=diagnostyka, kind firma-plik), bez RPC limitu, najwyżej 5/h z adresu;
   - spec plików bez zmian: logo 400 px WebP (Safari PNG), zrzut 1600 px WebP, serwer bez zmian limitu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

const PNG = (w, h) => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const JPEG = (w, h) => { const b = new Uint8Array(64); b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0); b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], 20); return b; };
const WEBP = (w, h) => { const b = new Uint8Array(40); b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0); const a = w - 1, c = h - 1; b.set([a & 255, (a >> 8) & 255, (a >> 16) & 255, c & 255, (c >> 8) & 255, (c >> 16) & 255], 24); return b; };
const HEIC = () => { const b = new Uint8Array(40); b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0); return b; };
const plik = (b, nazwa, typ, rozmiar) => ({ name: nazwa || 'x.bin', type: typ || '', size: rozmiar || b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });

/** logo-firmy.mjs w piaskownicy: canvas, Image i createImageBitmap udawane; zapisuje, z jakimi opcjami poszło dekodowanie. */
function piaskownica(o) {
  const op = o || {}, wywolania = [], canvasy = [];
  const ctx2d = () => ({ imageSmoothingQuality: '', drawImage() {}, fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), fillStyle: '' });
  const c = { Promise, Uint8Array, Uint8ClampedArray, Math, Number, String, Error, Object, Array, RegExp, TextDecoder, TextEncoder, console, setTimeout,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class { constructor(p, b) { this.type = b && b.type; } },
    document: { createElement: (t) => { const k = { tag: t, width: 0, height: 0, getContext: () => ctx2d(), toBlob: (cb, typ) => cb({ size: 1000, type: typ }) }; canvasy.push(k); return k; } },
    location: { href: 'https://biegamy.run/dla-fabianka.html' } };
  if (op.bitmapa === 'pada') c.createImageBitmap = (p, opcje) => { wywolania.push(opcje); return Promise.reject(new Error('InvalidStateError')); };
  else if (op.bitmapa !== false) c.createImageBitmap = (p, opcje) => { wywolania.push(opcje); const sk = opcje.resizeWidth ? opcje.resizeWidth / op.szer : opcje.resizeHeight ? opcje.resizeHeight / op.wys : 1; return Promise.resolve({ width: Math.round(op.szer * sk), height: Math.round(op.wys * sk), close() { wywolania.push('close'); } }); };
  c.Image = class { set src(v) { setTimeout(() => { if (op.obrazPada) this.onerror(new Error('dekodowanie')); else { this.naturalWidth = op.szer; this.naturalHeight = op.wys; this.onload(); } }, 0); } };
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(czytaj('js/logo-firmy.mjs'), c);
  return { L: c.BM_LOGO_FIRMY, wywolania, canvasy };
}

test('wymiary z nagłówka PNG, JPEG (po APP0) i WebP VP8X; śmieci = null', () => {
  const { L } = piaskownica({ szer: 1, wys: 1 });
  assert.deepEqual({ ...L.wymiaryZNaglowka(PNG(300, 120)) }, { w: 300, h: 120 });
  assert.deepEqual({ ...L.wymiaryZNaglowka(JPEG(4000, 3000)) }, { w: 4000, h: 3000 });
  assert.deepEqual({ ...L.wymiaryZNaglowka(WEBP(1200, 800)) }, { w: 1200, h: 800 });
  assert.equal(L.wymiaryZNaglowka(new Uint8Array(40)), null); assert.equal(L.wymiaryZNaglowka(HEIC()), null);
});

test('createImageBitmap zmniejsza przy dekodowaniu po dłuższym boku z EXIF; małe bez resize; SVG przez Image; awaria albo brak → Image', async () => {
  const d = piaskownica({ szer: 4000, wys: 3000 });
  let k = await d.L.obrazNaCanvas(plik(JPEG(4000, 3000), 'zdjecie.jpg', 'image/jpeg'), JPEG(4000, 3000), 'obraz', 1600);
  assert.deepEqual({ ...d.wywolania[0] }, { imageOrientation: 'from-image', resizeQuality: 'high', resizeWidth: 1600 }, 'poziome: resizeWidth, bez pełnej bitmapy 12 Mpx');
  assert.deepEqual([k.width, k.height, k.droga], [1600, 1200, 'bitmapa']); assert.equal(d.wywolania[1], 'close', 'bitmapa zwolniona');
  const p = piaskownica({ szer: 3000, wys: 4000 });
  k = await p.L.obrazNaCanvas(plik(JPEG(3000, 4000)), JPEG(3000, 4000), 'obraz', 1600);
  assert.deepEqual({ ...p.wywolania[0] }, { imageOrientation: 'from-image', resizeQuality: 'high', resizeHeight: 1600 }, 'pionowe: resizeHeight'); assert.deepEqual([k.width, k.height], [1200, 1600]);
  const m = piaskownica({ szer: 300, wys: 120 });
  k = await m.L.obrazNaCanvas(plik(PNG(300, 120)), PNG(300, 120), 'obraz', 1600);
  assert.deepEqual({ ...m.wywolania[0] }, { imageOrientation: 'from-image', resizeQuality: 'high' }, 'małe logo: tylko obrót z EXIF'); assert.deepEqual([k.width, k.height], [300, 120]);
  const n = piaskownica({ szer: 5000, wys: 5000 });
  k = await n.L.obrazNaCanvas(plik(new Uint8Array([1, 2, 3]), 'x.bin'), new Uint8Array([1, 2, 3]), '', 1600);
  assert.deepEqual({ ...n.wywolania[0] }, { imageOrientation: 'from-image', resizeQuality: 'high' }, 'bez wymiarów z nagłówka: bez resize'); assert.deepEqual([k.width, k.height], [1600, 1600], 'ale canvas i tak ≤ 1600');
  const s = piaskownica({ szer: 200, wys: 100 });
  k = await s.L.obrazNaCanvas(plik(new TextEncoder().encode('<svg width="200" height="100"></svg>')), new TextEncoder().encode('<svg width="200" height="100"></svg>'), 'svg', 1600);
  assert.equal(s.wywolania.length, 0, 'SVG zawsze przez Image'); assert.equal(k.droga, 'obraz'); assert.deepEqual([k.width, k.height], [800, 400]);
  const f = piaskownica({ szer: 4000, wys: 3000, bitmapa: 'pada' });
  k = await f.L.obrazNaCanvas(plik(JPEG(4000, 3000)), JPEG(4000, 3000), 'obraz', 1600);
  assert.deepEqual([k.width, k.height, k.droga], [1600, 1200, 'obraz'], 'createImageBitmap rzuca → stara droga');
  const b = piaskownica({ szer: 4000, wys: 3000, bitmapa: false });
  k = await b.L.obrazNaCanvas(plik(JPEG(4000, 3000)), JPEG(4000, 3000), 'obraz', 1600);
  assert.deepEqual([k.width, k.height, k.droga], [1600, 1200, 'obraz'], 'bez createImageBitmap → stara droga');
});

test('awaria przygotowania niesie diagnostykę bez pliku: rodzaj, rozmiar, typ, rozszerzenie, wymiary, przyczyna; spec plików bez zmian', async () => {
  const { L } = piaskownica({ szer: 1, wys: 1, bitmapa: 'pada', obrazPada: true });
  const e = await L.przygotuj(plik(HEIC(), 'IMG_0001.HEIC', 'image/heic', 3400000), { pdf: false }).catch((x) => x);
  assert.match(e.message, /^Logo: zdjęcia HEIC ta przeglądarka nie otworzy/);
  assert.deepEqual({ ...e.diag, wymiary: e.diag.wymiary }, { etap: 'dekodowanie', rodzaj: 'heic', rozmiar: 3400000, odczytano: 40, typ: 'image/heic', rozszerzenie: 'heic', wymiary: null, przyczyna: 'dekodowanie' });   // odczytano: F 12.11 (atrapa HEIC ma 40 B)
  const e2 = await L.przygotujZrzut(plik(JPEG(4000, 3000), 'zdjecie.jpg', 'image/jpeg', 4100000)).catch((x) => x);
  assert.match(e2.message, /^Zrzut wpłaty: tego pliku nie da się otworzyć/); assert.deepEqual({ ...e2.diag.wymiary }, { w: 4000, h: 3000 }); assert.equal(e2.diag.rozszerzenie, 'jpg');
  const e3 = await L.przygotujZrzut(plik(new TextEncoder().encode('%PDF-1.4 x'), 'p.pdf', 'application/pdf')).catch((x) => x);
  assert.equal(e3.diag.rodzaj, 'pdf'); assert.equal(e3.diag.przyczyna, '');
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /var BOK = 400, WEJSCIE_MAKS = 25 \* 1024 \* 1024, ETAP_BOK = 1600, ZRZUT_BOK = 1600/, 'spec plików bez zmian');
  assert.match(s, /k\.toBlob\(ok, "image\/webp", JAKOSC\)/); assert.match(s, /\["image\/webp", 0\.85\], \["image\/webp", 0\.7\]/);
  assert.equal(czytaj('supabase/functions/_shared/firma-zgloszenie.mjs').match(/LOGO_BOK = (\d+)/)[1], '400', 'bez zmiany limitu funkcji');
});

test('formularz: pliki przez bramkę przy wyborze, „Wyślij” zablokowane po awarii, oryginał nigdy obok bramki, diagnostyka bez pliku', () => {
  const F = czytaj('js/firma-formularz.mjs'), fo = F.slice(F.indexOf('function formularz(s, d)'), F.indexOf('function cegielka(s, adres)'));
  assert.equal((fo.match(/\b(logoDoWyslania|zrzutDoWyslania)\(/g) || []).length, 0, 'w formularzu żadnego bezpośredniego wołania: tylko przez przygotowany()');
  assert.match(fo, /zadanie = przygotowany\("zrzut", zrzut\.files\[0\], zrzutDoWyslania\)/); assert.match(fo, /Promise\.all\(\[przygotowany\("logo", logo\.files\[0\], logoDoWyslania\), przygotowany\("zrzut", zrzut\.files\[0\], zrzutDoWyslania\)\]\)/);
  assert.match(fo, /zrzut\.addEventListener\("change", function \(\) \{ if \(zrzut\.files\[0\]\) przygotowany\("zrzut", zrzut\.files\[0\], zrzutDoWyslania\)\.catch/, 'zrzut przygotowany od razu po wyborze');
  assert.match(fo, /if \(w && w\.plik === plik\) return w\.obietnica;/, 'ten sam plik = ten sam blob dla podglądu i wysyłki');
  assert.match(fo, /wyslij\.disabled = !!blad;/); assert.match(fo, /e\.preventDefault\(\);\n\s*if \(wyslij\.disabled\) return;/, 'Enter też nie wysyła przy zablokowanym przycisku');
  assert.match(fo, /if \(\/\^\(Logo\|Zrzut\)\/\.test\(tresc\)\) \{ info\.textContent = tresc; odblokuj\(\); return; \}/, 'po awarii pliku przycisk zostaje zablokowany');
  const dg = fo.slice(fo.indexOf('function diagnostyka(pole, plik, e)'), fo.indexOf('zrzut.addEventListener("change"'));
  assert.match(dg, /dane\.append\("rodzaj", "diagnostyka"\)/); assert.match(dg, /keepalive: true/);
  assert.doesNotMatch(dg, /append\("(logo|zrzut|nazwa|name)"|append\([^)]*plik\.name|arrayBuffer/, 'diagnostyka bez pliku i bez nazwy pliku (nazwa służy tylko jako klucz „raz na plik” w przeglądarce)');
  for (const p of ['pole', 'etap', 'blad', 'przyczyna', 'rozmiar', 'typ', 'rozszerzenie', 'rodzaj_pliku', 'wymiary']) assert.match(dg, new RegExp('dane\\.append\\("' + p + '"'));
  assert.match(dg, /Object\.keys\(zgloszone\)\.length >= 5/, 'najwyżej 5 zgłoszeń diagnostyki na stronę');
  /* zachowanie bramki w piaskownicy: przygotowanie pada → odblokuj() blokuje przycisk, diagnostyka idzie raz, inny plik odblokowuje */
  const wyslane = [], c = { Promise, Uint8Array, Object, String, Number, Math, Error, RegExp, JSON, console, setTimeout, clearTimeout, SB_URL: 'https://sb', SB_KEY: 'k',
    fetch: (u, o) => { wyslane.push([u, o]); return Promise.resolve({ ok: true, status: 200, text: async () => '{"ok":true}' }); },
    FormData: class { constructor() { this.p = []; } append(k, v) { this.p.push([k, v]); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    BM_LOGO_FIRMY: { przygotuj: () => Promise.reject(Object.assign(new Error('Logo: tego pliku nie da się otworzyć jako obrazu. Wyślij logo jako PNG lub JPG.'), { diag: { etap: 'dekodowanie', rodzaj: 'obraz', rozmiar: 4100000, typ: 'image/jpeg', rozszerzenie: 'jpg', wymiary: { w: 4000, h: 3000 }, przyczyna: 'dekodowanie' } })), przygotujZrzut: () => Promise.resolve({ size: 10, type: 'image/webp' }) },
    BM_AKCJA: { zUlica: () => {}, dopelniacz: (x) => x }, BM_MODERACJA: { sprawdz: () => ({ ok: true }), komunikat: () => '' } };
  const el = (tag) => { const e = { tag, children: [], attrs: {}, style: {}, files: [], value: '', hidden: false, disabled: false, textContent: '', listeners: {}, appendChild(x) { this.children.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, querySelector() { return null; }, removeChild() {}, scrollIntoView() {} }; Object.defineProperty(e, 'firstChild', { get() { return null; } }); return e; };
  c.document = { createElement: el, getElementById: () => null, head: el('head') };
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(F, c);
  const sekcja = el('section'); sekcja.querySelector = () => null;
  c.BM_FIRMA_FORMULARZ.zamontuj(sekcja, { wystartowala: true, firmy_zgloszenia: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000, imie: 'Marek' });
  const wszystkie = []; (function zbierz(e) { wszystkie.push(e); (e.children || []).forEach(zbierz); })(sekcja);
  const logo = wszystkie.find((e) => e.name === 'ff-logo'), wyslij = wszystkie.find((e) => e.tag === 'button' && e.type === 'submit'), info = wszystkie.find((e) => e.className === 'ff-info'), kFirma = wszystkie.find((e) => e.value === 'firma'), kOsoba = wszystkie.find((e) => e.value === 'osoba');
  assert.ok(logo && wyslij && info && kFirma && kOsoba, 'pola formularza');
  kOsoba.checked = false; kFirma.checked = true; kFirma.listeners.change.forEach((f) => f());   // jak prawdziwe radio: jedno zaznaczone
  const zly = { name: 'IMG.jpg', size: 4100000, type: 'image/jpeg', arrayBuffer: async () => new Uint8Array(12).buffer }; logo.files = [zly];   // bajty nieznane → droga awaryjna też odmawia
  return new Promise((r) => setTimeout(r, 5)).then(() => { logo.listeners.change.forEach((f) => f()); return new Promise((r) => setTimeout(r, 10)); }).then(() => {
    assert.equal(wyslij.disabled, true, 'awaria przygotowania logo = przycisk zablokowany'); assert.match(info.textContent, /^Logo: tego pliku nie da się otworzyć/);
    assert.equal(wyslane.length, 1, 'jedna diagnostyka'); assert.equal(wyslane[0][0], 'https://sb/functions/v1/firma-zgloszenie');
    const pola = Object.fromEntries(wyslane[0][1].body.p);
    assert.deepEqual(pola, { rodzaj: 'diagnostyka', pole: 'logo', etap: 'dekodowanie', blad: 'Error: Logo: tego pliku nie da się otworzyć jako obrazu. Wyślij logo jako PNG lub JPG.', przyczyna: 'dekodowanie', rozmiar: '4100000', odczytano: '0', typ: 'image/jpeg', rozszerzenie: 'jpg', rodzaj_pliku: 'obraz', wymiary: '4000x3000', strona_www: '' });
    logo.listeners.change.forEach((f) => f()); return new Promise((r) => setTimeout(r, 10));
  }).then(() => {
    assert.equal(wyslane.length, 1, 'ten sam plik drugi raz: bez drugiej diagnostyki i bez drugiego przygotowania');
    logo.files = []; logo.listeners.change.forEach((f) => f());
    assert.equal(wyslij.disabled, false, 'plik usunięty = przycisk wraca'); assert.equal(info.textContent, '');
  });
});

test('funkcja: diagnostyka do client_errors bez RPC limitu, bez user_id, krótkie pola, 5 na godzinę z adresu, zawsze 200; pułapka przed nią', async () => {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  const wpisy = [], rpc = [], liczniki = []; let wBazie = 0, licznikPada = false;
  const sb = { rpc: async (n) => { rpc.push(n); return { data: { ok: true } }; }, from: (t) => ({
    insert: async (w) => { wpisy.push([t, w]); wBazie++; return { error: null }; },
    select: (kol, o) => ({ eq: (k, v) => ({ gt: async (k2, od) => { liczniki.push([t, kol, o, k, v, k2, od]); return licznikPada ? { error: { message: 'brak' }, count: null } : { count: wBazie, error: null }; } }) }),
  }) };
  const dane = (nad) => { const m = new Map(Object.entries({ rodzaj: 'diagnostyka', pole: 'logo', etap: 'dekodowanie', blad: 'Error: Logo: x', przyczyna: 'dekodowanie', rozmiar: '4100000', odczytano: '0', typ: 'image/jpeg', rozszerzenie: 'jpg', rodzaj_pliku: 'obraz', wymiary: '4000x3000', strona_www: '', ...nad })); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };
  const t0 = Date.UTC(2026, 10, 10, 12, 0);
  const w = await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-d', sb, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) Samsung', teraz: t0 });
  assert.deepEqual(w, { status: 200, body: { ok: true } }); assert.deepEqual(rpc, [], 'bez akcja_firmy_wpusc: diagnostyka nie zużywa limitu');
  assert.equal(wpisy.length, 1); assert.equal(wpisy[0][0], 'client_errors');
  const z = wpisy[0][1];
  assert.equal(z.user_id, null); assert.equal(z.kind, 'firma-plik'); assert.equal(z.url, '/dla-fabianka.html#firma'); assert.match(z.user_agent, /SM-S911B/);
  assert.deepEqual(JSON.parse(z.message), { pole: 'logo', etap: 'dekodowanie', blad: 'Error: Logo: x', przyczyna: 'dekodowanie', rozmiar: 4100000, odczytano: 0, typ: 'image/jpeg', rozszerzenie: 'jpg', rodzaj_pliku: 'obraz', wymiary: '4000x3000' });
  const dlugi = await O.przyjmijZgloszenie({ dane: dane({ blad: 'x'.repeat(2000), typ: 'y'.repeat(200), pole: 'z'.repeat(50) }), ipSkrot: 'ip-e', sb, teraz: t0 });
  assert.equal(dlugi.status, 200); const o2 = JSON.parse(wpisy[1][1].message); assert.equal(o2.blad.length, 300); assert.equal(o2.typ.length, 60); assert.equal(o2.pole.length, 10);
  for (let i = 0; i < 6; i++) await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-f', sb, teraz: t0 + i * 60000 });
  assert.equal(wpisy.filter((x) => x[1].user_agent === '').length - 1, 5, 'z jednego adresu najwyżej 5 wpisów na godzinę (szósty cicho pominięty)');
  await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-f', sb, teraz: t0 + 61 * 60000 }); assert.equal(wpisy.length, 8, 'po godzinie znowu wolno');
  const bot = await O.przyjmijZgloszenie({ dane: dane({ strona_www: 'spam' }), ipSkrot: 'ip-g', sb, teraz: t0 }); assert.deepEqual(bot, { status: 200, body: { ok: true } }); assert.equal(wpisy.length, 8, 'pułapka przed diagnostyką');
  const pada = await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-h', sb: { rpc: sb.rpc, from: () => { throw new Error('brak tabeli'); } }, teraz: t0 });
  assert.deepEqual(pada, { status: 200, body: { ok: true } }, 'awaria zapisu nie wraca do przeglądarki');
  /* sufit po stronie bazy (Filip 10.11): count(*) kind firma-plik z ostatniej godziny przed insertem; od 50 nic; odczyt padł = też nic */
  assert.deepEqual(liczniki[0], ['client_errors', 'id', { count: 'exact', head: true }, 'kind', 'firma-plik', 'created_at', new Date(t0 - 3600000).toISOString()], 'jeden count przed każdym insertem');
  wBazie = 50; const ile = wpisy.length;
  for (let i = 0; i < 3; i++) assert.equal((await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-' + i + 'x', sb, teraz: t0 })).status, 200);
  assert.equal(wpisy.length, ile, 'od 50 wpisów na godzinę nic nie dochodzi, choć adresy różne');
  wBazie = 49; await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-y', sb, teraz: t0 }); assert.equal(wpisy.length, ile + 1, '49 → jeszcze wchodzi');
  licznikPada = true; await O.przyjmijZgloszenie({ dane: dane(), ipSkrot: 'ip-z', sb, teraz: t0 }); assert.equal(wpisy.length, ile + 1, 'licznik nie odpowiada = bez insertu (sufit trzyma)'); licznikPada = false;
  assert.match(czytaj('supabase/functions/firma-zgloszenie/index.ts'), /userAgent: req\.headers\.get\("user-agent"\) \|\| ""/);
  assert.match(czytaj('supabase/functions/_shared/firma-obsluga.mjs'), /if \(f\.get\("rodzaj"\) === "diagnostyka"\) return zapiszDiagnostyke\(d\);\n\s*if \(f\.get\("rodzaj"\) === "cegielka"\)/, 'diagnostyka rozpoznana przed cegiełką i przed limitem');
});
