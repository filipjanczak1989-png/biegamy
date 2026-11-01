/* BLIZNA 71 (1.11.2026): podpisy kadrów dnia v2 — z opisów obrazów.

   Co się stało: przegląd 1.11 (opis z obrazu, gemini vision × _SOLO_PODPISY) znalazł podpisy mówiące o rzeczach,
   których na kadrze nie ma („Miasto jeszcze śpi." pod parkiem, „zasiałeś zimą" pod wiosennym lasem). Podpisy v2
   napisano z opisów obrazów (tools/kadry/opisy-kadrow.json). Ten test pilnuje formy podpisu i tego, że podpis nie
   wymienia rzeczy, której opis obrazu nie zna.

   Reguła rozjazdu jest WĄSKA i świadomie niepełna: osiem pojęć (śnieg, deszcz, mgła, noc, buty, dwójka, las, miasto),
   dopasowanie po rdzeniach słów. Poprawki wobec przeglądu (fałszywe alarmy zmierzone na v2): „zamglony", „dwoma",
   odliczanie „trzy, dwa" i „para z ust" nie są rozjazdem; „buty" to rozjazd tylko na kadrze bez biegacza.
   Samokontrola: na podpisach v1 reguła MUSI złapać 13 (miasto) i 81 (śnieg) — inaczej test jest martwy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
function podpisy(src) {
  const i0 = src.indexOf('const _SOLO_PODPISY = [');
  assert.ok(i0 > 0, 'brak _SOLO_PODPISY w zawodnik.html');
  const i1 = src.indexOf('];', i0);
  return new Function('return ' + src.slice(i0 + 'const _SOLO_PODPISY = '.length, i1 + 1))();
}
const P = podpisy(zaw);
const OPISY = JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools', 'kadry', 'opisy-kadrow.json'), 'utf8')).kadry;
const bezAkcentu = (p) => p.replace(/\*/g, '');
const slowa = (p) => bezAkcentu(p).split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w));

const w = (r) => new RegExp('(?:^|[^\\p{L}])(?:' + r + ')', 'iu');
const BIEGACZ = w('biega|biegn|biegacz|mężczy|kobiet|postać|postaci|dwie osoby|dwoje|dwóch|jedna osoba|osoba');
const POJECIA = {
  'śnieg':  [w('śnieg|śnież|zim|mróz|mroź'), w('śnieg|śnież|zim|mróz|mroź|szron|oszronion')],
  'deszcz': [w('deszcz|kałuż|ulew|mokr|krople'), w('deszcz|kałuż|mokr|mżawk|odwilż|ulew')],
  'mgła':   [w('mgł|mgieł|mglist'), w('mgł|mgieł|mglist|zamglon|mgl')],
  'noc':    [w('noc|ciemn|gwiazd|księżyc|latarn|zmrok|zmierzch'), w('noc|ciemn|gwiazd|księżyc|latarn|zmrok|zmierzch|wieczor|po zachodzie')],
  'buty':   [w('but|sznurów|sznurowad|podeszw'), { test: (o) => w('but|obuw|sznurów|sznurowad|podeszw').test(o) || BIEGACZ.test(o) }],
  'dwójka': [w('dwie|dwoje|dwój|dwóch|dwaj|razem|parą|partner'), w('dwa|dwie|dwoje|dwój|dwóch|dwaj|dwoma|dwiema|para|parę|parą|grup|kilk|trzy|trzech|troje|wiele osób|kilkoro|biegaczy|osób|osobami')],
  'las':    [w('las|lesie|leśn|drzew'), w('las|lesie|leśn|drzew|zalesion')],
  'miasto': [w('miast|ulic|bruk|chodnik|beton|asfalt|blok|kamienic'), w('miast|miejsk|ulic|bruk|chodnik|beton|asfalt|blok|budyn|kamienic|zabudow|osiedl')],
};
function rozjazdy(lista) {
  const wynik = [];
  lista.forEach((p, i) => {
    const opis = OPISY[i + 1] || '';
    for (const [k, [wP, wO]] of Object.entries(POJECIA)) if (wP.test(bezAkcentu(p)) && !wO.test(opis)) wynik.push(`${i + 1} ${k}: ${bezAkcentu(p)}`);
  });
  return wynik;
}

test('89 podpisów = 89 kadrów = 89 opisów obrazów', () => {
  assert.equal(P.length, 89);
  assert.equal(Object.keys(OPISY).length, 89);
  for (let n = 1; n <= 89; n++) assert.ok(typeof OPISY[n] === 'string' && OPISY[n].length > 20, `opis kadru ${n}`);
});

test('każdy podpis: ≤ 8 słów, dokładnie jeden *akcent*', () => {
  for (const [i, p] of P.entries()) {
    assert.ok(slowa(p).length <= 8, `${i + 1}: ${slowa(p).length} słów — ${p}`);
    assert.equal((p.match(/\*[^*\s][^*]*\*/g) || []).length, 1, `${i + 1}: akcent — ${p}`);
    assert.equal((p.match(/\*/g) || []).length, 2, `${i + 1}: gwiazdki — ${p}`);
  }
});

test('bez słów zakazanych (wszyscy / każdy / zawsze / nigdy) i bez wykrzyknika', () => {
  const ZAKAZANE = w('wszyscy|każdy|każda|każde|zawsze|nigdy');
  for (const [i, p] of P.entries()) {
    /* Wyjątek jedyny i wąski: kadr 02 „*Każdy* swoim tempem" — podpis podyktowany przez Filipa 1.11 20:45 (komenda „razem");
       „każdy" opisuje tu różne tempa dwóch osób z daleka, nie obietnicę. Inny podpis z „każdy" nadal czerwony. */
    if (i === 1 && p === 'Szary świt, kręta droga. *Każdy* swoim tempem.') continue;
    assert.ok(!ZAKAZANE.test(bezAkcentu(p)), `${i + 1}: ${p}`);
    assert.ok(!p.includes('!'), `${i + 1}: wykrzyknik — ${p}`);
  }
});

test('bez duplikatów (wielkość liter i akcent nie mają znaczenia)', () => {
  const widziane = new Map();
  for (const [i, p] of P.entries()) {
    const k = bezAkcentu(p).toLowerCase().trim();
    assert.ok(!widziane.has(k), `${i + 1} = ${widziane.get(k)}: ${p}`);
    widziane.set(k, i + 1);
  }
});

test('samokontrola reguły rozjazdów: podpisy v1 łapią 13 (miasto) i 81 (śnieg)', () => {
  const v1 = [...P];
  v1[12] = 'Miasto jeszcze śpi. Ty *już* nie.';
  v1[80] = 'Wszystko, co zasiałeś zimą, *rusza*.';
  const r = rozjazdy(v1);
  assert.ok(r.some((x) => x.startsWith('13 miasto')), r.join('\n'));
  assert.ok(r.some((x) => x.startsWith('81 śnieg')), r.join('\n'));
});

test('podpis nie wymienia rzeczy, której nie ma w opisie obrazu (reguła z przeglądu 1.11)', () => {
  assert.deepEqual(rozjazdy(P), []);
});

/* PODPISY „RAZEM" (1.11.2026 wieczór, komenda Filipa 20:45). Opis strukturalny kadrów (tools/kadry/opisy-kadrow.json →
   struktura: liczba_osob, relacja obok_siebie/blisko/daleko/jeden_w_oddali/brak, …; vision z responseSchema, sprawdzone
   na oko na 6 kadrach). Słowa wspólnoty (razem, we dwóch/dwoje/troje, ramię w ramię, dwoje, dwóch, troje, trzech, grupa,
   umówili, rozmowa) wymagają relacji obok_siebie albo blisko; liczebnik musi równać się liczba_osob.
   ZAPADKA: podpisy pisze Filip — numery z rozjazdem czekają w ZNANE_ROZJAZDY_RAZEM (arkusze Downloads\podpisy-do-poprawy-*.png).
   Lista musi się zgadzać DOKŁADNIE: nowy rozjazd = czerwono; poprawiony podpis = zdejmij numer z listy w tym samym commicie. */
const STRUKTURA = JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools', 'kadry', 'opisy-kadrow.json'), 'utf8')).struktura;
const WSPOLNOTA = w('razem|we dw(?:óch|oje|ie)|we troje|ramię w ramię|dwoje|dwóch|dwie|dwaj|troje|trzech|grup|umówi|rozmow');
// bez „trzy": odliczanie „Za trzy, dwa, start" (22) to nie liczba osób
const LICZEBNIK = [[w('we troje|troje|trzech'), 3], [w('we dw(?:óch|oje|ie)|dwoje|dwóch|dwie|dwaj'), 2]];
const ZNANE_ROZJAZDY_RAZEM = [8, 9, 18, 20, 21, 26, 30, 38, 41, 46, 50];   // 1.11.2026 — czekają na podpisy Filipa
function rozjazdyRazem(lista) {
  const out = [];
  lista.forEach((p, i) => {
    const s = STRUKTURA[i + 1], t = bezAkcentu(p);
    if (WSPOLNOTA.test(t) && !['obok_siebie', 'blisko'].includes(s.relacja)) out.push({ nr: i + 1, co: 'relacja ' + s.relacja });
    for (const [re, n] of LICZEBNIK) if (re.test(t)) { if (s.liczba_osob !== n) out.push({ nr: i + 1, co: `liczebnik ${n} ≠ ${s.liczba_osob} osób` }); break; }
  });
  return out;
}

test('struktura kadrów: 89 wpisów, pola i wartości z dozwolonych zbiorów, relacja zgodna z liczbą osób', () => {
  assert.equal(Object.keys(STRUKTURA).length, 89);
  for (let n = 1; n <= 89; n++) {
    const s = STRUKTURA[n];
    assert.ok(Number.isInteger(s.liczba_osob) && s.liczba_osob >= 0, `${n} liczba_osob`);
    assert.ok(['obok_siebie', 'blisko', 'daleko', 'jeden_w_oddali', 'brak'].includes(s.relacja), `${n} relacja`);
    assert.ok(['do_aparatu', 'od_aparatu', 'w_bok', 'rozne', 'brak'].includes(s.kierunek), `${n} kierunek`);
    assert.ok(['swit', 'dzien', 'zmierzch', 'noc'].includes(s.pora), `${n} pora`);
    for (const k of ['pogoda', 'nawierzchnia', 'otoczenie']) assert.ok(typeof s[k] === 'string' && s[k].length, `${n} ${k}`);
    if (s.liczba_osob === 0) assert.equal(s.relacja, 'brak', `${n}: 0 osób = brak`);
    if (s.liczba_osob === 1) assert.equal(s.relacja, 'jeden_w_oddali', `${n}: 1 osoba = jeden_w_oddali`);
  }
});

test('słowa wspólnoty tylko przy relacji obok_siebie/blisko, liczebnik = liczba osób — rozjazdy = dokładnie lista czekająca na Filipa', () => {
  const r = rozjazdyRazem(P);
  assert.deepEqual([...new Set(r.map((x) => x.nr))], ZNANE_ROZJAZDY_RAZEM, r.map((x) => `${x.nr} ${x.co}: ${P[x.nr - 1]}`).join('\n'));
  assert.equal(P[1], 'Szary świt, kręta droga. *Każdy* swoim tempem.', 'kadr 02 wg komendy 20:45');
});

test('samokontrola reguły „razem": „ramię w ramię" na kadrze z dwiema osobami daleko i „troje" przy dwóch osobach są łapane', () => {
  const v = [...P];
  const daleko = Object.keys(STRUKTURA).find((k) => STRUKTURA[k].relacja === 'daleko' && !ZNANE_ROZJAZDY_RAZEM.includes(Number(k)));
  const blisko2 = Object.keys(STRUKTURA).find((k) => STRUKTURA[k].relacja === 'blisko' && STRUKTURA[k].liczba_osob === 2);
  v[daleko - 1] = 'Ramię w ramię, *razem*.';
  v[blisko2 - 1] = 'Troje na drodze. *Grupa* ciągnie.';
  const r = rozjazdyRazem(v);
  assert.ok(r.some((x) => x.nr === Number(daleko) && /relacja/.test(x.co)), JSON.stringify(r));
  assert.ok(r.some((x) => x.nr === Number(blisko2) && /liczebnik 3/.test(x.co)), JSON.stringify(r));
});
