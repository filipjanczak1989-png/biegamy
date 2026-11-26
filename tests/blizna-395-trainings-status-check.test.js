// Blizna #395 (26.11.2026) — trainings.status: lista wartości w bazie i w kodzie to ta sama lista.
//
// Kolumna była zwykłym tekstem bez ograniczenia (próba z 25.11 przyjęła dowolny tekst), a kod rozgałęzia się po dokładnym
// brzmieniu: 'done', 'missed', „wszystko inne = zaplanowany”. Migracja 20261227 dodaje CHECK z listą planned / done / missed.
// Ten test pilnuje dwóch rzeczy, których sama baza nie upilnuje przed wdrożeniem:
//   (1) migracja i jej wycofanie są w repo i mówią to samo, co próba w wycofanej transakcji (tools/trainings-status-check-test.sql);
//   (2) każde miejsce w kodzie, które ZAPISUJE status treningu, zapisuje wartość z listy, a lista nie ma wartości, której
//       nikt nie zapisuje. Nowa wartość w kodzie bez migracji = czerwony test, zanim baza odrzuci zapis zawodnikowi.
// Migracje wdraża Filip ręcznie (db query --linked -f), nigdy db push.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261227_trainings_status_check.sql');
const WYC = czytaj('supabase/migrations/20261227_WYCOFANIE_trainings_status_check.sql');
const PROBA = czytaj('tools/trainings-status-check-test.sql');
const TABELA = 'trainings';

/** Lista z definicji ograniczenia w migracji. */
function listaZMigracji() {
  const m = /check \(status is null or status in \(([^)]+)\)\)/.exec(MIG);
  assert.ok(m, 'migracja: brak definicji CHECK w oczekiwanym kształcie');
  return m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).sort();
}
const blokDo = (t) => { const a = t.indexOf('do $$'), b = t.indexOf('end $$;', a); assert.ok(a > 0 && b > a, 'brak bloku DO'); return t.slice(a, b + 7); };

/** Pliki aplikacji i funkcji, które w ogóle dotykają tabeli treningów. */
function plikiKodu() {
  const wynik = [];
  const idz = (kat) => { for (const e of fs.readdirSync(path.join(KORZEN, kat), { withFileTypes: true })) {
    const p = kat ? kat + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(tests|vendor|node_modules|\.git|assets|docs|tools)$/.test(p) && !/^supabase\/(migrations|schema)$/.test(p)) idz(p); }
    else if (/\.(html|js|mjs|ts)$/.test(e.name)) wynik.push(p);
  } };
  idz('');
  return wynik.filter((p) => new RegExp("from\\(\\s*['\"]" + TABELA + "['\"]\\s*\\)").test(czytaj(p)));
}
/** Wartości statusu zapisywane w jednym wywołaniu insert / update / upsert na tabeli treningów.
    → { wartosci: [...], zrodlo: opis } albo null, gdy wywołanie statusu nie dotyka. Nieznany kształt = wyjątek (test ma się zatrzymać). */
function zapisywane(t, poz, plik) {
  const dalej = t.slice(poz, poz + 900), linia = t.slice(0, poz).split('\n').length, gdzie = plik + ':' + linia;
  const op = /^from\([^)]*\)\s*\.\s*(insert|update|upsert|delete|select)\b/.exec(dalej);
  if (!op || op[1] === 'select' || op[1] === 'delete') return null;
  let arg = dalej.slice(dalej.indexOf(op[1]));
  const kon = arg.search(/\bfrom\(\s*['"]/); if (kon > 0) arg = arg.slice(0, kon);   // nie wchodzimy w następne zapytanie
  const zmienna = /^(?:insert|update|upsert)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(arg);
  let tresc = arg;
  if (zmienna) {   // obiekt zbudowany wcześniej: bierzemy jego definicję
    const def = new RegExp('(?:const|let|var)\\s+' + zmienna[1].replace(/\$/g, '\\$') + '\\b[^=]*=');
    const przed = t.slice(Math.max(0, poz - 6000), poz), wszystkie = [...przed.matchAll(new RegExp(def.source, 'g'))];
    assert.ok(wszystkie.length, gdzie + ': nie znalazłem definicji obiektu „' + zmienna[1] + '” zapisywanego do ' + TABELA);
    const od = wszystkie[wszystkie.length - 1].index;
    tresc = przed.slice(od, od + 2500);
  } else {
    const koniec = arg.indexOf('})'); tresc = koniec > 0 ? arg.slice(0, koniec + 1) : arg.slice(0, 600);
  }
  const lit = /\bstatus\s*:\s*(['"])([a-z_ ]*)\1/i.exec(tresc);
  if (lit) return { wartosci: [lit[2]], zrodlo: gdzie + ' literał' };
  const tern = /\bstatus\s*:\s*[^,}]*\?\s*(['"])(\w+)\1\s*:\s*(['"])(\w+)\3/.exec(tresc);
  if (tern) return { wartosci: [tern[2], tern[4]], zrodlo: gdzie + ' wybór z dwóch' };
  const ident = /\bstatus\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(tresc) || (/[{,]\s*status\s*[,}]/.test(tresc) ? [null, 'status'] : null);
  if (ident) {   // wartość ze zmiennej: szukamy, skąd się bierze
    /* najbliższa wcześniejsza definicja tej zmiennej (funkcja zapisu w kalendarzu ma ponad 100 linii między polem formularza a zapisem) */
    const calosc = t.slice(Math.max(0, poz - 16000), poz), defy = [...calosc.matchAll(new RegExp('(?:const|let|var)\\s+' + ident[1] + '\\s*=', 'g'))];
    const przed = defy.length ? calosc.slice(defy[defy.length - 1].index, defy[defy.length - 1].index + 400) : '';
    const zTern = new RegExp('(?:const|let|var)\\s+' + ident[1] + '\\s*=\\s*[^;]*\\?\\s*([\'"])(\\w+)\\1\\s*:\\s*([\'"])(\\w+)\\3').exec(przed);
    if (zTern) return { wartosci: [zTern[2], zTern[4]], zrodlo: gdzie + ' zmienna z wyboru z dwóch' };
    const zPola = new RegExp('(?:const|let|var)\\s+' + ident[1] + "\\s*=\\s*document\\.getElementById\\('([\\w-]+)'\\)\\.value").exec(przed);
    if (zPola) {
      const sel = new RegExp('<select id="' + zPola[1] + '"[^>]*>([\\s\\S]*?)</select>').exec(t);
      assert.ok(sel, gdzie + ': pole „' + zPola[1] + '” nie jest listą wyboru');
      return { wartosci: [...sel[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]), zrodlo: gdzie + ' lista wyboru #' + zPola[1] };
    }
    assert.fail(gdzie + ': status zapisywany ze zmiennej „' + ident[1] + '”, której źródła test nie rozpoznaje. Dopisz rozpoznanie i sprawdź listę w migracji.');
  }
  assert.ok(!/\bstatus\b/.test(tresc.replace(/\.status\b|status\s*===?|status\s*!==?/g, '')), gdzie + ': słowo „status” w zapisie do ' + TABELA + ' w kształcie, którego test nie rozpoznaje');
  return null;
}
function zapisyWKodzie() {
  const wynik = [];
  for (const p of plikiKodu()) {
    const t = czytaj(p), re = new RegExp("from\\(\\s*['\"]" + TABELA + "['\"]\\s*\\)", 'g'); let m;
    while ((m = re.exec(t))) { const z = zapisywane(t, m.index, p); if (z) wynik.push(z); }
  }
  return wynik;
}

test('(1) migracja i wycofanie są w repo, w jednej transakcji, z komunikatem jako wierszem wyniku', () => {
  for (const [nazwa, t] of [['migracja', MIG], ['wycofanie', WYC]]) {
    assert.match(t, /^begin;$/m, nazwa + ': begin');
    assert.match(t, /^commit;$/m, nazwa + ': commit');
    assert.match(t, /set local lock_timeout = '5s';/, nazwa + ': limit czekania na blokadę');
    assert.match(t, /select komunikat from _status_check_komunikat;\ncommit;/, nazwa + ': komunikat tuż przed commit (db query nie pokazuje raise notice)');
    assert.ok(!/\bupdate\s+public\.trainings\b|\bdelete\s+from\s+public\.trainings\b/i.test(t), nazwa + ': nie zmienia danych');
  }
  assert.match(MIG, /add constraint trainings_status_check/);
  assert.match(WYC, /drop constraint trainings_status_check;/);
});

test('(2) lista w ograniczeniu: planned, done, missed; NULL dozwolony; złe dane zatrzymują migrację, powtórka nic nie zmienia', () => {
  assert.deepEqual(listaZMigracji(), ['done', 'missed', 'planned']);
  assert.match(MIG, /where status is not null and status not in \('planned', 'done', 'missed'\);/, 'kontrola danych tą samą listą co ograniczenie');
  assert.match(MIG, /if spoza > 0 then\s+raise exception/, 'wartości spoza listy = wyjątek, bez poprawiania danych');
  assert.match(MIG, /bez zmian: ograniczenie trainings_status_check już istnieje/);
  assert.match(WYC, /bez zmian: ograniczenia trainings_status_check nie ma/);
});

test('(3) kod zapisuje do trainings.status wyłącznie wartości z listy, a każda wartość z listy jest gdzieś zapisywana', () => {
  const lista = listaZMigracji(), zapisy = zapisyWKodzie();
  assert.ok(zapisy.length >= 12, 'test widzi miejsca zapisu statusu (jest ich kilkanaście), znalazł: ' + zapisy.length);
  for (const z of zapisy) for (const w of z.wartosci) assert.ok(lista.includes(w), z.zrodlo + ': zapisuje status „' + w + '”, którego nie ma w ograniczeniu bazy. Najpierw migracja, potem kod.');
  const uzyte = [...new Set(zapisy.flatMap((z) => z.wartosci))].sort();
  assert.deepEqual(uzyte, lista, 'lista w bazie i wartości zapisywane w kodzie są tym samym zbiorem');
});

test('(4) formularz treningu w kalendarzu oferuje dokładnie wartości z listy', () => {
  const sel = /<select id="f-status"[^>]*>([\s\S]*?)<\/select>/.exec(czytaj('kalendarz.html'));
  assert.ok(sel, 'kalendarz.html: lista wyboru statusu');
  assert.deepEqual([...sel[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]).sort(), listaZMigracji());
});

test('(5) rozpoznawanie zapisów działa na przykładach: literał, wybór z dwóch, zmienna, obiekt; nieznany kształt zatrzymuje test', () => {
  const p = (kod) => { const i = kod.indexOf("from('trainings')"); return zapisywane(kod, i, 'przyklad.js'); };
  assert.deepEqual(p("await sb.from('trainings').update({ status: 'done' }).eq('id', x);").wartosci, ['done']);
  assert.deepEqual(p("await sb.from('trainings').update({ status: cofamy ? 'planned' : 'missed' }).eq('id', x);").wartosci, ['planned', 'missed']);
  assert.deepEqual(p("const nowy = cofamy ? 'planned' : 'missed';\nawait sb.from('trainings').update({ status: nowy }).eq('id', x);").wartosci, ['planned', 'missed']);
  assert.deepEqual(p("const wiersze = lista.map(t => ({ date: t.d, status: 'planned' }));\nawait sb.from('trainings').insert(wiersze);").wartosci, ['planned']);
  assert.equal(p("await sb.from('trainings').update({ type: t }).eq('id', x);"), null, 'zapis bez statusu');
  assert.equal(p("await sb.from('trainings').select('status').eq('id', x);"), null, 'odczyt');
  assert.deepEqual(p("await sb.from('trainings').update({ status: 'skipped' }).eq('id', x);").wartosci, ['skipped'], 'nowa wartość jest widziana (i w teście 3 dałaby czerwony wynik)');
  assert.throws(() => p("await sb.from('trainings').update({ status: obliczStatus() }).eq('id', x);"), /nie rozpoznaje/);
  assert.throws(() => p("const s = skads;\nawait sb.from('trainings').update({ status: s }).eq('id', x);"), /nie rozpoznaje/);
});

test('(6) próba w wycofanej transakcji wykonuje dokładnie bloki z migracji i wycofania i kończy się ROLLBACK', () => {
  assert.ok(PROBA.includes(blokDo(MIG)), 'próba ma w sobie blok DO migracji co do znaku');
  assert.ok(PROBA.includes(blokDo(WYC)), 'próba ma w sobie blok DO wycofania co do znaku');
  /* próba wykonuje migrację trzy razy i wycofanie dwa razy: KAŻDA kopia ma być dokładna (jedna zmieniona kopia = próba sprawdza inny tekst niż produkcja) */
  const ile = (t, co) => t.split(co).length - 1;
  assert.equal(ile(PROBA, blokDo(MIG)), 3, 'trzy dokładne kopie bloku migracji');
  assert.equal(ile(PROBA, 'do $$\ndeclare\n  spoza bigint;'), 3, 'i żadnej czwartej, zmienionej');
  assert.equal(ile(PROBA, blokDo(WYC)), 2, 'dwie dokładne kopie bloku wycofania');
  assert.equal(ile(PROBA, 'drop constraint trainings_status_check'), 2, 'i żadnej trzeciej, zmienionej');
  assert.match(PROBA, /^begin;$/m);
  assert.match(PROBA, /\nrollback;\s*$/, 'ostatnia instrukcja to rollback');
  assert.ok(!/^commit;$/m.test(PROBA), 'w próbie nie ma commit');
  for (const w of listaZMigracji()) assert.ok(PROBA.includes("'" + w + "'"), 'próba sprawdza wartość ' + w);
});
