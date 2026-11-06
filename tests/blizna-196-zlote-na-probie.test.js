/* BLIZNA 196 / ZŁOTE CEGŁY NA PRÓBIE PRZEPADAŁY (zgłoszenie Maćka, konto testowe, 6.11 wieczorem po 7e978c62).
   Odtworzone w Chrome prawdziwą rundą (bot łapie złote, ~/.cache/bm-wydajnosc/zlote-proba.js): gdy funkcja akcja-proba-wizerunek odpowiadała błędem
   (401 przy wygasłej sesji, 500, brak sieci), gra wychodziła z próby, ale zostawała otwarta jak zwykłe konto przed startem. Runda szła do bazy, baza odmawiała
   („wylaczona”, gra_aktywna = false), a gra milczała: na ekranie końca „2 złote”, w menu 0. Przy działającej funkcji próba liczyła poprawnie.
   - konto testowe z pamięci zostaje na próbie przy awarii funkcji; tylko odmowa 403 (zwykłe konto) wraca do konta z bazy i kasuje znacznik;
   - odmowa „wylaczona” nie jest już cicha: „Gra rusza razem z akcją: ta runda się nie liczy.”
   Prawdziwa ścieżka po starcie sprawdzona osobno (tools/gra-zlote-test.sh, transakcja wycofana na produkcji): złote na saldo 1:1, do muru tylko zwykłe cegły,
   punkty = cegły × mnożnik poziomu, ponad 0,5 złotej na sekundę runda odrzucona, km akcji bez zmian. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const K = czytaj('js/cegielki-konto.js');

/* sciezkaGry z prawdziwego pliku, z atrapą funkcji próby, pamięci telefonu i reszty otoczenia */
async function sciezka(odpowiedz, kontoTestowe) {
  const kod = K.slice(K.indexOf('  async function sciezkaGry('), K.indexOf('  function ustawPodglad('));
  const pamiec = new Map([['cegielki_konto_proby', 'uid-1']]), wywolane = [];
  const c = {
    window: { sb: { functions: { invoke: async () => { if (odpowiedz === 'siec') throw new TypeError('Failed to fetch'); return odpowiedz; } } } },
    localStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)), removeItem: (k) => pamiec.delete(k) },
    document: { body: { classList: { remove: () => wywolane.push('otwarta') } } },
    stan: {}, KLUCZ_KONTA_PROBY: 'cegielki_konto_proby', ustawPodglad: () => wywolane.push('ustawPodglad'),
    parametry: new URLSearchParams(''), czytajJson: () => null, zapiszJson: () => {}, $: () => null, location: { reload() {} },
  };
  vm.createContext(c);
  vm.runInContext(kod + '\nglobalThis.sciezkaGry = sciezkaGry;', c);
  let wynik;
  try { wynik = await c.sciezkaGry(kontoTestowe, 'uid-1'); } catch (e) { wynik = 'wyjątek: ' + e.message; }
  return { wynik, znacznik: pamiec.get('cegielki_konto_proby') || null, wywolane };
}
const blad = (status) => ({ data: null, error: { context: { status } } });

test('konto testowe: awaria funkcji próby zostawia próbę, tylko 403 wraca do konta z bazy', async () => {
  const ok = await sciezka({ data: { ok: true, proba_od: 'x' }, error: null }, true);
  assert.deepEqual([ok.wynik, ok.znacznik, ok.wywolane.includes('ustawPodglad')], [true, 'uid-1', true], 'funkcja OK: próba z danymi funkcji');
  for (const [opis, odp] of [['401 wygasła sesja', blad(401)], ['500 awaria', blad(500)], ['brak odpowiedzi', { data: null, error: { message: 'x' } }], ['ok: false', { data: { ok: false }, error: null }]]) {
    const w = await sciezka(odp, true);
    assert.equal(w.wynik, true, opis + ': zostaje próba (rundy liczą się na telefonie, nic nie idzie do bazy)');
    assert.equal(w.znacznik, 'uid-1', opis + ': znacznik zostaje');
  }
  const odm = await sciezka(blad(403), true);
  assert.deepEqual([odm.wynik, odm.znacznik], [false, null], '403: zwykłe konto, znacznik skasowany');
  const siec = await sciezka('siec', true);
  assert.match(String(siec.wynik), /wyjątek: Failed to fetch/, 'wyjątek sieci wychodzi do polacz() jak dotąd');
});

test('bez konta testowego (ścieżka trenera): błąd funkcji = brak przełącznika, jak dotąd', async () => {
  for (const odp of [blad(401), blad(403), blad(500)]) assert.equal((await sciezka(odp, false)).wynik, false);
});

test('polacz: próba ustawiona przed odpowiedzią funkcji, cofnięta tylko przy odmowie; odmowa „wylaczona” nie jest cicha', () => {
  const p = K.slice(K.indexOf('if (kontoProbyZPamieci(sesja.user.id)) {'), K.indexOf('else if (parametry.get("sciezka") === "1") await sciezkaGry();'));
  assert.ok(p.indexOf('stan.podglad = true;') >= 0 && p.indexOf('stan.podglad = true;') < p.indexOf('await sciezkaGry(true'));
  assert.match(p, /if \(!\(await sciezkaGry\(true, sesja\.user\.id\)\)\) \{ stan\.podglad = false;/);
  assert.match(K, /info\(runda\.powod === "wylaczona" \? "Gra rusza razem z akcją: ta runda się nie liczy\." :/);
  assert.match(K, /if \(stan\.podglad\) \{\n\s+var przedProba = L\.poziom\(stan\.cegly\);\n\s+stan\.cegly \+= w\.cegly; zapiszJson\("cegielki_suma", stan\.cegly\);\n\s+ustawKonto\(\(stan\.saldo \|\| 0\) \+ \(\(w\.st && w\.st\.zlote\) \|\| 0\)\); zapiszJson\("cegielki_saldo", stan\.saldo\);/, 'na próbie złote na saldo telefonu');
  assert.match(K, /function przedRunda\(\) \{\n\s+stan\.runda = null;\n\s+if \(stan\.podglad \|\| premiera\) return;/, 'na próbie runda nie idzie do bazy');
});

test('prawdziwa ścieżka: test po skutku w bazie (wycofana transakcja) sprawdza saldo, mur, punkty, pułap i km', () => {
  const sql = czytaj('tools/gra-zlote-test.sql'), sh = czytaj('tools/gra-zlote-test.sh');
  assert.match(sh, /echo 'rollback;'/, 'zawsze wycofana');
  for (const f of ['FAIL 1: przed startem', 'FAIL 3: złote na saldzie', 'FAIL 4: mur', 'FAIL 5: punkty', 'FAIL 8: 31 złotych', 'FAIL 9: gra zmieniła km']) assert.ok(sql.includes(f), f);
  assert.doesNotMatch(sql, /wystartowala_at\s*=/, 'test nie rusza wystartowala_at: wyzwalacz pushu startu milczy');
});
