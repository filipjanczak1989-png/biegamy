/* BLIZNA 192 / CEGIEŁKA OD OSOBY PRYWATNEJ: FUNKCJA I MIGRACJA (Filip 6.11 wieczór, przed startem 7.11 06:00). Front: blizna-193.
   Formularz „Twoja firma lub cegiełka na Ulicy” zbierał tylko firmy: osoba prywatna po wpłacie nie miała jak wysłać zrzutu, żeby dostać cegłę z imieniem w murze.
   - formularz: na górze „Osoba prywatna: cegiełka w murze” / „Firma: budynek na Ulicy”; osoba: imię (reguły jak w panelu), zgoda na imię, zrzut, e-mail nieobowiązkowy, bez logo, linku i progu;
     zrzut (osoba i firma) przygotowany w przeglądarce do 1600 px, więc limit 2 MB funkcji nie odrzuca zdjęć z aparatu;
   - funkcja firma-zgloszenie: rodzaj „cegielka” tymi samymi drzwiami (przełącznik, limit 3/h, pułapka, push), zapis kluczem serwisowym; firmy bez zmian (blizna-159);
   - migracja 20261107_akcja_cegielka_zgloszenia: tabela zgłoszeń przyjmuje cegiełkę, „Zatwierdź” tworzy wpis w murze tej akcji, imię publicznie tylko przy zgodzie,
     bez zmian uprawnień; test po skutku tools/akcja-cegielka-test.sh (44 asercje, w tym anon i zwykłe konto), wycofanie w osobnym pliku;
   - panel: CEGIEŁKA, zgoda na imię, sam zrzut; zatwierdzona cegiełka odsyła do „Ulica akcji” (nie do edytora firm); mur w panelu z próbą, żeby usunąć testową cegłę.
   Po skutku: PGlite z funkcjami w tekście z produkcji (~/.cache/bm-cegielka, 44 zielone, 8/8 mutacji) i Chrome (formularz, wysyłka, panel na atrapie bazy). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const TRENER = { id: '11111111-1111-4111-8111-111111111111' };
const PNG = () => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, 900); new DataView(b.buffer).setUint32(20, 1600); return b; };
const plik = (b) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
const formularz = (pola) => { const m = new Map(Object.entries(pola)); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };

/* Atrapa bazy: zgłoszenia, mur, kubełki. Zatwierdzenie cegiełki jak 20261107_akcja_cegielka_zgloszenia (wpis w murze tej akcji, zgoda z kolumny zgoda_na_wymienienie). */
function atrapa(opcje) {
  const o = opcje || {}, zgl = [], mur = [], firmy = [], kubelki = { 'firmy-zgloszenia': new Map(), 'akcja-firmy-logo': new Map() }, wstawione = [];
  const rpc = async (n, a) => {
    if (n === 'akcja_firmy_wpusc') return { data: o.wylaczone ? { ok: false, powod: 'wylaczone' } : { ok: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000 } };
    if (n === 'akcja_firmy_zgloszenia_lista') return { data: { zgloszenia: zgl.map((z) => ({ id: z.id, proba: z.akcja_slug === 'proba', rodzaj: z.rodzaj, nazwa: z.nazwa, link: z.link || null, email: z.email, kwota_gr: null, zgoda_na_kwote: false, zgoda_na_wymienienie: z.zgoda_na_wymienienie, logo: z.logo_sciezka || null, zrzut: z.zrzut_sciezka, status: z.status })), prog_domku_zl: 100, prog_wiezowca_zl: 1000, firmy_zgloszenia: true } };
    const z = zgl.find((x) => x.id === a.p_id);
    if (!z) return { data: { ok: false, powod: 'nie_ma' } };
    if (z.status !== 'nowe') return { data: { ok: false, powod: 'juz_decyzja' } };
    const pl = [z.zrzut_sciezka, z.logo_sciezka].filter(Boolean);
    if (n === 'akcja_firmy_zatwierdz') {
      z.status = 'zatwierdzone'; z.zrzut_sciezka = z.logo_sciezka = null;
      if (z.rodzaj === 'cegielka') { const c = { id: 'c-' + (mur.length + 1), akcja_slug: z.akcja_slug, imie: z.nazwa, zgoda: z.zgoda_na_wymienienie, dodal: a.p_kto }; mur.push(c); return { data: { ok: true, cegla: c.id, email: z.email, pliki: pl } }; }
      firmy.push({ nazwa: z.nazwa }); return { data: { ok: true, firma: 'f-1', email: z.email, pliki: pl } };
    }
    if (n === 'akcja_firmy_odrzuc') { z.status = 'odrzucone'; z.zrzut_sciezka = z.logo_sciezka = null; return { data: { ok: true, pliki: pl } }; }
    throw new Error('atrapa: ' + n);
  };
  const sb = {
    rpc,
    from: (t) => ({
      insert: async (w) => { if (t !== 'akcja_firmy_zgloszenia') throw new Error('atrapa: insert ' + t); if (o.odmowaZapisu) return { error: { message: 'check_violation' } }; wstawione.push(w); zgl.push({ status: 'nowe', ...w }); return { error: null }; },
      select: () => ({ eq: (_k, id) => ({ maybeSingle: async () => { const z = zgl.find((x) => x.id === id); return { data: z ? { logo_sciezka: z.logo_sciezka || null, status: z.status } : null }; } }) }),
    }),
    storage: { from: (k) => ({
      upload: async (p, b) => { kubelki[k].set(p, b); return { error: null }; },
      download: async (p) => (kubelki[k].has(p) ? { data: kubelki[k].get(p) } : { error: { message: 'brak' } }),
      remove: async (l) => { l.forEach((p) => kubelki[k].delete(p)); return { error: null }; },
      createSignedUrl: async (p) => ({ data: { signedUrl: 'https://x/' + p + '?token=t' } }),
      getPublicUrl: (p) => ({ data: { publicUrl: 'https://x/public/' + p } }),
    }) },
  };
  return { sb, zgl, mur, firmy, wstawione, prywatne: () => [...kubelki['firmy-zgloszenia'].keys()], publiczne: () => [...kubelki['akcja-firmy-logo'].keys()] };
}
async function kontekst(opcje) {
  const O = await zaladuj('supabase/functions/_shared/firma-obsluga.mjs');
  await zaladuj('js/moderacja.mjs');
  return { O, M: globalThis.BM_MODERACJA, a: atrapa(opcje) };
}
const cegielka = (nad) => formularz({ slug: 'proba', rodzaj: 'cegielka', imie: 'Anna-Maria', zgoda_imie: 'tak', zrzut: plik(PNG()), ...nad });

test('funkcja: cegiełka tymi samymi drzwiami, zrzut prywatny, bez logo i linku, push z imieniem', async () => {
  const { O, M, a } = await kontekst();
  const pushe = [];
  const w = await O.przyjmijZgloszenie({ dane: cegielka({ logo: plik(PNG()), link: 'https://zly.example.pl', nazwa: 'Firma Udawana' }), ipSkrot: 'ip-1', sb: a.sb, moderacja: M, powiadom: async (p) => { pushe.push(p); }, noweId: () => '33333333-3333-4333-8333-333333333333' });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.deepEqual(a.wstawione, [{ id: '33333333-3333-4333-8333-333333333333', akcja_slug: 'proba', rodzaj: 'cegielka', nazwa: 'Anna-Maria', email: null, zrzut_sciezka: '33333333-3333-4333-8333-333333333333/zrzut.png', zgoda_na_wymienienie: true }], 'bez linku i logo, nawet gdy ktoś je dośle');
  assert.deepEqual(a.prywatne(), ['33333333-3333-4333-8333-333333333333/zrzut.png'], 'tylko zrzut, w prywatnym kubełku');
  assert.deepEqual(a.publiczne(), []);
  assert.equal(pushe.length, 1);
  assert.equal(pushe[0].title, '[próba] Nowa cegiełka: Anna-Maria');
  assert.equal(pushe[0].url, '/trener.html#firma-zgloszenie=33333333-3333-4333-8333-333333333333');
  const bez = await O.przyjmijZgloszenie({ dane: cegielka({ slug: 'dla-fabianka', imie: 'Zenek', zgoda_imie: null, email: 'zenek@example.pl' }), ipSkrot: 'ip-1', sb: a.sb, moderacja: M, powiadom: async (p) => { pushe.push(p); } });
  assert.equal(bez.status, 200);
  assert.equal(pushe[1].title, 'Nowa cegiełka: Zenek · bez imienia w murze');
  assert.equal(a.wstawione[1].zgoda_na_wymienienie, false); assert.equal(a.wstawione[1].email, 'zenek@example.pl'); assert.equal(a.wstawione[1].akcja_slug, 'dla-fabianka');
});

test('funkcja: odmowy cegiełki po ludzku; pułapka i wyłączony przełącznik jak u firm', async () => {
  const { O, M, a } = await kontekst();
  const wyslij = (nad, kt) => O.przyjmijZgloszenie({ dane: cegielka(nad), ipSkrot: 'ip-2', sb: (kt || a).sb, moderacja: M, powiadom: async () => {} });
  for (const [nad, re] of [[{ imie: 'Anna Kowalska' }, /jedno słowo/], [{ imie: 'Ola1' }, /same litery/], [{ imie: 'A' }, /od 2 do 20/], [{ imie: 'Kurwa' }, /nie możemy przyjąć/], [{ email: 'bez-malpy' }, /e-mail albo zostaw/], [{ zrzut: null }, /Dodaj zrzut wpłaty/], [{ zrzut: plik(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')) }, /tylko PNG, JPG albo WebP/]]) {
    const w = await wyslij(nad);
    assert.equal(w.status, 400, JSON.stringify(nad)); assert.match(w.body.blad, re, JSON.stringify(nad));
  }
  assert.equal(a.wstawione.length, 0, 'nic nie zapisane');
  const b = await wyslij({ strona_www: 'bot' });
  assert.equal(b.status, 200); assert.equal(a.wstawione.length, 0, 'pułapka: „ok” i nic');
  const wyl = atrapa({ wylaczone: true });
  assert.equal((await wyslij({}, wyl)).status, 403);
  const odm = atrapa({ odmowaZapisu: true });
  const w = await wyslij({}, odm);
  assert.equal(w.status, 400); assert.deepEqual(odm.prywatne(), [], 'baza odmówiła: zrzut posprzątany');
  assert.equal(O.trescPushu({ rodzaj: 'cegielka', nazwa: 'Ola', zgoda_imie: true }, 'proba', 'x').title, '[próba] Nowa cegiełka: Ola');
});

test('panel: lista z cegiełką, zatwierdzenie = wpis w murze tej akcji, mail o cegiełce, zrzut skasowany; odrzucenie bez muru', async () => {
  const { O, M, a } = await kontekst();
  const id = (await O.przyjmijZgloszenie({ dane: cegielka({ email: 'ania@example.pl' }), ipSkrot: 'ip-3', sb: a.sb, moderacja: M, powiadom: async () => {} })).body.id;
  const id2 = (await O.przyjmijZgloszenie({ dane: cegielka({ imie: 'Odrzucony' }), ipSkrot: 'ip-3', sb: a.sb, moderacja: M, powiadom: async () => {} })).body.id;
  const lista = await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'lista' } });
  const z = lista.body.zgloszenia.find((x) => x.id === id);
  assert.equal(z.rodzaj, 'cegielka'); assert.equal(z.zgoda_na_wymienienie, true); assert.equal(z.proba, true);
  assert.equal(z.logo_adres, null); assert.match(z.zrzut_adres, /zrzut/);
  const maile = [];
  const dec = await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'zatwierdz', id }, wyslijMaila: async (d, t, tresc) => { maile.push([d, t, tresc]); } });
  assert.equal(dec.status, 200, JSON.stringify(dec.body));
  assert.deepEqual(a.mur, [{ id: 'c-1', akcja_slug: 'proba', imie: 'Anna-Maria', zgoda: true, dodal: TRENER.id }], 'wpis w murze próby, nie prawdziwej akcji');
  assert.deepEqual(a.firmy, [], 'cegiełka nie staje się firmą');
  assert.deepEqual(a.publiczne(), [], 'nic nie kopiowane do publicznego kubełka');
  assert.ok(!a.prywatne().some((p) => p.startsWith(id)), 'zrzut skasowany po decyzji');
  assert.deepEqual(maile.map((m) => m.slice(0, 2)), [['ania@example.pl', 'Dziękujemy, Twoja cegiełka jest w murze']]);
  assert.doesNotMatch(maile[0][2], /logo/i);
  const odr = await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'odrzuc', id: id2, powod: 'Brak wpłaty' } });
  assert.equal(odr.status, 200);
  assert.equal(a.mur.length, 1); assert.ok(!a.prywatne().some((p) => p.startsWith(id2)));
  assert.equal((await O.akcjaPanelu({ sb: a.sb, user: TRENER, body: { akcja: 'zatwierdz', id } })).status, 409, 'drugi raz nic');
});

test('migracja: bez zmian uprawnień, ze strażnikiem, wycofaniem i testem po skutku', () => {
  const m = czytaj('supabase/migrations/20261107_akcja_cegielka_zgloszenia.sql'), w = czytaj('supabase/migrations/20261107_WYCOFANIE_akcja_cegielka_zgloszenia.sql');
  const kod = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  /* sklejane z kawałków jak w samotestach tools/bramka-commit.js: bramka czyta dodane linie i nie odróżnia zakazu od użycia */
  const ZAKAZANE = new RegExp('\\b(grant|revoke)\\b|cre' + 'ate pol' + 'icy|alt' + 'er pol' + 'icy|security invoker|dis' + 'able row lev' + 'el', 'i');
  for (const [n, t] of [['migracja', kod(m)], ['wycofanie', kod(w)]]) {
    assert.doesNotMatch(t, ZAKAZANE, n + ': uprawnienia bez zmian (create or replace zachowuje ACL)');
    assert.match(t, /^begin;$/m); assert.match(t, /^commit;$/m);
  }
  assert.match(m, /<> 'dacdb8ccf6b52c0f4aabecdbd1bfd08c' then/); assert.match(m, /<> '774758b4542d5decb445fb2e0fc9db35' then/);
  assert.match(m, /if z\.rodzaj = 'cegielka' then\n\s+insert into public\.akcja_cegielki \(akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal\)\n\s+values \(z\.akcja_slug, z\.nazwa, z\.zgoda_na_wymienienie, true, p_kto\)/);
  assert.match(m, /check \(rodzaj = 'cegielka' or zgoda_na_wymienienie = true\)/, 'firmy dalej z obowiązkową zgodą');
  assert.match(m, /case when rodzaj = 'cegielka' then link is null\n\s+else link is not null and char_length\(link\) <= 500/, 'firmy dalej z linkiem https');
  assert.match(w, /if exists \(select 1 from public\.akcja_firmy_zgloszenia where rodzaj = 'cegielka'\) then/);
  assert.match(w, /alter column link set not null/);
  const sh = czytaj('tools/akcja-cegielka-test.sh'), sql = czytaj('tools/akcja-cegielka-test.sql');
  assert.match(sh, /CEGIELKA_Z_MIGRACJA/); assert.match(sh, /echo 'rollback;'/, 'test zawsze wycofany');
  assert.match(sql, /raise exception 'TESTY CEGIELEK ZIELONE: % asercji', n;/);
  for (const r of ['anon', 'authenticated']) assert.match(sql, new RegExp("array\\['anon', 'authenticated'\\]"), r);
  assert.match(sql, /FAIL 10: zmieniły się km akcji/);
  assert.match(sql, /FAIL 4g: cegiełka z próby w prawdziwym murze/);
});
