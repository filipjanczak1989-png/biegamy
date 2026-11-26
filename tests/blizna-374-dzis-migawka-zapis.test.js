// Blizna #374 (26.11.2026) — nowe Dziś nie zostawiało niczego na czas bez sieci.
//
// Stare Dziś po każdym udanym odczycie zapisuje fragment widoku do migawki w telefonie (js/dzis-offline.js) i bez
// sieci rysuje ekran z niej. Nowe Dziś pokazywało bez sieci „Nie udało się wczytać”, bo nic nie pamiętało.
// Ten commit to sam ZAPIS (odczyt: blizna-375). Decyzja Filipa 26.11: ta sama migawka co stare Dziś, z nową
// częścią „dzisNowe”; moduł dalej nie dotyka pamięci telefonu sam, zapis idzie przez DzisOffline.zapisz.
// Testy czytają migawkę tak, jak leży w telefonie: surowy napis JSON spod klucza konta.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, TERAZ, UID, PROFIL, TRENING, MODUL, OFFLINE } = require('./_dzis-nowy-strona.js');

test('(1) po udanym wczytaniu w telefonie leży część „dzisNowe”: profil, ulica, trening z dniem, wiadomość, wpisy i godzina', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const m = s.migawka();
  assert.equal(m.userId, UID);
  const n = m.czesci.dzisNowe;
  assert.deepEqual(Object.keys(n).sort(), ['czas', 'profil', 'trening', 'ts', 'tydzien', 'ulica', 'wiadomosc', 'wpisy']);   // „tydzien” od E6a (blizna-376)
  assert.deepEqual(n.czas, { profil: TERAZ, ulica: TERAZ, trening: TERAZ, wiadomosc: TERAZ, wpisy: TERAZ, tydzien: TERAZ }, 'każde pole ma własną godzinę (blizna-375: pasek „Offline” w stanie mieszanym)');
  assert.deepEqual(n.profil, { id: 'a-1', full_name: 'Ola Nowak', trener: true, intervals_athlete_id: 'i123', intervals_connected_at: '2026-10-01T10:00:00Z', intervals_can_write: true, intervals_token_dead_at: null });
  assert.deepEqual(n.ulica, { licznik: { wystartowala: true, km: 3607, cel_km: 12500, nazwa: 'Ulica próbna' }, wklad: { km: 196 }, adres: 'ulica-glowna.html#ulica-po' });
  assert.deepEqual(n.trening, { dzien: '2026-11-26', lista: TRENING }, 'trening niesie dzień, którego dotyczy');
  assert.equal(n.wiadomosc.body, 'Jutro luźno.');
  assert.deepEqual(n.wpisy.map((x) => x.id), ['l1', 'l2']);
  assert.equal(n.ts, TERAZ);
  assert.doesNotMatch(JSON.stringify(n.profil), /c-9|coach_id/, 'w profilu migawki nie ma identyfikatora trenera, tylko „czy jest”');
  assert.ok(JSON.stringify(n).length < 6000, 'kilka kB, daleko od limitu 200 kB: ' + JSON.stringify(n).length);
  assert.equal(s.zgloszenia.length, 0);
});

test('(2) kilka pól z jednej fali to jeden zapis; całe wczytanie to najwyżej kilka zapisów, nie jeden na pole i nie jeden na klatkę', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const ile = s.tel.zapisy.filter((k) => k === 'bm_dzis_migawka_' + UID).length;
  assert.ok(ile >= 1 && ile <= 3, 'zapisów migawki: ' + ile);
  s.B.start(); await s.doKonca();
  assert.equal(s.tel.zapisy.filter((k) => k !== 'dn_kadr').length, ile, 'ponowny start w oknie 60 s niczego nie pyta i niczego nie zapisuje');
  assert.equal(s.tel.zapisy.filter((k) => k === 'dn_kadr').length, 1, 'pamięć kadrów nagłówka zapisana raz (blizna-385)');
});

test('(3) nieudane zapytanie nie kasuje tego, co już było w telefonie: każde pole to ostatnia UDANA odpowiedź', async () => {
  const a = strona(); a.B.start(); await a.doKonca();
  // następne wejście (nowa strona, ta sama pamięć telefonu): wpisy i trening nie dochodzą, reszta tak
  const b = strona({ pamiec: a.tel.mapa, awaria: { training_logs: 'odmowa', trainings: 'siec' }, wklad: { km: 205 }, teraz: TERAZ + 3600e3 }); b.B.start(); await b.doKonca();
  const n = b.migawka().czesci.dzisNowe;
  assert.deepEqual(n.wpisy.map((x) => x.id), ['l1', 'l2'], 'wpisy z poprzedniego udanego wejścia zostają');
  assert.deepEqual(n.trening, { dzien: '2026-11-26', lista: TRENING });
  assert.equal(n.ulica.wklad.km, 205, 'a to, co doszło, jest świeże');
  assert.equal(n.ts, TERAZ + 3600e3);
  assert.deepEqual([n.czas.wpisy, n.czas.trening, n.czas.ulica, n.czas.profil], [TERAZ, TERAZ, TERAZ + 3600e3, TERAZ + 3600e3], 'godzina pola, które nie doszło, zostaje stara');
  // konto bez akcji i bez trenera: „nie ma” też jest wiedzą i zapisuje się jako null
  const c = strona({ licznik: { wystartowala: false }, profil: Object.assign({}, PROFIL, { coach_id: null }), trening: [] }); c.B.start(); await c.doKonca();
  const nc = c.migawka().czesci.dzisNowe;
  assert.equal(nc.ulica, null); assert.equal(nc.wiadomosc, null); assert.equal(nc.profil.trener, false); assert.deepEqual(nc.trening.lista, []);
  assert.equal(c.zapytania.filter((z) => z.nazwa === 'messages').length, 0, 'budżet bez zmian: bez trenera nie ma zapytania o wiadomość');
});

test('(4) prywatność po staremu: w podglądzie trenera nic się nie zapisuje; bez sesji nic; migawka innego konta znika; stare części zostają', async () => {
  const t = strona({ search: '?from=trener' }); t.B.start(); await t.doKonca();
  assert.equal(t.migawka(), null, 'podgląd trenera nie zostawia niczego w przeglądarce');
  assert.equal(t.tel.zapisy.length, 0);   // w podglądzie trenera moduł ustępuje, więc nie ma też kadru
  const bez = strona({ sesja: false }); bez.B.start(); await bez.doKonca();
  assert.deepEqual([...bez.tel.mapa.keys()], ['dn_kadr'], 'bez sesji żadnej migawki; zostaje tylko pamięć kadrów nagłówka (nazwa kadru, żadnych danych konta)');
  const s = strona();
  s.tel.mapa.set('bm_dzis_migawka_obcy', JSON.stringify({ userId: 'obcy', ts: 1, czesci: { logi: [{ id: 'cudzy' }] } }));
  s.tel.mapa.set('bm_dzis_migawka_' + UID, JSON.stringify({ userId: UID, ts: 5, czesci: { logi: [{ id: 'stary-ekran' }], hero: 'https://x/kadr.webp' } }));
  s.B.start(); await s.doKonca();
  assert.equal(s.tel.mapa.has('bm_dzis_migawka_obcy'), false, 'migawka innego konta skasowana przy okazji (robi to DzisOffline)');
  const m = s.migawka();
  assert.deepEqual(m.czesci.logi, [{ id: 'stary-ekran' }], 'części starego Dziś nietknięte');
  assert.equal(m.czesci.hero, 'https://x/kadr.webp'); assert.ok(m.czesci.dzisNowe.profil);
  s.D.wyczysc(); assert.equal([...s.tel.mapa.keys()].filter((k) => k.indexOf('bm_dzis_migawka_') === 0).length, 0, 'wylogowanie czyści także nową część');
});

test('(5) zapis nigdy nie psuje ekranu: pełna pamięć telefonu, brak modułu migawki, migawka ponad limit', async () => {
  const pelna = strona(); pelna.tel.setItem = () => { throw new Error('QuotaExceededError'); };
  pelna.B.start(); await pelna.doKonca();
  assert.match(pelna.kafel('ostatni').innerHTML, /<b>10<small>km/, 'kafle narysowane mimo błędu zapisu'); assert.equal(pelna.zgloszenia.length, 0);
  const brak = strona({ bezOffline: true }); brak.B.start(); await brak.doKonca();
  assert.match(brak.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.deepEqual([...brak.tel.mapa.keys()], ['dn_kadr']);
  const duza = strona({ wpisy: [wpis('l1', 5, { feel: 'good', comment: 'x'.repeat(210 * 1024) })] }); duza.B.start(); await duza.doKonca();
  const m = duza.migawka();
  assert.ok(!m || !m.czesci.dzisNowe || !m.czesci.dzisNowe.wpisy, 'migawka ponad 200 kB nie jest zapisywana (limit DzisOffline)');
});

test('(6) granice: nowa część jest na liście dozwolonych; moduł zapisuje tylko przez DzisOffline.zapisz i tylko „dzisNowe”', () => {
  assert.match(OFFLINE, /var CZESCI = \['logi', 'dzis', 'tydzien', 'trener', 'postep', 'zawodnik', 'wiadomosc', 'hero', 'dzisNowe'\];/);
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual(kod.match(/\.zapisz\([^)]*\)/g), ['.zapisz(mig.uid, "dzisNowe", mig.pola)']);
  assert.equal((kod.match(/localStorage/g) || []).length, 7, 'własny dostęp do pamięci telefonu tylko dla „Pomiń”, pamięci kadrów i szkicu odpowiedzi „Jak poszło?” (blizna-356, blizna-384, blizna-404); migawka idzie przez DzisOffline');
  assert.doesNotMatch(kod, /DzisOffline\.(wyczysc|_storage|klucz)|bm_dzis_migawka/);
  assert.doesNotMatch(kod, /zapamietaj\(nr, "profil", \{[^}]*coach_id:/, 'identyfikator trenera nie idzie do migawki');
});
