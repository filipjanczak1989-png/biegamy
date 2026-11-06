/* BLIZNA 185 / MUZYKA W GRZE I NA GUZIKU (Filip 6.11).
   - nic nie pobiera się przed włączeniem głośnika, poza pulsem i fanfarą na uzbrojonym guziku;
   - przed startem tło bez słów, po starcie refren na zmianę z biegniemy-razem, adresy tylko z licznika albo z funkcji próby;
   - Magazyn, rozdziały, Górka, finał, „Mur stoi!”, premiera Szefa; po rundzie dżingiel, a bez pliku dźwięk z kodu;
   - obcy adres nie gra, tajnej muzyki ani jej tekstów nie ma w repo. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const G = czytaj('js/cegielki.js'), K = czytaj('js/cegielki-konto.js'), S = czytaj('start-akcji.html'), M = czytaj('js/muzyka.js');
const SYG = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/';
const ad = (n) => SYG + n + '.mp3?token=atrapa.tok-1';

/* Atrapa WebAudio i sieci: moduł działa naprawdę, nie gra tylko dźwięk. */
const pobrane = []; const zrodla = [];
class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class Ctx {
  constructor() { this.state = 'running'; this.currentTime = 10; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return { gain: new Param(1), connect() {} }; }
  createBufferSource() { const s = { playbackRate: new Param(1), loop: false, buffer: null, onended: null, connect() {}, start() { s.gra = true; }, stop() { s.gra = false; } }; zrodla.push(s); return s; }
  decodeAudioData(b, ok) { ok({ z: b.adres }); }
}
let Z;
const czekaj = () => new Promise((r) => setTimeout(r, 15));
const ostatni = () => zrodla[zrodla.length - 1];
const gra = () => zrodla.filter((s) => s.gra).map((s) => s.buffer.z);

test.before(async () => {
  globalThis.AudioContext = Ctx;
  globalThis.fetch = async (a) => { pobrane.push(a); return { ok: true, clone() { return this; }, arrayBuffer: async () => ({ adres: a }) }; };
  await import(pathToFileURL(path.join(KORZEN, 'js/muzyka.js')).href);
  Z = globalThis.BM_MUZYKA;
});

test('adresy: tylko znane pozycje i tylko podpisane MP3 z prywatnego kubełka', () => {
  assert.deepEqual(Z.adresyZLicznika(null), {}); assert.deepEqual(Z.adresyZLicznika('x'), {});
  const w = Z.adresyZLicznika({ menu1: ad('a'), inna: ad('b'), menu2: 'https://zly.example/storage/v1/object/sign/akcja-wizerunek/a.mp3?token=a', final: SYG + 'x.mp4?token=a', mur: ad('c') + '"><script>', noc: 7 });
  assert.deepEqual(w, { menu1: ad('a') });
  assert.deepEqual(Z.listaMenu({}), [Z.PLIKI.tlo], 'przed startem pętla bez słów');
  assert.deepEqual(Z.listaMenu({ menu1: ad('a'), menu2: ad('b') }), [ad('a'), ad('b')]);
  assert.deepEqual(Z.listaMenu({ menu2: ad('b') }), [ad('b')], 'jeden plik też gra');
});

test('głośnik wyłączony: nic się nie pobiera ani nie gra', async () => {
  Z.scena('menu'); Z.ustawAdresy({ menu1: ad('a'), menu2: ad('b'), premiera: ad('p'), rower: ad('r'), noc: ad('n'), final: ad('f') });
  assert.equal(Z.jednorazowo('final'), false); assert.equal(Z.rozdzial('r11'), false); Z.gorka();
  await czekaj();
  assert.deepEqual(pobrane, [], 'żadnego pliku przed włączeniem głośnika');
  assert.deepEqual(gra(), []);
  assert.equal(Z.dzingiel('koniec'), false, 'bez głośnika gra zagra dźwięk z kodu, który też milczy');
});

test('włączony głośnik: refren i biegniemy-razem na zmianę, Magazyn, runda, rozdział, Górka', async () => {
  Z.ustawAdresy({ menu1: ad('refren'), menu2: ad('biegniemy'), magazyn: ad('magazyn'), rower: ad('rower'), noc: ad('noc'), mur: ad('mur'), final: ad('final') });
  Z.wlacz(true); await czekaj();
  assert.ok(pobrane.includes(Z.PLIKI.koniec) && pobrane.includes(Z.PLIKI.awans), 'dżingle gotowe po włączeniu');
  assert.deepEqual(gra(), [ad('refren')]);
  assert.equal(ostatni().loop, false);
  const pierwszy = ostatni(); pierwszy.gra = false; pierwszy.onended(); await czekaj();
  assert.deepEqual(gra(), [ad('biegniemy')], 'po refrenie biegniemy-razem');
  const drugi = ostatni(); drugi.gra = false; drugi.onended(); await czekaj();
  assert.deepEqual(gra(), [ad('refren')], 'i z powrotem');
  Z.scena('magazyn'); await czekaj();
  assert.deepEqual(gra(), [ad('magazyn')]); assert.equal(ostatni().loop, true, 'Magazyn w pętli');
  Z.scena('menu'); await czekaj();
  assert.deepEqual(gra(), [ad('refren')]);
  Z.scena('runda'); await czekaj();
  assert.deepEqual(gra(), [], 'w rundzie cisza');
  Z.gorka(); await czekaj();
  assert.deepEqual(gra(), [ad('rower')], 'Górka');
  assert.equal(Z.rozdzial('r4'), false, 'rozdział bez muzyki gra dalej to, co grało');
  assert.equal(Z.rozdzial('r11'), true); await czekaj();
  assert.deepEqual(gra(), [ad('noc')]);
  assert.equal(Z.jednorazowo('final'), true); await czekaj();
  assert.deepEqual(gra(), [ad('final')]);
  Z.scena('menu'); await czekaj();
  assert.deepEqual(gra(), [ad('refren')], 'po finale znów tło');
});

test('dżingle obok tła, awans po końcu rundy; wyłączenie ucisza, ponowne włączenie wraca', async () => {
  const ile = zrodla.length;
  assert.equal(Z.dzingiel('koniec'), true);
  assert.equal(zrodla.length, ile + 1);
  assert.deepEqual(gra().filter((x) => x === ad('refren')), [ad('refren')], 'tło gra dalej pod dżinglem');
  assert.equal(Z.dzingiel('awans'), true);
  Z.wlacz(false); await czekaj();
  assert.ok(!gra().includes(ad('refren')));
  assert.equal(Z.dzingiel('koniec'), false, 'plik gotowy, ale głośnik wyłączony: cisza');
  Z.wlacz(true); await czekaj();
  assert.ok(gra().includes(ad('refren')));
  Z.ustawAdresy(null); await czekaj();
  assert.ok(gra().includes(Z.PLIKI.tlo), 'bez adresów pętla bez słów');
  assert.equal(ostatni().loop, true);
});

test('puls: przyspiesza i wraca, późno zdekodowany plik nie wchodzi po zmianie', async () => {
  Z.wlacz(false); await czekaj();
  await Z.graj(Z.PLIKI.puls, { petla: true });
  const s = ostatni();
  Z.tempo(1.5, 1); assert.equal(s.playbackRate.value, 1.5);
  Z.tempo(1, 0.15); assert.equal(s.playbackRate.value, 1);
  await Z.graj(Z.PLIKI.fanfara, { glos: 1, przenikanie: 0.03 });
  assert.equal(s.gra, false, 'wybuch gasi puls');
  const p = Z.graj(ad('wolny'), {}); Z.zatrzymaj(0); assert.equal(await p, false, 'zatrzymane w trakcie ładowania: nie gra');
  Z.zatrzymaj(0);
});

test('guzik: pobiera od razu, gra po głośniku, trzymanie przyspiesza, wybuch daje fanfarę', () => {
  assert.match(S, /<script src="js\/muzyka\.js"><\/script>/);
  assert.match(S, /if \(nowy === 'uzbrojony'\) \{ wakeLock\(\); muzykaUzbrojona\(\); \}/);
  assert.match(S, /MUZ\.przygotuj\(\[MUZ\.PLIKI\.puls, MUZ\.PLIKI\.fanfara\], true\)/, 'z własnego cache');
  assert.match(S, /PRZYSPIESZENIE_PULSU = 1\.5/); assert.match(S, /MUZ\.tempo\(PRZYSPIESZENIE_PULSU, PRZYTRZYMAJ_MS \/ 1000\)/);
  assert.match(S, /if \(MUZ && dzwiekGuzika\) MUZ\.tempo\(1, 0\.15\);/, 'puszczenie wcześniej wraca do tempa');
  assert.match(S, /if \(MUZ && dzwiekGuzika\) MUZ\.graj\(MUZ\.PLIKI\.fanfara, \{ glos: 1, przenikanie: 0\.03 \}\);\n\s*iskry\(\);/, 'fanfara razem z błyskiem');
  assert.doesNotMatch(S, /muzyka-|piosenka/, 'tajna muzyka nie jest pobierana na guziku');
  assert.doesNotMatch(S, /<button[^>]*guzik-dzwiek/, 'głośnik nie stoi w HTML: bez modułu muzyki ekran zostaje z samym guzikiem');
  assert.match(S, /function zbudujGlosnikGuzika\(\) \{\n\s*if \(!MUZ\) return;/);
  assert.match(S, /b\.innerHTML = '<svg viewBox/, 'ikona bez pliku: ten ekran działa offline');
  const gl = S.slice(S.indexOf('function zbudujGlosnikGuzika'), S.indexOf('function zbudujGlosnikGuzika') + 900);
  assert.doesNotMatch(gl, /nacisnij|akcja_start/, 'głośnik niczego nie uruchamia');
});

test('gra: hooki na ekranach, premiera nie przerywa piosenki, dźwięk z kodu jako zapas', () => {
  assert.match(czytaj('gra-cegielki.html'), /<script src="js\/muzyka\.js"><\/script>\n<script src="js\/cegielki\.js"><\/script>/);
  assert.match(G, /if \(!\(MZ && !wPremierze && MZ\.dzingiel\("koniec"\)\)\) D\.graj\("meta"\);/);
  assert.match(G, /if \(MZ && !wPremierze\) MZ\.scena\("menu"\);/);
  assert.match(G, /premiera\(\)\)\) window\.BM_MUZYKA\.scena\("runda"\);/);
  assert.match(G, /g\.gorkaPowiedziana = true;\n\s*if \(window\.BM_MUZYKA\) window\.BM_MUZYKA\.gorka\(\);/);
  assert.match(G, /window\.BM_MUZYKA\.rozdzial\(pl\.id\)/);
  assert.match(G, /odswiezGlosnik\(\); if \(window\.BM_MUZYKA\) window\.BM_MUZYKA\.wlacz\(D\.wlaczony\); \}\);/);
  assert.match(K, /window\.BM_MUZYKA\.ustawAdresy\(d\.wystartowala === true \? d\.muzyka : null\)/, 'przed startem bez adresów');
  assert.match(K, /window\.BM_MUZYKA\.ustawAdresy\(w\.proba_od \? w\.muzyka : null\)/, 'próba po guziku');
  assert.match(K, /window\.BM_MUZYKA\.scena\("magazyn"\)/); assert.match(K, /jednorazowo\("final"\)/); assert.match(K, /jednorazowo\("mur"\)/); assert.match(K, /dzingiel\("awans"\)/);
  assert.match(K, /piosenka = M\.adresyZLicznika\(d\.muzyka\)\.premiera/); assert.match(K, /piosenka = M\.adresyZLicznika\(r\.data\.muzyka\)\.premiera/);
  assert.match(K, /Promise\.race\(\[M\.bufor\(piosenka\), new Promise\(function \(ok\) \{ setTimeout\(ok, 6000\); \}\)\]\)/, 'muzyka nie zatrzymuje premiery');
});

test('funkcja próby: adresy muzyki na 15 minut, tylko dla uprawnionych', async () => {
  const W = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/proba-wizerunek.mjs')).href);
  assert.deepEqual(Object.keys(W.PLIKI_MUZYKI).sort(), ['final', 'magazyn', 'menu1', 'menu2', 'mur', 'noc', 'premiera', 'rower']);
  const wazn = []; const sb = { from: (t) => { const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: t === 'coaches' ? { id: 1 } : null }) }; return b; },
    storage: { from: () => ({ createSignedUrl: async (p, s) => { wazn.push(s); return p === 'muzyka-noc.mp3' ? { data: null } : { data: { signedUrl: 'https://x/' + p } }; } }) }, rpc: async () => ({ data: {} }) };
  const ok = await W.odpowiedzWizerunku(sb, { id: 1 });
  assert.equal(ok.body.muzyka.menu1, 'https://x/muzyka-menu-1.mp3'); assert.ok(!('noc' in ok.body.muzyka), 'brak pliku: bez pozycji');
  assert.ok(wazn.every((s) => s === W.WAZNOSC_S));
  assert.deepEqual(await W.odpowiedzWizerunku(sb, null), { status: 401, body: { ok: false } });
});

test('w repo tylko muzyka bez słów, bez tagów i bez tekstów', () => {
  const kat = path.join(KORZEN, 'assets/gra/dzwieki'), pliki = fs.readdirSync(kat);
  assert.deepEqual(pliki.filter((n) => n.endsWith('.mp3')).sort(), ['awans.mp3', 'fanfara.mp3', 'koniec.mp3', 'puls.mp3', 'tlo_menu.mp3', 'ul_fanfara.mp3']);
  for (const n of pliki.filter((x) => x.endsWith('.mp3'))) {
    const b = fs.readFileSync(path.join(kat, n));
    assert.notEqual(b.subarray(0, 3).toString('latin1'), 'ID3', n + ': bez tagów');
    for (const z of ['lyrics', 'suno', 'explosivevisualizer', 'USLT', 'APIC']) assert.equal(b.includes(z), false, n + ' zawiera ' + z);
  }
  const zr = czytaj('assets/gra/dzwieki/zrodla.md');
  assert.match(zr, /płatny plan Filipa, prawo do użycia komercyjnego/);
  assert.doesNotMatch(zr + M, /s[lł]awek|wigr|wojtaszak|fabian|piosenka-|explosivevisualizer/i);
});
