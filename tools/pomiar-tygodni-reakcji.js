#!/usr/bin/env node
/* POMIAR: ile słabych tygodni z rzędu powinno uruchamiać reakcję planu.
   Odpowiada na pytanie o `TYGODNI_DO_REAKCJI` w js/generator-planu.js.

   Wykonany 18.08.2026 — wyniki i wnioski są przy samej stałej w silniku.
   Ten plik istnieje po to, żeby dało się je POWTÓRZYĆ, a nie uwierzyć.

   ⚠️ CO TO MIERZY NAPRAWDĘ. Dziś w bazie jest ZERO planów z generatora, więc
   liczy się na planach trenerskich i AI. Zakładamy, że trzymanie się planu
   trenera zachowuje się jak trzymanie się planu generatora — to wskaźnik
   zastępczy, nie ten sam pomiar. Wracać tu, gdy planów z generatora będzie
   kilkanaście.

   ⚠️ TYGODNIE NIEZAMKNIĘTE SĄ ODCIĘTE W ZAPYTANIU, nie tutaj. Tydzień w trakcie
   ma z natury mniej przebiegnięte niż zaplanowane i wliczony zaniżałby wszystko;
   przy pierwszym podejściu do tego pomiaru serie sięgały 2026-08-24, czyli
   w przyszłość.

   UŻYCIE
     1) wyciągnij serię tygodni (wymaga dostępu read-only do prod):
          supabase db query --linked -o csv "$(cat tools/pomiar-tygodni-reakcji.sql)" > /tmp/serie.csv
     2) node tools/pomiar-tygodni-reakcji.js /tmp/serie.csv
   CSV: athlete_id,tydzien_iso,stosunek_wykonania
*/
const fs = require('fs');

const DOL = 0.75;        // DOLNY_PROG_WYKONANIA z silnika
const OBNIZKA = 0.80;    // OBNIZKA_PRZY_NIEDOWYKONANIU

function wczytaj(plik) {
  const rows = fs.readFileSync(plik, 'utf8').trim().split('\n')
    .map(l => l.split(','))
    .map(c => ({ a: c[0], w: c[1], st: parseFloat(c[2]) }))
    .filter(r => r.a && r.w && isFinite(r.st));
  if (!rows.length) {
    console.error('⚠️ ZERO wierszy — pomiar bez danych nie jest pomiarem. Sprawdź CSV.');
    process.exit(1);
  }
  const byA = {};
  rows.forEach(r => { (byA[r.a] = byA[r.a] || []).push(r); });
  Object.keys(byA).forEach(a => byA[a].sort((x, y) => x.w < y.w ? -1 : 1));
  return { rows, byA };
}

/* Czy słaby tydzień przewiduje kolejny słaby — i czy KOLEJNE słabe coś dokładają.
   To jest test na TRAFNOŚĆ: jeśli krzywa się nasyca, dłuższe czekanie nie
   kupuje wiedzy, tylko zwłokę. */
function trafnosc(byA) {
  const out = [];
  let wszystkie = 0, slabe = 0;
  for (const a of Object.keys(byA)) for (const r of byA[a]) { wszystkie++; if (r.st < DOL) slabe++; }
  out.push({ warunek: 'baza', n: wszystkie, P: slabe / wszystkie });
  for (const K of [1, 2, 3]) {
    let n = 0, trafien = 0;
    for (const a of Object.keys(byA)) {
      const s = byA[a];
      for (let i = K; i < s.length; i++) {
        // ciągłość: wszystkie K poprzednich muszą sąsiadować tydzień w tydzień
        let ciagle = true;
        for (let j = 0; j < K; j++) {
          const d = (new Date(s[i - j].w) - new Date(s[i - j - 1].w)) / 86400000;
          if (d !== 7) { ciagle = false; break; }
        }
        if (!ciagle) continue;
        let wszystkieSlabe = true;
        for (let j = 1; j <= K; j++) if (!(s[i - j].st < DOL)) { wszystkieSlabe = false; break; }
        if (!wszystkieSlabe) continue;
        n++; if (s[i].st < DOL) trafien++;
      }
    }
    out.push({ warunek: 'po ' + K + ' słabych', n: n, P: n ? trafien / n : NaN });
  }
  return out;
}

/* Automat obniżki dokładnie jak `oceniAdaptacje`: wejście po N słabych z rzędu,
   wyjście po N tygodniach bez słabego, a W OBNIŻCE cel jest przeskalowany —
   bez tego ostatniego wyjście nie odpala nigdy (patrz komentarz przy stałej). */
function symuluj(byA, N) {
  let wejsc = 0, wyjsc = 0, tygObn = 0, tygRazem = 0;
  for (const a of Object.keys(byA)) {
    const s = byA[a];
    let obn = false, hist = [];
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (new Date(s[i].w) - new Date(s[i - 1].w)) / 86400000 !== 7) hist = [];
      hist.push((s[i].st / (obn ? OBNIZKA : 1)) < DOL);
      if (hist.length > N) hist.shift();
      tygRazem++; if (obn) tygObn++;
      if (hist.length === N) {
        if (!obn && hist.every(x => x)) { obn = true; wejsc++; hist = []; }
        else if (obn && hist.every(x => !x)) { obn = false; wyjsc++; hist = []; }
      }
    }
  }
  return { N, wejsc, wyjsc, zmian: wejsc + wyjsc,
           procObnizce: (tygObn / tygRazem * 100).toFixed(1),
           coIleTyg: (wejsc + wyjsc) ? (tygRazem / (wejsc + wyjsc)).toFixed(1) : '—' };
}

const plik = process.argv[2];
if (!plik) { console.error('użycie: node tools/pomiar-tygodni-reakcji.js <serie.csv>'); process.exit(1); }
const { rows, byA } = wczytaj(plik);
const zawodnikow = Object.keys(byA).length;

console.log('\nPOMIAR TYGODNI_DO_REAKCJI');
console.log('serie: ' + zawodnikow + ' zawodników, ' + rows.length + ' zamkniętych tygodni planowych\n');

console.log('1) TRAFNOŚĆ — czy dłuższe czekanie wie więcej?');
for (const r of trafnosc(byA)) {
  console.log('   ' + r.warunek.padEnd(14) + ' n=' + String(r.n).padStart(4) +
              '   P(następny słaby) = ' + (isFinite(r.P) ? r.P.toFixed(3) : '—'));
}
console.log('   ⚠️ Jeśli krzywa się nasyca, kolejne tygodnie kupują zwłokę, nie wiedzę.\n');

console.log('2) STABILNOŚĆ — jak często plan zmieniałby stan');
console.log('    N | wejść | wyjść | zmian | % tyg. w obniżce | zmiana stanu co');
for (const N of [1, 2, 3, 4]) {
  const r = symuluj(byA, N);
  console.log('   ' + String(r.N).padStart(2) + ' | ' + String(r.wejsc).padStart(5) + ' | ' +
              String(r.wyjsc).padStart(5) + ' | ' + String(r.zmian).padStart(5) + ' | ' +
              String(r.procObnizce).padStart(16) + ' | ' + r.coIleTyg + ' tyg.');
}
/* ⚠️ „ZERO WYJŚĆ" PRAWIE NIGDY NIE ZNACZY „REGUŁA NIE WYPUSZCZA".
   Wyjście przy N wymaga N czystych tygodni Z RZĘDU, a przy bazowej częstości
   słabych tygodni p szansa na to wynosi (1−p)^N na jedno wejście. Przy małej
   liczbie wejść zero wyjść bywa zwyczajnie spodziewane. Liczymy to wprost,
   zamiast zostawiać czytelnikowi wrażenie, że reguła jest pułapką. */
const wszystkieTyg = rows.length;
let slabychRazem = 0;
for (const a of Object.keys(byA)) for (const r of byA[a]) if (r.st < DOL) slabychRazem++;
const p = slabychRazem / wszystkieTyg;
console.log('\n   Ile trzeba, żeby WYJŚĆ — przy bazowej częstości słabych ' + p.toFixed(3) + ':');
for (const N of [1, 2, 3, 4]) {
  const r = symuluj(byA, N);
  const szansa = Math.pow(1 - p, N);
  const zeroOczek = Math.pow(1 - szansa, r.wejsc);
  console.log('   N=' + N + '  szansa na wyjście z jednego wejścia ' + (szansa * 100).toFixed(0) +
              '%   przy ' + r.wejsc + ' wejściach P(zero wyjść) = ' + (zeroOczek * 100).toFixed(0) + '%');
}
console.log('   ⚠️ Gdy ostatnia kolumna jest wysoka, „zero wyjść" nie jest dowodem na nic.');
console.log('   ⚠️ Średnia seria to ' + (wszystkieTyg / zawodnikow).toFixed(1) + ' tyg. na osobę — przy dużych N');
console.log('      dochodzi drugie ograniczenie: w serii nie ma miejsca na 2×N tygodni.\n');
