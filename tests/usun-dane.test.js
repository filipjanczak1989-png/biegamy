// ─────────────────────────────────────────────────────────────────────────────
// „USUŃ MOJE DANE" (usun-dane.html + js/usun-dane.js) — przepływ na atrapach: Supabase Auth (sesja, kod z maila)
// i klient API (js/wyniki-api.js: { data, error }). Dane fikcyjne.
//
// Pilnuje: flaga wyłączona → tylko „niedostępna" (zero wywołań); świeże logowanie kodem ≤ 15 min (amr otp/magiclink),
// ponowna wysyłka po 60 s, koniec okna → ponowne logowanie; podgląd bez zapisu; wniosek tylko z zaznaczonych wierszy;
// osobne potwierdzenie; cofnięcie dwoma kliknięciami; link zużyty przez skaner → ekran kodu i czysty URL;
// dane wyłącznie przez textContent (mini-DOM rzuca przy innerHTML).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const ZRODLO = fs.readFileSync(path.join(KORZEN, 'js', 'usun-dane.js'), 'utf8');
const ZLY = '<img src=x onerror=alert(1)>';

function miniDom() {
  class Wezel { constructor(doc) { this.ownerDocument = doc; this.children = []; } }
  class Tekst extends Wezel { constructor(doc, t) { super(doc); this.data = String(t); } get textContent() { return this.data; } }
  class Element extends Wezel {
    constructor(doc, tag) { super(doc); this.tagName = tag.toUpperCase(); this.attrs = {}; this.className = ''; this.sluchacze = {}; this.value = ''; this.checked = false; this.disabled = false; }
    append(...w) { for (const x of w) { const n = typeof x === 'string' ? new Tekst(this.ownerDocument, x) : x; this.children.push(n); } }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.sluchacze[t] = this.sluchacze[t] || []).push(f); }
    async wyzwol(t) { for (const f of this.sluchacze[t] || []) await f.call(this, { type: t }); }
    get textContent() { return this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children = []; if (v !== '' && v != null) this.append(new Tekst(this.ownerDocument, v)); }
    get innerHTML() { throw new Error('innerHTML zabronione'); }
    set innerHTML(v) { throw new Error('innerHTML zabronione'); }
    wszystkie(tag) { const out = []; const idz = (n) => { for (const c of n.children) { if (c.tagName === tag) out.push(c); if (c.children) idz(c); } }; idz(this); return out; }
  }
  const doc = { createElement: (t) => new Element(doc, t), createTextNode: (t) => new Tekst(doc, t) };
  return { doc, root: new Element(doc, 'div') };
}

const jwt = (claims) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
const T0 = Date.parse('2026-10-21T12:00:00Z');
const swieza = (ms = T0 - 60000) => ({ access_token: jwt({ amr: [{ method: 'password', timestamp: Math.floor((T0 - 86400000) / 1000) }, { method: 'otp', timestamp: Math.floor(ms / 1000) }] }), user: { email: 'jan.testowy@example.org' } });
const zHasla = () => ({ access_token: jwt({ amr: [{ method: 'password', timestamp: Math.floor((T0 - 60000) / 1000) }] }), user: { email: 'jan.testowy@example.org' } });

function scena({ session = swieza(), dostepne = true, odpowiedzi = {}, hash = '', verify = null, podglad = false } = {}) {
  const ctx = zaladujSb();
  if (typeof ctx.atob !== 'function') ctx.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  if (typeof ctx.TextDecoder !== 'function') ctx.TextDecoder = TextDecoder;
  vm.runInContext(ZRODLO, ctx, { filename: 'js/usun-dane.js' });
  const { root } = miniDom();
  let teraz = T0;
  const interwaly = [];
  const auth = { wolania: [], aktualna: session };
  const sb = { auth: {
    getSession: async () => { auth.wolania.push('getSession'); return { data: { session: auth.aktualna } }; },
    signInWithOtp: async (a) => { auth.wolania.push(['signInWithOtp', a]); return { data: {}, error: null }; },
    verifyOtp: async (a) => { auth.wolania.push(['verifyOtp', a]); if (verify) return verify(a); auth.aktualna = swieza(teraz); return { data: { session: auth.aktualna }, error: null }; },
  } };
  const wolania = [];
  const api = { rpc: async (n, a) => { wolania.push([n, a]); const o = odpowiedzi[n]; return typeof o === 'function' ? o(a) : (o || { data: [], error: null }); } };
  const historia = [];
  const w = ctx.initUsunDane({ sb, api, root, dostepne, podglad, teraz: () => teraz, setInterval: (f) => { interwaly.push(f); return interwaly.length; }, clearInterval() {},
    location: { hash, search: '', pathname: '/usun-dane.html' }, history: { replaceState: (...a) => historia.push(a) } });
  const tekst = () => root.textContent;
  const przycisk = (re) => root.wszystkie('BUTTON').find((b) => re.test(b.textContent));
  const klik = async (re) => { const b = przycisk(re); assert.ok(b, 'brak przycisku ' + re + ' w: ' + tekst()); await b.wyzwol('click'); await czekaj(); };
  return { ctx, root, w, wolania, auth, historia, tekst, przycisk, klik, uplyw: (ms) => { teraz += ms; }, tik: () => interwaly.forEach((f) => f()) };
}
const czekaj = () => new Promise((r) => setImmediate(r));

const KANDYDACI = { data: [{ runner_key: 'k:testowy jan|1980', display_name: ZLY, yob: 1980, results_count: 3, last_event: 'Bieg Fikcyjny' }], error: null };
const PODGLAD = { data: [
  { result_id: 'a1', event_name: ZLY, event_date: '2025-05-01', distance_km: 10, source: 'datasport', ma_id_zrodla: true, dopasowanie: 'id_zrodla' },
  { result_id: 'a2', event_name: 'Bieg Fikcyjny 2', event_date: '2024-05-01', distance_km: 5, source: 'b4sport', ma_id_zrodla: false, dopasowanie: 'nazwisko' },
  { result_id: 'a3', event_name: 'Bieg Fikcyjny 3', event_date: '2023-05-01', distance_km: 21.097, source: 'b4sport', ma_id_zrodla: false, dopasowanie: 'domysl_nazwisko_rocznik' },
], error: null };

test('flaga wyłączona: tylko „usługa niedostępna" i mailto, zero wywołań Auth i API', async () => {
  const s = scena({ dostepne: false });
  await czekaj();
  assert.match(s.tekst(), /chwilowo niedostępna/);
  assert.equal(s.root.wszystkie('A')[0].getAttribute('href'), 'mailto:biegamy.run@gmail.com');
  assert.deepEqual([s.auth.wolania.length, s.wolania.length], [0, 0]);
});

test('brak sesji: prośba o zalogowanie w aplikacji, bez API', async () => {
  const s = scena({ session: null });
  await czekaj();
  assert.match(s.tekst(), /zaloguj się w aplikacji BiegaMy/);
  assert.equal(s.root.wszystkie('A')[0].getAttribute('href'), 'index.html');
  assert.equal(s.wolania.length, 0);
});

test('logowanie hasłem nie wystarcza: kod z maila (shouldCreateUser false, powrót na usun-dane.html), ponowna wysyłka po 60 s', async () => {
  const s = scena({ session: zHasla() });
  await czekaj();
  assert.match(s.tekst(), /Potwierdź, że to Ty/);
  assert.match(s.tekst(), /ja\*\*\*@example\.org/, 'adres zamaskowany');
  assert.equal(s.wolania.length, 0, 'bez świeżego logowania nie ma podglądu ani wniosków');
  await s.klik(/Wyślij kod na mój e-mail/);
  const otp = s.auth.wolania.find((x) => x[0] === 'signInWithOtp')[1];
  assert.deepEqual(JSON.parse(JSON.stringify(otp)), { email: 'jan.testowy@example.org', options: { shouldCreateUser: false, emailRedirectTo: 'https://biegamy.run/usun-dane.html' } });
  assert.match(s.tekst(), /Wpisz kod z maila/);
  assert.equal(s.przycisk(/Wyślij kod ponownie/).disabled, true);
  assert.match(s.przycisk(/Wyślij kod ponownie/).textContent, /za 60 s/);
  s.uplyw(61000); s.tik();
  assert.equal(s.przycisk(/Wyślij kod ponownie/).disabled, false);
  const pole = s.root.wszystkie('INPUT')[0];
  assert.equal(s.przycisk(/Potwierdź kod/).disabled, true, 'bez kodu przycisk nieaktywny');
  pole.value = '12'; await pole.wyzwol('input');
  assert.equal(s.przycisk(/Potwierdź kod/).disabled, true);
  await s.klik(/Potwierdź kod/);
  assert.match(s.tekst(), /Wpisz kod z maila \(same cyfry\)\./);
  assert.ok(!s.auth.wolania.some((x) => x[0] === 'verifyOtp'), 'zły kod nie idzie do Supabase');
  pole.value = '123 456'; await pole.wyzwol('input');
  assert.equal(s.przycisk(/Potwierdź kod/).disabled, false);
  await s.klik(/Potwierdź kod/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.auth.wolania.find((x) => x[0] === 'verifyOtp')[1])), { email: 'jan.testowy@example.org', token: '123456', type: 'email' });
  await czekaj();
  assert.match(s.tekst(), /Twoje wnioski/);
  assert.equal(s.wolania[0][0], 'erasure_status');
});

test('zły kod: komunikat, zostajemy na ekranie kodu', async () => {
  const s = scena({ session: zHasla(), verify: () => ({ data: {}, error: { status: 403, message: 'Token has expired or is invalid' } }) });
  await czekaj();
  await s.klik(/Wyślij kod na mój e-mail/);
  s.root.wszystkie('INPUT')[0].value = '654321';
  await s.klik(/Potwierdź kod/);
  assert.match(s.tekst(), /Kod jest nieprawidłowy albo wygasł/);
  assert.match(s.tekst(), /Wpisz kod z maila/);
});

test('link zużyty przez skaner (otp_expired): ekran kodu z wyjaśnieniem, URL wyczyszczony z parametrów', async () => {
  const s = scena({ session: zHasla(), hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid' });
  await czekaj();
  assert.match(s.tekst(), /Link został już użyty albo wygasł/);
  assert.match(s.tekst(), /Wpisz kod z maila/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.historia)), [[null, '', '/usun-dane.html']]);
});

test('pełny przepływ: szukaj → podgląd (bez zapisu) → odznaczenie → podsumowanie → wniosek → osobne potwierdzenie', async () => {
  const s = scena({ odpowiedzi: { search_runners: KANDYDACI, erasure_preview: PODGLAD, erasure_request: { data: 'w-1', error: null }, erasure_confirm: { data: 'ukryte', error: null } } });
  await czekaj();
  assert.match(s.tekst(), /zostało: 14 minut/);
  s.root.wszystkie('INPUT')[0].value = 'Jan Testowy';
  await s.klik(/^Szukaj$/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania[1])), ['search_runners', { q: 'Jan Testowy' }]);
  await s.klik(/rocznik 1980/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania[2])), ['erasure_preview', { p_runner_key: 'k:testowy jan|1980' }]);
  assert.ok(s.tekst().includes(ZLY), 'nazwa zawodów jako tekst');
  assert.match(s.tekst(), /Zaznaczone: 3 wyniki\./);
  const pola = s.root.wszystkie('INPUT').filter((i) => i.getAttribute('type') === 'checkbox');
  pola[2].checked = false; await pola[2].wyzwol('change');
  assert.match(s.tekst(), /Zaznaczone: 2 wyniki\./);
  assert.ok(!s.wolania.some((x) => x[0] === 'erasure_request'), 'podgląd niczego nie zapisuje');
  await s.klik(/Dalej – podsumowanie/);
  assert.match(s.tekst(), /Ukryjemy 2 wyniki ze źródeł: b4sport, datasport\./);
  assert.match(s.tekst(), /profilu w serwisie źródłowym/);
  assert.match(s.tekst(), /po 30 dniach usuniemy je z bazy/);
  await s.klik(/Złóż wniosek/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania.find((x) => x[0] === 'erasure_request')[1])), { p_result_ids: ['a1', 'a2'], p_blokuj_nazwisko: false });
  assert.match(s.tekst(), /Potwierdź go w ciągu 30 minut/);
  assert.ok(!s.wolania.some((x) => x[0] === 'erasure_confirm'), 'potwierdzenie to osobny krok');
  await s.klik(/Potwierdzam – ukryj te wyniki/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania.find((x) => x[0] === 'erasure_confirm')[1])), { p_id: 'w-1' });
  assert.match(s.tekst(), /Gotowe – wyniki są ukryte/);
});

test('blokada nazwiska: opis skutku (imiennik, 3 lata) i przekazanie p_blokuj_nazwisko', async () => {
  const s = scena({ odpowiedzi: { search_runners: KANDYDACI, erasure_preview: PODGLAD, erasure_request: { data: 'w-2', error: null } } });
  await czekaj();
  s.root.wszystkie('INPUT')[0].value = 'Jan Testowy';
  await s.klik(/^Szukaj$/); await s.klik(/rocznik 1980/);
  assert.match(s.tekst(), /innej osoby o tym samym nazwisku i roczniku\. Wygasa po 3 latach/);
  const blok = s.root.wszystkie('INPUT').find((i) => i.getAttribute('id') === 'ud-blokuj');
  blok.checked = true; await blok.wyzwol('change');
  await s.klik(/Dalej – podsumowanie/);
  assert.match(s.tekst(), /blokadę nazwiska i rocznika na 3 lata/);
  await s.klik(/Złóż wniosek/);
  assert.equal(s.wolania.find((x) => x[0] === 'erasure_request')[1].p_blokuj_nazwisko, true);
});

test('okno 15 min: po upływie ekran ponownego logowania; 403 z serwera (świeży kod) też', async () => {
  const s = scena({ odpowiedzi: { search_runners: KANDYDACI, erasure_preview: PODGLAD } });
  await czekaj();
  s.uplyw(15 * 60000); s.tik();
  assert.match(s.tekst(), /Minęło 15 minut od zalogowania kodem/);
  assert.ok(s.przycisk(/Wyślij kod na mój e-mail/));
  const s2 = scena({ odpowiedzi: { search_runners: KANDYDACI, erasure_preview: PODGLAD,
    erasure_request: { data: null, error: { status: 403, kod: 'odmowa', komunikat: 'Zaloguj się kodem albo linkiem z maila (ważne 15 min)' } } } });
  await czekaj();
  s2.root.wszystkie('INPUT')[0].value = 'Jan Testowy';
  await s2.klik(/^Szukaj$/); await s2.klik(/rocznik 1980/); await s2.klik(/Dalej – podsumowanie/); await s2.klik(/Złóż wniosek/);
  assert.match(s2.tekst(), /Minęło 15 minut/);
});

test('status i cofnięcie: stany po polsku, data kasowania, cofnięcie po drugim kliknięciu; zablokowane konto – tekst z serwera', async () => {
  let cofniete = false;
  const s = scena({ odpowiedzi: {
    erasure_status: () => ({ data: [
      { id: 'w-1', stan: cofniete ? 'cofniete' : 'ukryte', utworzono: '2026-10-20T10:00:00Z', ukryto: '2026-10-20T10:05:00Z', kasowanie_od: '2026-11-19T10:05:00Z', wierszy: 2 },
      { id: 'w-0', stan: 'wykonane', utworzono: '2026-08-01T10:00:00Z', wierszy: 1 },
    ], error: null }),
    erasure_cancel: () => { cofniete = true; return { data: 'cofniete', error: null }; },
  } });
  await czekaj(); await czekaj();
  assert.match(s.tekst(), /2 wyniki, ukryte – wyniki nie są widoczne\. Usuniemy je z bazy 19 listopada 2026/);
  assert.match(s.tekst(), /1 wynik, usunięte z bazy/);
  assert.equal(s.root.wszystkie('BUTTON').filter((b) => /Cofnij wniosek/.test(b.textContent)).length, 1, 'wykonanego nie da się cofnąć');
  await s.klik(/Cofnij wniosek/);
  assert.ok(!s.wolania.some((x) => x[0] === 'erasure_cancel'), 'pierwsze kliknięcie tylko pyta');
  await s.klik(/Tak, cofnij/); await czekaj();
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania.find((x) => x[0] === 'erasure_cancel')[1])), { p_id: 'w-1' });
  assert.match(s.tekst(), /cofnięty – wyniki wróciły/);
  const { tekstBledu } = s.ctx._usunDane;
  assert.equal(tekstBledu({ status: 403, kod: 'odmowa', komunikat: 'To konto nie może składać wniosków – napisz na biegamy.run@gmail.com' }), 'To konto nie może składać wniosków – napisz na biegamy.run@gmail.com.');
  assert.match(tekstBledu({ status: 429, kod: 'limit', retryAfter: 3600 }), /za godzinę/);
  assert.equal(tekstBledu({ status: 429, kod: 'limit', komunikat: 'Masz już otwarty wniosek' }), 'Masz już otwarty wniosek.');
  assert.match(tekstBledu({ status: 0, kod: 'offline' }), /Brak połączenia/);
  assert.match(tekstBledu({ status: 400, kod: 'zle_dane', komunikat: null }), /Coś poszło nie tak/);
});

test('okno logowania z tokenu: otp i magiclink liczą się, hasło nie; koniec = znacznik + 15 min', () => {
  const ctx = zaladujSb();
  if (typeof ctx.atob !== 'function') ctx.atob = (x) => Buffer.from(x, 'base64').toString('binary');
  if (typeof ctx.TextDecoder !== 'function') ctx.TextDecoder = TextDecoder;
  vm.runInContext(ZRODLO, ctx);
  const { oknoLogowania } = ctx._usunDane;
  assert.deepEqual(JSON.parse(JSON.stringify(oknoLogowania(swieza(T0 - 14 * 60000), T0))), { swieze: true, koniec: T0 + 60000 });
  assert.equal(oknoLogowania(swieza(T0 - 16 * 60000), T0).swieze, false);
  assert.equal(oknoLogowania({ access_token: jwt({ amr: [{ method: 'magiclink', timestamp: (T0 - 1000) / 1000 }] }) }, T0).swieze, true);
  assert.equal(oknoLogowania(zHasla(), T0).swieze, false);
  assert.equal(oknoLogowania({ access_token: 'zepsuty' }, T0).swieze, false);
  assert.equal(oknoLogowania(null, T0).swieze, false);
});

test('„Potwierdź" przy wniosku czekającym na potwierdzenie: opis skutku i terminu 30 min, erasure_confirm po kliknięciu', async () => {
  const s = scena({ odpowiedzi: {
    erasure_status: { data: [{ id: 'w-5', stan: 'czeka_na_potwierdzenie', utworzono: new Date(T0 - 5 * 60000).toISOString(), wierszy: 2 }], error: null },
    erasure_confirm: { data: 'ukryte', error: null },
  } });
  await czekaj(); await czekaj();
  assert.match(s.tekst(), /czeka na Twoje potwierdzenie/);
  assert.match(s.tekst(), /jest ważny do \d{2}:\d{2} \(30 minut od złożenia\)/);
  assert.match(s.tekst(), /wyniki od razu znikną z wyszukiwarki, a po 30 dniach usuniemy je z bazy/);
  assert.match(s.tekst(), /Bez potwierdzenia wniosek wygaśnie i nic się nie stanie/);
  assert.ok(s.przycisk(/^Cofnij wniosek$/), 'obok jest Cofnij');
  await s.klik(/^Potwierdź$/);
  assert.deepEqual(JSON.parse(JSON.stringify(s.wolania.find((x) => x[0] === 'erasure_confirm')[1])), { p_id: 'w-5' });
  assert.match(s.tekst(), /Gotowe – wyniki są ukryte/);
});

test('„Potwierdź": wniosek starszy niż 30 min — bez przycisku, z wyjaśnieniem; po końcu okna logowania — ponowne logowanie', async () => {
  const stary = scena({ odpowiedzi: { erasure_status: { data: [{ id: 'w-6', stan: 'czeka_na_potwierdzenie', utworzono: new Date(T0 - 31 * 60000).toISOString(), wierszy: 1 }], error: null } } });
  await czekaj(); await czekaj();
  assert.equal(stary.przycisk(/^Potwierdź$/), undefined);
  assert.match(stary.tekst(), /Minęło 30 minut od złożenia – tego wniosku nie da się już potwierdzić/);
  assert.ok(stary.przycisk(/^Cofnij wniosek$/));
  const s = scena({ session: swieza(T0 - 14.5 * 60000), odpowiedzi: { erasure_status: { data: [{ id: 'w-7', stan: 'czeka_na_potwierdzenie', utworzono: new Date(T0 - 60000).toISOString(), wierszy: 1 }], error: null } } });
  await czekaj(); await czekaj();
  s.uplyw(60000);
  await s.klik(/^Potwierdź$/);
  assert.match(s.tekst(), /Minęło 15 minut od zalogowania kodem/);
  assert.ok(!s.wolania.some((x) => x[0] === 'erasure_confirm'));
});

test('pasek „Tryb podglądu API" na każdym ekranie przy podglądzie; nigdy przy usłudze niedostępnej', async () => {
  const s = scena({ podglad: true, session: zHasla() });
  await czekaj();
  assert.match(s.tekst(), /Tryb podglądu API \(przełącznik lokalny\)/);
  await s.klik(/Wyślij kod na mój e-mail/);
  assert.match(s.tekst(), /Tryb podglądu API/);
  const bez = scena({ podglad: false });
  await czekaj();
  assert.doesNotMatch(bez.tekst(), /Tryb podglądu/);
  const niedostepna = scena({ podglad: true, dostepne: false });
  await czekaj();
  assert.doesNotMatch(niedostepna.tekst(), /Tryb podglądu/);
  assert.match(niedostepna.tekst(), /chwilowo niedostępna/);
});

// ── długość kodu z maila (22.10.2026): Supabase PROD wysyła 8 cyfr; front przyjmuje 6–10, bez zmian w Auth ──
async function ekranKodu() {
  const s = scena({ session: zHasla() });
  await czekaj();
  await s.klik(/Wyślij kod na mój e-mail/);
  return { s, pole: s.root.wszystkie('INPUT')[0] };
}

test('kod z maila: 8 i 6 cyfr przechodzą (spacje w środku usuwane), do verifyOtp idą same cyfry', async () => {
  for (const [wpis, token] of [['12345678', '12345678'], ['1234 5678', '12345678'], ['123456', '123456'], [' 12 34 56 78 90 ', '1234567890']]) {
    const { s, pole } = await ekranKodu();
    pole.value = wpis; await pole.wyzwol('input');
    assert.equal(s.przycisk(/Potwierdź kod/).disabled, false, JSON.stringify(wpis));
    await s.klik(/Potwierdź kod/);
    assert.equal(s.auth.wolania.find((x) => x[0] === 'verifyOtp')[1].token, token, JSON.stringify(wpis));
    await czekaj();
    assert.match(s.tekst(), /Twoje wnioski/);
  }
});

test('kod z maila: 5 i 11 cyfr, litery i znaki odrzucone – przycisk nieaktywny, komunikat bez liczby cyfr, bez verifyOtp', async () => {
  for (const wpis of ['12345', '12345678901', '1234abcd', 'abcdefgh', '1234-5678', '', '   ']) {
    const { s, pole } = await ekranKodu();
    pole.value = wpis; await pole.wyzwol('input');
    assert.equal(s.przycisk(/Potwierdź kod/).disabled, true, JSON.stringify(wpis));
    await s.klik(/Potwierdź kod/);
    assert.match(s.tekst(), /Wpisz kod z maila \(same cyfry\)\./, JSON.stringify(wpis));
    assert.ok(!s.auth.wolania.some((x) => x[0] === 'verifyOtp'), JSON.stringify(wpis));
  }
});

test('pole kodu: maxlength 10, inputmode numeric, autocomplete one-time-code; teksty bez konkretnej liczby cyfr', async () => {
  const { s, pole } = await ekranKodu();
  assert.equal(pole.getAttribute('maxlength'), '10');
  assert.equal(pole.getAttribute('inputmode'), 'numeric');
  assert.equal(pole.getAttribute('autocomplete'), 'one-time-code');
  assert.doesNotMatch(s.tekst() + (pole.getAttribute('aria-label') || '') + (pole.getAttribute('placeholder') || ''), /\d+ cyfr|123456/);
  const { poprawnyKod, KOD_MIN, KOD_MAX } = s.ctx._usunDane;
  assert.deepEqual([KOD_MIN, KOD_MAX], [6, 10]);
  assert.deepEqual(['123456', '1234567', '12345678', '1234567890', '12345', '12345678901', '12a456', null].map((x) => poprawnyKod(x)),
    ['123456', '1234567', '12345678', '1234567890', null, null, null, null]);
  const kod = fs.readFileSync(path.join(KORZEN, 'js', 'usun-dane.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /\\d\{6\}|6 cyfr|maxlength: '6'/, 'nigdzie na sztywno 6 cyfr');
});
