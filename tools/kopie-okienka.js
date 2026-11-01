// M3-2: generuje KOPIE dla EF (Deno) z jedynych źródeł w aplikacji:
//   sb.js window.METRIC_TOOLTIPS → supabase/functions/_shared/pojecia.mjs (tytuł + „Co to jest" jako czysty tekst)
//   odznaki.html BADGES → supabase/functions/_shared/odznaki-nazwy.mjs (nazwy + opisy)
const fs = require('fs'), vm = require('vm');
const K = process.argv[2] || '.';
const sb = fs.readFileSync(K + '/sb.js', 'utf8');
const i = sb.indexOf('  window.METRIC_TOOLTIPS = {'), j = sb.indexOf('\n  };', i);
const okno = {};
vm.runInNewContext(sb.slice(i, j + 5).replace(/\r/g, ''), { window: okno });
const czysty = (html) => String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const KLUCZE = { tsb: ['tsb', 'swiezosc', 'swiezosci'], ctl: ['ctl'], atl: ['atl'], trimp: ['trimp'], weekly_km: ['kilometraz', 'kilometrazu'],
  kalorie: [], heatmap: ['heatmap', 'heatmapa', 'heatmapy', 'mapa cieplna', 'mape cieplna'], types_pie: [], race_countdown: ['odliczanie'] };
const poj = Object.entries(okno.METRIC_TOOLTIPS).map(([k, v]) => {
  const s = v.sections.find((x) => x.heading === 'Co to jest');
  return `  ${JSON.stringify(k)}: { tytul: ${JSON.stringify(v.title)}, klucze: ${JSON.stringify(KLUCZE[k] || [])}, co_to: ${JSON.stringify(czysty(s.body))} },`;
}).join('\n');
fs.writeFileSync(K + '/supabase/functions/_shared/pojecia.mjs',
`// Pojęcia z ekranu Forma dla funkcji Edge (Deno) — KOPIA z window.METRIC_TOOLTIPS w sb.js (tytuł + sekcja „Co to jest"
// bez HTML). sb.js jest źródłem (ten sam tekst widzi zawodnik po tapnięciu „?" na kaflu); tę kopię pilnuje
// tests/blizna-84-okienko-m3-2.test.js — zmiana w sb.js bez zmiany tutaj = czerwony test. Generator: tools/kopie-okienka.js.
// M3-2 (1.11.2026): okienko odpowiada na „jak działa TSB" z tego słownika, 0 tokenów. Haseł bez opisu w aplikacji
// (strefy, interwały, rozbieganie) tu NIE MA — brak opisu = brak hasła, nie piszemy własnych.
// klucze = słowa zapytania, które wskazują hasło (puste = hasło bez własnego słowa-klucza, np. „kalorie", bo „ile spaliłem
// kalorii" to pytanie o liczbę, nie o pojęcie).
export const POJECIA = {
${poj}
};
`);
const h = fs.readFileSync(K + '/odznaki.html', 'utf8');
const a = h.indexOf('const BADGES = ['), b = h.indexOf('\n];', a);
const B = eval(h.slice(a + 15, b + 3));
const ids = new Set(); for (const x of B) { if (ids.has(x.id)) throw 'dubel ' + x.id; ids.add(x.id); }
const pary = B.map((x) => `  ${JSON.stringify(x.id)}: ${JSON.stringify(x.name)},`).join('\n');
const opisy = B.map((x) => `  ${JSON.stringify(x.id)}: ${JSON.stringify(x.desc || '')},`).join('\n');
fs.writeFileSync(K + '/supabase/functions/_shared/odznaki-nazwy.mjs',
`// Nazwy i opisy odznak dla funkcji Edge (Deno) — KOPIA par id → name / id → desc z katalogu BADGES w odznaki.html (to samo
// źródło, które widzi zawodnik na ekranie Odznaki). odznaki.html jest źródłem; tę kopię pilnuje
// tests/blizna-64-okienko-narzedzia.test.js (nazwy) i blizna-84 (opisy). Zmiana w odznaki.html bez zmiany tutaj = czerwony
// test. Generator: tools/kopie-okienka.js. Wygenerowane 1.11.2026 z odznaki.html (${B.length} odznak).
export const NAZWY_ODZNAK = {
${pary}
};
/* M3-2: opis odznaki (warunek zdobycia) — do karty katalogu „co to jest odznaka X" i karty moich odznak. */
export const OPISY_ODZNAK = {
${opisy}
};

/** Nazwa z katalogu; id spoza katalogu → „Odznaka" (slug nigdy nie trafia do karty). */
export function nazwaOdznaki(id) {
  return Object.prototype.hasOwnProperty.call(NAZWY_ODZNAK, id) ? NAZWY_ODZNAK[id] : "Odznaka";
}
/** Opis z katalogu; brak → null (karta bez opisu, nie zmyślamy). */
export function opisOdznaki(id) {
  return Object.prototype.hasOwnProperty.call(OPISY_ODZNAK, id) && OPISY_ODZNAK[id] ? OPISY_ODZNAK[id] : null;
}
`);
console.log('pojecia', Object.keys(okno.METRIC_TOOLTIPS).length, 'odznaki', B.length, 'bez opisu', B.filter((x) => !x.desc).length);
