/* BLIZNA 152 (4.11.2026, decyzja Filipa): imiona z cegiełek, nazwy firm i imię na kartonie w grze są publiczne przy zbiórce dla dziecka. Filtr działa w kodzie, bez API.
   tests/_moderacja-przyklady.json: wpisy od Claude z etykietą (tools/moderacja-przyklady.mjs). Prawdziwe imiona i firmy nie mogą odpaść, bo „Cyprian” i „Kutno Trans” to najczęstsza wpadka takich filtrów. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const M = async () => { await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href); return globalThis.BM_MODERACJA; };
const PRZYKLADY = JSON.parse(fs.readFileSync(path.join(__dirname, '_moderacja-przyklady.json'), 'utf8'));

test('prawdziwe imiona przechodzą bez alarmu; prawdziwa firma nigdy nie ma twardej blokady, a alarm do potwierdzenia jest rzadki', async () => {
  const { sprawdz } = await M();
  const dobre = PRZYKLADY.filter((p) => !p.blokowac);
  assert.ok(dobre.length >= 150, 'za mało przykładów: ' + dobre.length);
  const r = (p) => sprawdz(p.tekst, { rodzaj: p.rodzaj });
  assert.deepEqual(dobre.filter((p) => p.rodzaj === 'imie' && !r(p).ok).map((p) => p.tekst), []);
  assert.deepEqual(dobre.filter((p) => p.rodzaj === 'firma' && !r(p).ok && !r(p).mozna_potwierdzic).map((p) => p.tekst), [], 'twarda blokada prawdziwej firmy');
  const miekkie = dobre.filter((p) => p.rodzaj === 'firma' && !r(p).ok).map((p) => p.tekst);
  assert.ok(miekkie.length <= 4, 'za dużo alarmów do potwierdzenia: ' + miekkie.join(' | '));
});

test('wpisy do zablokowania odpadają: wg kategorii, z progiem', async () => {
  const { sprawdz } = await M();
  const PROG = { wulgarne: 0.98, obrazliwe: 0.95, polityczne: 0.9, reklamowe: 0.95, wrazliwe: 0.8 };
  for (const [kat, prog] of Object.entries(PROG)) {
    const z = PRZYKLADY.filter((p) => p.blokowac && p.kategoria === kat);
    assert.ok(z.length >= 5, kat + ': za mało przykładów');
    const przeszlo = z.filter((p) => sprawdz(p.tekst, { rodzaj: p.rodzaj }).ok).map((p) => p.tekst);
    assert.ok(1 - przeszlo.length / z.length >= prog, `${kat}: przeszło ${przeszlo.length}/${z.length}: ${przeszlo.join(' | ')}`);
  }
});

test('obejścia: cyfry, kropki, spacje, gwiazdki, powtórzenia, cyrylica', async () => {
  const { sprawdz } = await M();
  for (const t of ['kurwa', 'KURWA', 'kurva', 'qrwa', 'kur3a'.replace('3', 'w'), 'k0rwa'.replace('0', 'u'), 'kuuurwaaa', 'k u r w a', 'k.u.r.w.a', 'k-u-r-w-a', 'ku rwa', 'k*rwa', 'ku**a', 'chuj', 'huj', 'hój', 'ch*j', 'cHuJ', 'j3bac', 'jebać', 'p1zda', 'pi2da'.replace('2', 'z'), 'сука', 'хуй', 'ｋｕｒｗａ', 'wkurwiony', 'pier.dol', 'Kur.wiszon', 'Pierdo-Lono', 'ku​rwa', '*****'])
    assert.equal(sprawdz(t, { rodzaj: 'imie' }).ok, false, t);
});

test('podobne, ale niewinne: imiona, miejscowości, firmy', async () => {
  const { sprawdz } = await M();
  for (const t of ['Cyprian', 'Kornel', 'Hubert', 'Szymon', 'Kasia', 'Fabian', 'Anna-Maria', 'Jan-Paweł', 'Dorota', 'Łukasz', 'Żaneta', 'Marek', 'Ola', 'Rafał', 'Piotr', 'Bartosz', 'Kuba', 'Pia']) assert.equal(sprawdz(t, { rodzaj: 'imie' }).ok, true, t);
  for (const t of ['Kutno Trans', 'Pierre Cardin', 'Dupont', 'Cipriani', 'Skurczyński', 'Kurowski Sp. z o.o.', 'Suchy Las', 'Pizzeria Roma', 'Szmaragd', 'Rakowski', 'Biuro Rachunkowe Nowak', 'Piekarnia u Kasi', 'Auto Serwis Bieg', 'Sklep Biegowy Marek', 'Kurek i Synowie', 'Analizy Rynkowe', 'Pisarz Sp. z o.o.', 'Kur Wiejski Rosół', 'Nowak-Kowalski Serwis', 'Wiśniewski i Synowie S.A.', 'Baran i Córki', 'Biedronka Sklep']) assert.equal(sprawdz(t, { rodzaj: 'firma' }).ok, true, t);
});

test('wynik dla panelu: wulgaryzmu nie da się potwierdzić, reszta tak; komunikat nie powtarza słowa', async () => {
  const { sprawdz, komunikat } = await M();
  assert.equal(sprawdz('kurwa', { rodzaj: 'firma' }).mozna_potwierdzic, false);
  assert.equal(sprawdz('Transport Kutasiewicz', { rodzaj: 'firma' }).mozna_potwierdzic, true, 'rdzeń łapie też nazwiska: firmę trener może potwierdzić');
  assert.equal(sprawdz('Kutasiewicz', { rodzaj: 'imie' }).mozna_potwierdzic, false, 'imienia nie potwierdzamy');
  const p = sprawdz('Auto Duda', { rodzaj: 'firma' });
  assert.equal(p.ok, false); assert.equal(p.kategoria, 'polityczne'); assert.equal(p.mozna_potwierdzic, true);
  assert.match(komunikat(p), /Sprawdziłem tę nazwę/);
  assert.doesNotMatch(komunikat(sprawdz('kurwa')), /kurw|Sprawdziłem/);
  assert.deepEqual(sprawdz(''), { ok: true }); assert.deepEqual(sprawdz(null), { ok: true });
});

test('karton w grze: tylko pierwsze słowo, wulgaryzm i dziwne znaki dają zapasowe hasło', async () => {
  const { imieNaKarton } = await M();
  assert.equal(imieNaKarton('Filip'), 'Filip!');
  assert.equal(imieNaKarton('Filip Janczak'), 'Filip!', 'nazwisko z profilu nie stoi przy trasie');
  assert.equal(imieNaKarton('Anna-Maria'), 'Anna-Maria!');
  for (const z of ['kurwa', 'k*rwa', '<b>x</b>', 'https://a.pl', '', null, 'Bardzodlugieimieponadlimit', 'Tusk', 'Rak']) assert.equal(imieNaKarton(z), 'Dawaj!', String(z));
  assert.equal(imieNaKarton('kurwa', 'Brawo!'), 'Brawo!');
});
