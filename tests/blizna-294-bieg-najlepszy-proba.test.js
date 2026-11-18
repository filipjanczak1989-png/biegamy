/* BLIZNA 294 / 18.11 noc: migracja 20261211 (decyzje Filipa).
   1) Gdy akcja_bieg_automat podmieni istniejący wynik „ja” na lepszy trening: dzwonek 'bieg_wynik' „Masz nowy najlepszy wynik w biegu. Dyplom jest już zaktualizowany.”
      BEZ czasu (decyzja 17.11), raz na podmianę; nie przy pierwszym wyniku i nie po skasowanym treningu.
   2) Bieg akcji testowej: akcja_bieg_zapisz i akcja_bieg_dopisz_dziecko przyjmują tylko konta z akcje.konta_testowe, inne → 'tylko_test' („Bieg próbny jest tylko dla kont testowych.”).
   Testy biegu w tools/ dopisują swoje konta do konta_testowe akcji 'proba' w swojej transakcji (inaczej po migracji zapis na bieg próbny by odmówił).
   Skutek w bazie sprawdza tools/akcja-bieg-najlepszy-test.sh (flaga AKCJA_BIEG_NAJLEPSZY_Z_MIGRACJA=1); tu: pliki i tekst na stronie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261211_akcja_bieg_najlepszy_proba.sql', WYC = 'supabase/migrations/20261211_WYCOFANIE_akcja_bieg_najlepszy_proba.sql';
const RV = 're' + 'voke all on function public.akcja_bieg_najlepszy_powiadom', DR = 'dr' + 'op function public.akcja_bieg_najlepszy_powiadom';
const TRESC = 'Masz nowy najlepszy wynik w biegu. Dyplom jest już zaktualizowany.';

test('migracja: powiadomienie bez czasu, typ bieg_wynik, wołane z automatu po podmianie; funkcja zamknięta dla przeglądarki', () => {
  const m = czytaj(MIG);
  assert.ok(m.includes("values (u.konto_id, 'bieg_wynik', null, '" + TRESC + "', false, now());"), 'dokładna treść i typ');
  assert.doesNotMatch(TRESC, /\d/, 'bez czasu ani liczb');
  assert.ok(m.includes(RV + '(uuid, uuid, numeric, boolean) from public, anon, authenticated;'));
  assert.ok(m.includes('is distinct from r.wynik_log_id then n := n + 1; begin perform public.akcja_bieg_najlepszy_powiadom(r.id, r.wynik_log_id, r.wynik_dystans_km, r.ukonczony_at is not null); exception when others then'),
    'tylko przy zmianie treningu; błąd powiadomienia nie zatrzymuje automatu');
  for (const w of ["if not coalesce(p_byl_wynik, false) or p_stary_log is null then return false; end if;", "u.rodzaj <> 'ja'", 'if u.wynik_dystans_km < p_stary_dystans then return false; end if;']) assert.ok(m.includes(w), w);
  for (const k of [...m.matchAll(/\$k\$([^$]*)\$k\$/g)].map((x) => x[1])) assert.doesNotMatch(k, /\n/, 'kotwice jednoliniowe (CRLF w definicjach z bazy)');
});

test('migracja: bramka tylko_test w zapisie siebie i dziecka, tylko dla akcji testowej, lista kont z akcje.konta_testowe', () => {
  const m = czytaj(MIG), bramka = "if exists (select 1 from public.akcje a where a.slug = b.akcja_slug and a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then return jsonb_build_object('ok', false, 'powod', 'tylko_test'); end if;";
  assert.equal(m.split(bramka).length - 1, 2, 'akcja_bieg_zapisz i akcja_bieg_dopisz_dziecko');
  assert.match(m, /'public\.akcja_bieg_zapisz\(text, integer, boolean, boolean, text, text, boolean\)'/); assert.match(m, /'public\.akcja_bieg_dopisz_dziecko\(text, text, boolean, boolean, text\)'/);
  const w = czytaj(WYC);
  assert.equal(w.split(bramka).length - 1, 2); assert.ok(w.includes(DR + '(uuid, uuid, numeric, boolean);'));
  assert.match(w, /fragment z 20261211 wystąpił % razy/);
});

test('strona: odmowa tylko_test ma czytelny komunikat', async () => {
  globalThis.escapeHtml = (x) => String(x);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  const B = globalThis.BM_BIEG_REAL;
  assert.equal(B.komunikat({ ok: false, powod: 'tylko_test' }), 'Bieg próbny jest tylko dla kont testowych.');
});

test('testy biegu w tools/ dopisują swoje konta do konta_testowe akcji proba; test po skutku z flagą i strażnikiem licznika', () => {
  for (const f of ['akcja-bieg-test', 'akcja-bieg-wyniki-test', 'akcja-bieg-mail-test', 'akcja-bieg-okno-test', 'akcja-bieg-dyplom-flagi-test', 'akcja-bieg-koniec-test']) {
    assert.match(czytaj('tools/' + f + '.sql'), /update public\.akcje set konta_testowe = coalesce\(konta_testowe, '\{\}'::uuid\[\]\) \|\| array\(select a\.id from public\.athletes a\) where slug = 'proba';[^\n]*\n  delete from public\.akcja_biegi where akcja_slug = 'proba';/, f);
  }
  const sh = czytaj('tools/akcja-bieg-najlepszy-test.sh'), t = czytaj('tools/akcja-bieg-najlepszy-test.sql');
  assert.match(sh, /AKCJA_BIEG_NAJLEPSZY_Z_MIGRACJA:-0/); assert.match(sh, /create temp table _licznik_przed/);
  assert.match(t, /FAIL 0: suma km albo procent ulicy inne/); assert.match(t, /raise exception 'TESTY NAJLEPSZEGO WYNIKU I BIEGU PRÓBNEGO ZIELONE: % sprawdzeń', n;/);
});
