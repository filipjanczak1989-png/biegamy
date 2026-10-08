#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ZWIAD: KTO ZAPISUJE DO PAR tabela:polecenie, GDZIE authenticated MA GRANT BEZ POLITYKI (08.10.2026)
//
// Para „tabela:INSERT|UPDATE" z grantem dla authenticated i bez polityki RLS = każdy taki zapis z sesji
// użytkownika już dziś pada (INSERT → 42501, UPDATE → 0 wierszy po cichu). Grant jest wtedy martwy
// albo maskuje błąd. To narzędzie szuka DOWODU zapisu w kodzie:
//   · front (*.html w korzeniu, sb.js, js/*.js) — klient zawsze działa jako authenticated/anon,
//   · Edge Functions (supabase/functions/**) — z rozpoznaniem klienta w pliku:
//       service_role  → omija granty i RLS: revoke authenticated NIE dotyczy,
//       JWT usera     → działa jako authenticated: revoke DOTYCZY.
// .upsert( liczy się jako INSERT i UPDATE — chyba że ma ignoreDuplicates: true (DO NOTHING = tylko INSERT). Funkcje SQL i triggery sprawdza osobno
// tools/zwiad-zapisy-bez-polityki.sql (prosrc + prosecdef na PRODUKCJI).
//
// Użycie: node tools/zwiad-zapisy-bez-polityki.js tabela:POLECENIE [...]   (albo --json)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const KORZEN = path.join(__dirname, '..');

function pliki() {
  const front = fs.readdirSync(KORZEN).filter((f) => /\.html$/.test(f)).concat(['sb.js'])
    .concat(fs.readdirSync(path.join(KORZEN, 'js')).filter((f) => /\.m?js$/.test(f)).map((f) => 'js/' + f));
  const ef = [];
  const chodz = (d) => { for (const f of fs.readdirSync(path.join(KORZEN, d))) { const p = d + '/' + f; if (fs.statSync(path.join(KORZEN, p)).isDirectory()) chodz(p); else if (/\.(ts|mjs|js)$/.test(f)) ef.push(p); } };
  chodz('supabase/functions');
  return { front, ef };
}

/* Klient w pliku EF: service_role (SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE) albo JWT usera
   (createClient z nagłówkiem Authorization przekazanym z żądania). Oba w jednym pliku = 'oba'. */
function klientEF(tresc) {
  const sr = /SERVICE_ROLE/.test(tresc);
  const jwt = /global\s*:\s*\{\s*headers\s*:\s*\{\s*Authorization/.test(tresc) || /headers\s*:\s*\{\s*Authorization\s*:\s*(?:req\.headers\.get|authHeader|auth)/.test(tresc);
  return sr && jwt ? 'oba' : sr ? 'service_role' : jwt ? 'jwt_usera' : 'nieznany';
}

function zwiad(pary) {
  const { front, ef } = pliki();
  const wyniki = [];
  const czytane = new Map();
  const czytaj = (f) => { if (!czytane.has(f)) czytane.set(f, fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '')); return czytane.get(f); };
  for (const para of pary) {
    const [tabela, polecenie] = para.split(':');
    const metody = polecenie === 'INSERT' ? ['insert', 'upsert'] : ['update', 'upsert'];
    const trafienia = [];
    for (const [rodzaj, lista] of [['front', front], ['ef', ef]]) {
      for (const f of lista) {
        const t = czytaj(f);
        const re = new RegExp("\\.from\\(\\s*['\"`]" + tabela + "['\"`]\\s*\\)", 'g');
        let m;
        while ((m = re.exec(t))) {
          // łańcuch do końca instrukcji (do ; albo 600 znaków), szukamy metody zapisu
          const ogon = t.slice(m.index, m.index + 600).split(/;\s*\n/)[0];
          const met = metody.find((x) => new RegExp('\\.' + x + '\\s*\\(').test(ogon));
          if (!met) continue;
          // .upsert(..., { ignoreDuplicates: true }) = ON CONFLICT DO NOTHING → tylko INSERT (UPDATE niepotrzebny)
          if (met === 'upsert' && polecenie === 'UPDATE' && /ignoreDuplicates\s*:\s*true/.test(ogon)) continue;
          const linia = t.slice(0, m.index).split('\n').length;
          trafienia.push({ rodzaj, plik: f, linia, metoda: met, klient: rodzaj === 'ef' ? klientEF(t) : 'authenticated' });
        }
      }
    }
    wyniki.push({ para, tabela, polecenie, trafienia,
      dotyczyAuthenticated: trafienia.filter((x) => x.rodzaj === 'front' || x.klient === 'jwt_usera' || x.klient === 'oba' || x.klient === 'nieznany') });
  }
  return wyniki;
}
module.exports = { zwiad, klientEF };

if (require.main === module) {
  const arg = process.argv.slice(2);
  const w = zwiad(arg.filter((a) => a.includes(':')));
  if (arg.includes('--json')) { console.log(JSON.stringify(w, null, 1)); process.exit(0); }
  for (const x of w) {
    const d = x.dotyczyAuthenticated;
    console.log((d.length ? 'ZAPIS JAKO authenticated' : (x.trafienia.length ? 'tylko service_role' : 'brak zapisu')).padEnd(26) + x.para);
    for (const t of x.trafienia) console.log('    ' + t.rodzaj.padEnd(6) + (t.plik + ':' + t.linia).padEnd(58) + '.' + t.metoda + '  [' + t.klient + ']');
  }
}
