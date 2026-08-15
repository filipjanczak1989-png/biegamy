// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ZAŁĄCZNIKÓW — czy nieudany zapis powiela pliki w storage.
//
// BLIZNA: ścieżka pliku niesie `Date.now()`, więc KAŻDA ponowna próba zapisu
// tworzyła NOWE obiekty zamiast nadpisać istniejące. Zmierzone na produkcji
// 2.08.2026: jedna osoba, 147 plików, 51 MB, w jedenaście minut — przy CZTERECH
// różnych rozmiarach, czyli te same 3-4 zdjęcia wgrane ~49 razy. Powodem był
// wtedy cooldown, ale to tylko jeden z siedmiu sposobów, na jakie zapis może
// paść PO uploadzie (RLS, NOT NULL, CHECK, FK, sieć, wyjątek JS).
//
// !! CO TU JEST NAPRAWDĘ SPRAWDZANE: liczba WYWOŁAŃ uploadu przy trzech próbach
//    zapisu, gdy INSERT odrzuca. Przed naprawą 3×N, po naprawie N.
//    Sam licznik nie wystarcza — sprawdzamy też, że lista ścieżek w wierszu
//    nie urosła, bo błąd mógłby polegać na dublowaniu ścieżek bez uploadu.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { atrapaPrzegladarki, atrapaElementu, zamrozTimery } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');

/** Pola formularza, które saveLog czyta zanim dojdzie do pętli uploadu. */
const POLA = {
  'l-dist': '10', 'l-pace': '5:30', 'l-time': '55:00', 'l-hr': '150',
  'l-comment': '', 'l-strava': '', 'l-elevation': '', 'l-calories': '',
};

/** Kontekst z prawdziwym sb.js + zawodnik.html, atrapą storage i zapisu. */
function stanowisko(opcje) {
  opcje = opcje || {};
  const licznik = { uploady: [], inserty: 0 };
  const ctx = atrapaPrzegladarki();

  const rejestr = new Map();
  const daj = (id) => {
    if (!rejestr.has(id)) {
      const el = atrapaElementu();
      el.id = id; el.style = {};
      if (id in POLA) el.value = POLA[id];
      if (id === 'l-file') el.files = [];
      rejestr.set(id, el);
    }
    return rejestr.get(id);
  };
  ctx.document = Object.assign({}, ctx.document, {
    addEventListener() {}, getElementById: daj,
    querySelector: (s) => (typeof s === 'string' && s[0] === '#') ? daj(s.slice(1)) : atrapaElementu(),
    querySelectorAll: () => [], createElement: () => { const e = atrapaElementu(); e.style = {}; return e; },
    body: { appendChild() {} }, documentElement: { setAttribute() {}, removeAttribute() {} },
    readyState: 'complete',
  });
  ctx.addEventListener = () => {};
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* !! TIMERY ZAMROŻONE. Stanowisko buduje kontekst ręcznie (potrzebuje
     własnej atrapy DOM z wartościami pól), więc omija zaladujStrone —
     a razem z nim zamrozTimery. Bez tego robota z ładowania strony budzi
     się PO teście, sięga po podmienioną atrapę sb i wywraca cały plik
     jako unhandledRejection: 5/5 asercji zielonych, plik czerwony.
     Dokładnie ta sama pułapka co w odznaki.test.js 15.08. */
  zamrozTimery(ctx);

  const cicho = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  const prawdziwy = ctx.console;
  ctx.console = cicho;
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'sb.js'), 'utf8'), ctx, { filename: 'sb.js' });
  const html = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
  [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]) && !/ld\+json/.test(m[1]))
    .forEach((m, i) => vm.runInContext(m[2], ctx, { filename: 'zawodnik#' + i }));
  ctx.console = prawdziwy;

  /* Atrapa storage: LICZY wywołania i zapamiętuje ścieżki. Atrapa, która tylko
     połyka wywołanie, przepuściłaby na zielono zarówno 2, jak i 6 uploadów. */
  ctx.window.storageUploadRetry = async (bucket, sciezka) => {
    licznik.uploady.push(sciezka);
    return { error: null };
  };
  ctx.window.prepUpload = async (f) => ({ ok: true, data: f, ext: 'jpg', contentType: 'image/jpeg' });
  ctx.window.downscaleImage = async (b) => b;               // brak miniatur — mierzymy załączniki
  ctx.window.toast = () => {};
  ctx.window.looksLikeBike = () => false;
  ctx.window.pytajODrugiTrening = async () => true;          // „Dodaj drugi" — nie o to tu chodzi

  /* Atrapa zapisu: INSERT ZAWSZE odrzuca. Odtwarza dowolną z siedmiu ścieżek
     błędu po uploadzie (RLS, NOT NULL, CHECK, FK, sieć…). */
  const zapamietane = [];
  ctx.sb = {
    from: () => {
      const b = {
        insert: (p) => { licznik.inserty++; zapamietane.push(p); return b; },
        update: () => b, select: () => b, eq: () => b, gte: () => b, lte: () => b,
        not: () => b, limit: () => b, maybeSingle: () => b, order: () => b,
        then: (r, j) => Promise.resolve(
          opcje.zapisDziala ? { data: [{ id: 'x' }], error: null }
                            : { data: null, error: { message: 'wymuszony blad zapisu' } }
        ).then(r, j),
      };
      return b;
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };

  return { ctx, licznik, zapamietane, daj };
}

/** Trzy próby zapisu z tymi samymi dwoma plikami. */
async function trzyProby(st) {
  const pliki = [{ name: 'a.jpg', size: 1000, type: 'image/jpeg' },
                 { name: 'b.jpg', size: 2000, type: 'image/jpeg' }];
  for (let i = 0; i < 3; i++) {
    await vm.runInContext(`(async () => {
      _athleteId = 'ATLETA-TEST';
      _editingLogId = null;
      _logType = 'Spokojny';
      _logDate = '2026-08-16';
      _savingLog = false;
      window._existingAttachments = [];
      await saveLog();
    })()`, st.ctx);
  }
  return pliki;
}

describe('nieudany zapis NIE powiela plików w storage', () => {
  test('trzy próby z dwoma plikami → DWA uploady, nie sześć', async () => {
    const st = stanowisko();
    const pliki = [{ name: 'a.jpg', size: 1000, type: 'image/jpeg' },
                   { name: 'b.jpg', size: 2000, type: 'image/jpeg' }];
    st.ctx.window._pendingFiles = pliki;
    await trzyProby(st);

    assert.equal(st.licznik.inserty >= 3, true,
      'atrapa nie doszła do zapisu — test mierzyłby własną awarię (' + st.licznik.inserty + ' insertów)');
    assert.equal(st.licznik.uploady.length, 2,
      'wgrano ' + st.licznik.uploady.length + ' plików zamiast 2 — każda próba tworzy nowe obiekty');
  });

  test('ścieżki się NIE dublują — sam licznik by tego nie złapał', async () => {
    const st = stanowisko();
    st.ctx.window._pendingFiles = [{ name: 'a.jpg', size: 1000, type: 'image/jpeg' },
                                   { name: 'b.jpg', size: 2000, type: 'image/jpeg' }];
    await trzyProby(st);
    assert.equal(new Set(st.licznik.uploady).size, st.licznik.uploady.length,
      'te same ścieżki poszły wielokrotnie: ' + st.licznik.uploady.join(' '));
  });

  test('załączniki NIE giną przy ponownej próbie — powód wyboru idempotencji', async () => {
    /* !! TO JEST POWÓD, DLA KTÓREGO NIE CZYŚCIMY _pendingFiles NA BŁĘDZIE.
       Po nieudanym zapisie modal zostaje otwarty, a podgląd nadal pokazuje
       zdjęcia. Gdyby błąd czyścił listę, człowiek kliknąłby „Zapisz" jeszcze
       raz i zapisał log BEZ ŻADNEGO ZAŁĄCZNIKA, nie dostając o tym informacji.
       To zamiana widocznej usterki na cichą utratę danych. */
    const st = stanowisko();
    st.ctx.window._pendingFiles = [{ name: 'a.jpg', size: 1000, type: 'image/jpeg' },
                                   { name: 'b.jpg', size: 2000, type: 'image/jpeg' }];
    await trzyProby(st);
    assert.equal(st.ctx.window._pendingFiles.length, 2,
      'pliki zniknęły po nieudanym zapisie — kolejna próba zapisałaby log bez zdjęć');
    const ostatni = st.zapamietane[st.zapamietane.length - 1];
    assert.equal((ostatni.attachment_url || '').split(',').filter(Boolean).length, 2,
      'wiersz miał nieść 2 ścieżki, a niesie: ' + (ostatni && ostatni.attachment_url));
  });
});

describe('sprawność stanowiska pomiarowego', () => {
  test('atrapa storage LICZY, a nie połyka', async () => {
    const st = stanowisko();
    await st.ctx.window.storageUploadRetry('b', 'sciezka/x.jpg', null, {});
    assert.deepEqual(st.licznik.uploady, ['sciezka/x.jpg']);
  });

  test('bez plików nie ma uploadu — kontrola, że licznik nie zmyśla', async () => {
    const st = stanowisko();
    st.ctx.window._pendingFiles = [];
    await trzyProby(st);
    assert.equal(st.licznik.uploady.length, 0);
  });
});
