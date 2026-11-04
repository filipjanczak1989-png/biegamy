'use strict';
/* Wiersze z wyjścia `supabase db query -o json`. Agent AI dostaje kopertę { boundary, rows, warning }, człowiek gołą tablicę,
   a CLI może dopisać komunikat przed JSON-em albo po nim. Brak JSON-a to błąd, nie pusta lista: pusta lista kazałaby zrzutowi skasować migawkę. */
function koniecJson(t, od) {
  let glebokosc = 0, wTekscie = false, ucieczka = false;
  for (let i = od; i < t.length; i++) {
    const z = t[i];
    if (wTekscie) {
      if (ucieczka) ucieczka = false;
      else if (z === '\\') ucieczka = true;
      else if (z === '"') wTekscie = false;
      continue;
    }
    if (z === '"') wTekscie = true;
    else if (z === '[' || z === '{') glebokosc++;
    else if (z === ']' || z === '}') { glebokosc--; if (glebokosc === 0) return i; }
  }
  return -1;
}

function wierszeZCli(wyjscie) {
  const t = String(wyjscie == null ? '' : wyjscie);
  const poczatek = /^[ \t]*[[{]/gm;
  let m;
  while ((m = poczatek.exec(t))) {
    const od = m.index + m[0].length - 1, doKonca = koniecJson(t, od);
    if (doKonca < 0) continue;
    let dane;
    try { dane = JSON.parse(t.slice(od, doKonca + 1)); } catch (e) { continue; }
    if (Array.isArray(dane)) return dane;
    if (dane && Array.isArray(dane.rows)) return dane.rows;
  }
  throw new Error('Brak wierszy JSON w odpowiedzi CLI: ' + t.slice(0, 200));
}

module.exports = { wierszeZCli };
