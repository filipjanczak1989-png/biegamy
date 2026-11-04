/* Scenariusz przepływu firm: zgłoszenie, wiersz, push, decyzja, licznik, zrzut. Wspólny dla blizna-159 (atrapa bazy) i dla przebiegu na PGlite z prawdziwym SQL (narzędzie lokalne). `sb` musi umieć rpc, from().select().eq().maybeSingle() i storage. */
'use strict';
const assert = require('node:assert/strict');

const PNG = () => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, 300); new DataView(b.buffer).setUint32(20, 120); return b; };
const plik = (b) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
const formularz = (nad) => { const m = new Map(Object.entries({ slug: 'proba', rodzaj: 'wiezowiec', nazwa: 'Firma Przeplyw', link: 'https://firma.example.pl', email: 'kontakt@firma.example.pl', zgoda: 'tak', kwota: '1500', logo: plik(PNG()), zrzut: plik(PNG()), ...nad })); return { get: (k) => (m.has(k) ? m.get(k) : null) }; };

/** Dopiero po tym scenariuszu firma jest widoczna: pełna droga od formularza do licznika. */
async function zatwierdzenie({ O, sb, moderacja, trener, licznik, pliki, wlaczFormularz }) {
  await wlaczFormularz();
  const pushe = [], maile = [];
  const w = await O.przyjmijZgloszenie({ dane: formularz({ zgoda_kwota: 'tak' }), ipSkrot: 'ip-1', sb, moderacja, powiadom: async (p) => { pushe.push(p); } });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  const id = w.body.id;
  assert.equal(pushe.length, 1, 'push wywołany');
  assert.equal(pushe[0].title, '[próba] Nowa firma: Firma Przeplyw · wieżowiec · 1500 zł');
  assert.equal(pushe[0].url, '/trener.html#firma-zgloszenie=' + id);
  assert.ok(!JSON.stringify(await licznik()).includes('Firma Przeplyw'), 'nic publicznie przed decyzją');
  const prywatne = await pliki();
  assert.ok(prywatne.some((p) => p.endsWith('/zrzut.png')), 'zrzut w kubełku');
  const lista = await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'lista' } });
  const z = lista.body.zgloszenia.find((x) => x.id === id);
  assert.equal(z.proba, true); assert.equal(z.kwota_gr, 150000);
  assert.match(z.zrzut_adres, /zrzut/); assert.match(z.logo_adres, /logo/);
  assert.equal((await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'licznik' } })).body.nowe, 1);
  const dec = await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'zatwierdz', id }, noweId: () => '66666666-6666-4666-8666-666666666666', wyslijMaila: async (d, t) => { maile.push([d, t]); } });
  assert.equal(dec.status, 200, JSON.stringify(dec.body));
  const po = await licznik();
  const f = (po.firmy || []).find((x) => x.nazwa === 'Firma Przeplyw');
  assert.ok(f, 'firma w liczniku po zatwierdzeniu');
  assert.equal(f.rodzaj, 'wiezowiec'); assert.equal(f.kwota_gr, 150000, 'kwota przy zgodzie');
  assert.match(f.logo_url, /akcja-firmy-logo\/66666666-6666-4666-8666-666666666666\.png$/);
  assert.deepEqual((await pliki()).filter((p) => p.startsWith(id)), [], 'zrzut i prywatne logo skasowane');
  assert.deepEqual(maile, [['kontakt@firma.example.pl', 'Dziękujemy, logo jest na Ulicy']]);
  assert.equal((await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'licznik' } })).body.nowe, 0);
  assert.equal((await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'zatwierdz', id } })).status, 409, 'drugi raz nie przejdzie');
  /* Mail padł: zatwierdzenie i tak działa. */
  const w2 = await O.przyjmijZgloszenie({ dane: formularz({ nazwa: 'Firma Bez Maila', rodzaj: 'domek', kwota: '150' }), ipSkrot: 'ip-1b', sb, moderacja, powiadom: async () => {} });
  const dec2 = await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'zatwierdz', id: w2.body.id }, noweId: () => '77777777-7777-4777-8777-777777777777', wyslijMaila: async () => { throw new Error('mail leży'); } });
  assert.equal(dec2.status, 200, 'awaria maila nie psuje zatwierdzenia');
  const fb = ((await licznik()).firmy || []).find((x) => x.nazwa === 'Firma Bez Maila');
  assert.ok(fb); assert.equal(fb.kwota_gr == null, true, 'kwota bez zgody niepubliczna');
}
async function odrzucenie({ O, sb, moderacja, trener, licznik, pliki, wlaczFormularz }) {
  await wlaczFormularz();
  const w = await O.przyjmijZgloszenie({ dane: formularz({ nazwa: 'Firma Odrzucana', rodzaj: 'domek', kwota: '200' }), ipSkrot: 'ip-2', sb, moderacja, powiadom: async () => {} });
  const id = w.body.id;
  const dec = await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'odrzuc', id, powod: 'Brak wpłaty' } });
  assert.equal(dec.status, 200);
  assert.ok(!JSON.stringify(await licznik()).includes('Firma Odrzucana'), 'nic publicznego');
  assert.deepEqual((await pliki()).filter((p) => p.startsWith(id)), [], 'pliki skasowane');
}
async function bezSubskrypcji({ O, sb, moderacja, trener, wlaczFormularz }) {
  await wlaczFormularz();
  /* send-push bez subskrypcji albo z wygasłą: wyjątek albo pusta odpowiedź. Zgłoszenie i tak czeka. */
  const w = await O.przyjmijZgloszenie({ dane: formularz({ nazwa: 'Firma Bez Pushu', rodzaj: 'domek', kwota: '150' }), ipSkrot: 'ip-3', sb, moderacja, powiadom: async () => { throw new Error('410 Gone: subskrypcja wygasła'); } });
  assert.equal(w.status, 200, 'awaria pushu nie psuje zgłoszenia');
  const lista = await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'lista' } });
  assert.ok(lista.body.zgloszenia.some((z) => z.id === w.body.id && z.status === 'nowe'), 'czeka w panelu');
  assert.ok((await O.akcjaPanelu({ sb, user: trener, body: { akcja: 'licznik' } })).body.nowe >= 1, 'licznik świeci');
}
async function kolejkaIProgi({ O, sb, moderacja, wlaczFormularz }) {
  await wlaczFormularz();
  const pushe = [];
  for (const n of ['Kolejka A', 'Kolejka B']) {
    const w = await O.przyjmijZgloszenie({ dane: formularz({ nazwa: n, rodzaj: 'domek', kwota: '150' }), ipSkrot: 'ip-' + n, sb, moderacja, powiadom: async (p) => { pushe.push(p); } });
    assert.equal(w.status, 200);
  }
  assert.equal(pushe.length, 2, 'każde zgłoszenie osobny push');
  assert.notEqual(pushe[0].tag, pushe[1].tag, 'osobny tag: telefon nie zastąpi jednego drugim');
  const pod = await O.przyjmijZgloszenie({ dane: formularz({ nazwa: 'Za Mala', rodzaj: 'wiezowiec', kwota: '999' }), ipSkrot: 'ip-p', sb, moderacja, powiadom: async () => {} });
  assert.equal(pod.status, 400); assert.match(pod.body.blad, /Wieżowiec od 1000 zł/);
  const bot = await O.przyjmijZgloszenie({ dane: formularz({ strona_www: 'spam' }), ipSkrot: 'ip-b', sb, moderacja, powiadom: async () => { throw new Error('nie powinno'); } });
  assert.deepEqual(bot, { status: 200, body: { ok: true } });
}
module.exports = { zatwierdzenie, odrzucenie, bezSubskrypcji, kolejkaIProgi, formularz, PNG, plik };
