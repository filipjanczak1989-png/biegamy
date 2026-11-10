/* BLIZNA 207 / LIMIT ZGŁOSZEŃ DOPIERO PO WALIDACJI (Filip 10.11, A1). Zwiad 10.11: akcja_firmy_wpusc wpisywała próbę do akcja_firmy_proby, zanim EF sprawdziła
   pola i pliki, więc trzy literówki blokowały adres na godzinę („Za dużo zgłoszeń z tego adresu”). Teraz RPC dostaje tylko zgłoszenia formalnie poprawne;
   pułapka na boty zostaje przed wszystkim; komunikat blokady mówi, ile minut zostało, gdy da się to odczytać. Prawdziwy kod EF (_shared/firma-obsluga.mjs) na atrapie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

const PNG = (w, h) => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, w || 300); new DataView(b.buffer).setUint32(20, h || 120); return b; };
const plik = (b) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
const firma = (nad) => { const m = new Map(Object.entries({ slug: 'proba', rodzaj: 'domek', nazwa: 'Firma Testowa', link: 'https://firma.example.pl', email: 'kontakt@firma.example.pl', zgoda: 'tak', kwota: '150', logo: plik(PNG()), zrzut: plik(PNG()), ...nad })); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };
const osoba = (nad) => { const m = new Map(Object.entries({ slug: 'proba', rodzaj: 'cegielka', imie: 'Zenek', zgoda_imie: 'tak', zrzut: plik(PNG()), ...nad })); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };

/** Atrapa bazy: liczy wywołania wpusc jak prawdziwa funkcja (każde = wpis do akcja_firmy_proby), oddaje progi z `akcje`, próby do odczytu minut. */
function atrapa(o) {
  const op = o || {}, proby = [], wpisy = [];
  const akcje = { proba: { prog_domku_zl: op.prog_domku_zl == null ? 100 : op.prog_domku_zl, prog_wiezowca_zl: 1000 } };
  const rpc = async (n, a) => {
    if (n === 'akcja_firmy_wpusc') {
      if (op.wylaczone) return { data: { ok: false, powod: 'wylaczone' } };
      const ile = proby.filter((p) => p.ip === a.p_ip).length;
      if (ile >= 3) return { data: { ok: false, powod: 'limit' } };
      proby.push({ ip: a.p_ip, kiedy: new Date(op.teraz || Date.now()).toISOString() });
      return { data: { ok: true, ...akcje[a.p_slug] } };
    }
    if (n === 'akcja_firmy_zgloszenie_dodaj') { wpisy.push(a); return { data: { ok: true } }; }
    throw new Error('atrapa: ' + n);
  };
  function zapytanie(t) {
    const q = { _f: [] };
    q.select = () => q; q.eq = (k, v) => { q._f.push((r) => r[k] === v); return q; }; q.gt = (k, v) => { q._f.push((r) => r[k] > v); return q; };
    q.order = () => q; q.limit = (n) => { q._n = n; return q; };
    q.maybeSingle = async () => ({ data: t === 'akcje' && !op.bezAkcji ? akcje.proba : null });
    q.then = (ok) => ok(t === 'akcja_firmy_proby' ? { data: proby.filter((p) => q._f.every((f) => f({ ip_skrot: p.ip, kiedy: p.kiedy }))).slice(0, q._n || 100) } : { data: [] });
    q.insert = async (w) => { wpisy.push(w); return { error: null }; };
    return q;
  }
  const sb = { rpc, from: (t) => zapytanie(t), storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) } };
  return { sb, proby, wpisy };
}
async function kontekst(o) {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  await zaladuj('js/moderacja.mjs');
  const a = atrapa(o);
  const wyslij = (dane, ip, extra) => O.przyjmijZgloszenie({ dane, ipSkrot: ip || 'ip-a', sb: a.sb, moderacja: globalThis.BM_MODERACJA, powiadom: async () => {}, ...(extra || {}) });
  return { O, a, wyslij };
}

test('błędne zgłoszenia firmy i cegiełki nie wołają wpusc; poprawne woła raz; pułapka przed wszystkim', async () => {
  const { a, wyslij } = await kontekst();
  const zle = [
    [firma({ nazwa: 'X' }), /Nazwa firmy/], [firma({ email: 'zly' }), /e-mail/], [firma({ kwota: '' }), /kwotę/], [firma({ kwota: '50' }), /Domek od 100 zł/],
    [firma({ zgoda: null }), /zgodę/], [firma({ logo: null }), /Dodaj logo/], [firma({ zrzut: plik(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])) }), /tylko PNG, JPG albo WebP/],
    [firma({ logo: plik(PNG(900, 900)) }), /najwyżej 400 px/], [osoba({ imie: 'Zenek Kowalski' }), /Imię/], [osoba({ zrzut: null }), /Dodaj zrzut/],
  ];
  for (const [dane, re] of zle) { const w = await wyslij(dane); assert.equal(w.status, 400, JSON.stringify(w.body)); assert.match(w.body.blad, re); }
  assert.equal(a.proby.length, 0, 'żadna błędna próba nie trafiła do akcja_firmy_proby');
  const bot = await wyslij(firma({ strona_www: 'http://spam' })); assert.deepEqual(bot, { status: 200, body: { ok: true } }); assert.equal(a.proby.length, 0, 'pułapka: nic w bazie');
  const ok = await wyslij(firma()); assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(a.proby.length, 1, 'poprawne zgłoszenie = jedna próba');
  const ok2 = await wyslij(osoba()); assert.equal(ok2.status, 200, JSON.stringify(ok2.body)); assert.equal(a.proby.length, 2);
});

test('scenariusz z produkcji: 3 błędne z jednego adresu, czwarte poprawne przechodzi; czwarte poprawne po trzech poprawnych = 429 z minutami', async () => {
  const teraz = Date.UTC(2026, 10, 10, 12, 0, 0);
  const { a, wyslij } = await kontekst({ teraz });
  for (let i = 0; i < 3; i++) assert.equal((await wyslij(firma({ kwota: '' }), 'ip-f')).status, 400);
  assert.equal((await wyslij(firma(), 'ip-f')).status, 200, 'po trzech błędnych czwarte poprawne przechodzi');
  assert.equal((await wyslij(firma(), 'ip-f')).status, 200); assert.equal((await wyslij(firma(), 'ip-f')).status, 200);
  const blok = await wyslij(firma(), 'ip-f', { teraz: teraz + 25 * 60000 });
  assert.equal(blok.status, 429); assert.equal(blok.body.blad, 'Za dużo zgłoszeń z tego adresu. Spróbuj za 35 min.');
  assert.equal(a.proby.length, 3, 'odrzucone 429 nie dokłada wpisu');
  const inny = await wyslij(osoba(), 'ip-g'); assert.equal(inny.status, 200, 'inny adres nie jest blokowany');
});

test('tanie przed limitem, drogie po: skalowanie PNG > 400 px (imagescript) dopiero po wpusc; WebP > 400 px odrzucony tanio przed RPC', async () => {
  const { a, wyslij } = await kontekst();
  const kolejnosc = [], przeskaluj = async (b) => { kolejnosc.push('przeskaluj'); return b; };
  a.sb.rpc = ((stary) => async (n, x) => { if (n === 'akcja_firmy_wpusc') kolejnosc.push('wpusc'); return stary(n, x); })(a.sb.rpc);
  const w = await wyslij(firma({ logo: plik(PNG(900, 900)) }), 'ip-s', { przeskaluj });
  assert.equal(w.status, 200, JSON.stringify(w.body)); assert.deepEqual(kolejnosc, ['wpusc', 'przeskaluj'], 'dekodowanie w czystym JS chronione limiterem');
  for (let i = 0; i < 2; i++) await wyslij(firma(), 'ip-s');
  kolejnosc.length = 0;
  const blok = await wyslij(firma({ logo: plik(PNG(900, 900)) }), 'ip-s', { przeskaluj });
  assert.equal(blok.status, 429); assert.deepEqual(kolejnosc, ['wpusc'], 'po limicie skalowania nie ma');
  const webp = new Uint8Array(40); webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0); webp.set([0x1f, 0x03, 0x00, 0x1f, 0x03, 0x00], 24);   // 800×800
  const zaDuzyWebp = await wyslij(firma({ logo: plik(webp) }), 'ip-t', { przeskaluj });
  assert.equal(zaDuzyWebp.status, 400); assert.match(zaDuzyWebp.body.blad, /najwyżej 400 px/); assert.equal(a.proby.filter((p) => p.ip === 'ip-t').length, 0, 'tanie odrzucenie przed RPC');
});

test('bez odczytu progów z akcje: próg sprawdzany po RPC z jej odpowiedzi; wyłączone zgłoszenia = 403 bez wpisu w próbach; minuty bez odczytu = komunikat ogólny', async () => {
  const { O, a, wyslij } = await kontekst({ bezAkcji: true });
  const w = await wyslij(firma({ kwota: '50' })); assert.equal(w.status, 400); assert.match(w.body.blad, /Domek od 100 zł/);
  assert.equal(a.proby.length, 1, 'bez progów przed RPC ta jedna próba idzie do bazy (klient i tak odrzuca za niską kwotę przed wysłaniem)');
  const wyl = await kontekst({ wylaczone: true }); const w2 = await wyl.wyslij(firma()); assert.equal(w2.status, 403); assert.equal(wyl.a.proby.length, 0);
  assert.equal(await O.minutyBlokady({ from: () => { throw new Error('brak dostępu'); } }, 'ip'), null);
  assert.equal(O.komunikatLimitu(null), 'Za dużo zgłoszeń z tego adresu. Spróbuj za godzinę.'); assert.equal(O.komunikatLimitu(7), 'Za dużo zgłoszeń z tego adresu. Spróbuj za 7 min.');
  const t = await O.minutyBlokady({ from: () => ({ select: () => ({ eq: () => ({ gt: () => ({ order: () => ({ limit: async () => ({ data: [{ kiedy: new Date(Date.UTC(2026, 10, 10, 12, 0)).toISOString() }] }) }) }) }) }) }) }, 'ip', Date.UTC(2026, 10, 10, 12, 59, 30));
  assert.equal(t, 1, 'ostatnie pół minuty = 1 min, nigdy 0');
});
