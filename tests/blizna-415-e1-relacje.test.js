// Blizna #415 (27.11.2026) — E1: obserwacje i powiadomienia tylko w relacjach (migracja 20261231, test po skutku tools/relacje-uprawnienia-test.sh).
//
// Po migracji wiersz follows widzi tylko jego strona, a wstawienie powiadomienia z przeglądarki wymaga relacji pasującej do rodzaju
// (public.powiadomienie_relacja). Ten test pilnuje frontu, żeby nie zależał od cudzych wierszy:
//   * każdy odczyt follows w przeglądarce filtruje po WŁASNYM koncie (obserwujący albo obserwowany = ja);
//   * licznik obserwujących cudzego profilu idzie przez rpc obserwujacy_liczba (sama liczba), błąd → „—”, nigdy 0;
//   * listę obserwujących otwiera tylko właściciel profilu (decyzja do potwierdzenia przez Filipa przed commitem);
//   * każdy rodzaj powiadomienia wysyłany „od siebie” ma relację w powiadomienie_relacja. Nowy rodzaj bez relacji = czerwony test,
//     a nie powiadomienie, które po cichu nie dochodzi.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const PLIKI_PRZEGLADARKI = () => {
  const html = fs.readdirSync(KORZEN).filter((f) => f.endsWith('.html'));
  const js = fs.readdirSync(path.join(KORZEN, 'js')).filter((f) => /\.(m?js)$/.test(f)).map((f) => 'js/' + f);
  return html.concat(js, ['s' + 'b.js']);
};
const MIGRACJA = czytaj('supabase/migrations/20261231_obserwacje_i_powiadomienia_relacje.sql');
const WYCOFANIE = czytaj('supabase/migrations/20261231_WYCOFANIE_obserwacje_i_powiadomienia_relacje.sql');
const JA = '(?:_myId|_athleteId)';
const RELACJE = [...MIGRACJA.matchAll(/^\s+when '([a-z_]+)' then exists/gm)].map((m) => m[1]);

test('(1) odczyty follows w przeglądarce filtrują po własnym koncie (cudzego grafu nie ma skąd wziąć)', () => {
  let odczytow = 0;
  for (const p of PLIKI_PRZEGLADARKI()) {
    const kod = czytaj(p);
    for (const m of kod.matchAll(/from\(\s*['"]follows['"]\s*\)\s*\.select\(([\s\S]{0,260})/g)) {
      odczytow++;
      const ciag = m[1].split(/;|\n\s*\n/)[0];
      assert.match(ciag, new RegExp("\\.eq\\(\\s*'(?:follower_id|following_id)'\\s*,\\s*" + JA + '\\s*\\)'), p + ': odczyt follows bez filtra po własnym koncie: ' + ciag.slice(0, 120));
      if (/\.eq\(\s*'following_id'\s*,\s*_targetId/.test(ciag)) assert.match(ciag, new RegExp("\\.eq\\(\\s*'follower_id'\\s*,\\s*" + JA), p + ': obserwujący cudzego profilu bez „obserwującym jestem ja”');
    }
  }
  assert.ok(odczytow >= 8, 'znaleziono ' + odczytow + ' odczytów follows (spodziewane co najmniej 8: listy, licznik własny, odznaki)');
});

test('(2) profil: licznik obserwujących przez rpc obserwujacy_liczba; błąd albo brak funkcji → zostaje „—”', () => {
  const p = czytaj('profil.html');
  assert.ok(p.includes("const { data: folN, error: folErr } = await sb.rpc('obserwujacy_liczba', { p_athlete: _targetId });"));
  assert.ok(p.includes("if (!folErr && typeof folN === 'number') document.getElementById('ps-followers').textContent = folN;"), 'bez „|| 0”: nieznana liczba to nie zero');
  assert.match(MIGRACJA, /create or replace function public\.obserwujacy_liczba\(p_athlete uuid\)\s+returns integer\s+language sql stable security definer\s+set search_path = ''/);
  assert.match(MIGRACJA, /a\.is_public is true or a\.user_id = \(select auth\.uid\(\)\) or a\.coach_id = \(select auth\.uid\(\)\)/, 'liczba tylko dla publicznego, własnego albo podopiecznego');
});

test('(3) profil: listę obserwujących otwiera tylko właściciel; na cudzym profilu kafel nie udaje przycisku', () => {
  const p = czytaj('profil.html');
  assert.match(p, /async function openFollowersList\(\)\{\r?\n  if\(!_isOwnProfile\)return;\r?\n/);
  assert.ok(p.includes("var r=await sb.from('follows').select('follower_id').eq('following_id',_myId).limit(50);"), 'lista: obserwujący MNIE (na własnym profilu _targetId = _myId, ale wprost)');
  assert.ok(p.includes('<div class="ps-item" id="ps-followers-item" onclick="openFollowersList()" style="cursor:pointer;">'));
  assert.ok(p.includes("if (!_isOwnProfile) { const fi = document.getElementById('ps-followers-item'); if (fi) fi.style.cursor = 'default'; }"));
});

test('(4) każdy rodzaj powiadomienia „od siebie” z przeglądarki ma relację w powiadomienie_relacja', () => {
  assert.deepEqual(RELACJE, ['follow', 'friend_request', 'friend_accepted', 'chat', 'comment', 'duel', 'athlete_message']);
  const odSiebie = new Map();
  const dodaj = (typ, gdzie) => { if (!odSiebie.has(typ)) odSiebie.set(typ, []); odSiebie.get(typ).push(gdzie); };
  for (const p of PLIKI_PRZEGLADARKI()) {
    const kod = czytaj(p);
    for (const m of kod.matchAll(/_sendNotification\(\s*[A-Za-z_.]+\s*,\s*'([a-z_]+)'/g)) dodaj(m[1], p);
    for (const m of kod.matchAll(/from\(\s*['"]notifications['"]\s*\)\.insert\(\{([\s\S]{0,400}?)\}\)/g)) {
      const blok = m[1], typ = /type\s*:\s*'([a-z_]+)'/.exec(blok);
      if (typ && new RegExp('from_athlete_id\\s*:\\s*' + JA).test(blok)) dodaj(typ[1], p);
    }
  }
  assert.ok(odSiebie.size >= 6, 'znalezione rodzaje: ' + [...odSiebie.keys()].join(', '));
  for (const [typ, gdzie] of odSiebie) {
    if (typ === 'like') continue;   // reakcje: toggleReact/loadReactionCounts nie mają wywołań (martwy kod, plan S2 §4); polityka „like” odrzuca
    assert.ok(RELACJE.includes(typ), 'rodzaj „' + typ + '” (' + [...new Set(gdzie)].join(', ') + ') bez relacji w powiadomienie_relacja: po migracji nie dojdzie');
  }
  const z = czytaj('zawodnik.html');
  assert.equal((z.match(/toggleReact\(/g) || []).length - (z.match(/function toggleReact\(/g) || []).length, 0, '„like” zostaje wyjątkiem tylko dopóki reakcje są martwe (toggleReact bez wywołań)');
});

test('(5) migracja: jedna polityka odczytu follows i jedna wstawiania notifications, funkcje zamknięte, asercje; wycofanie przywraca stare nazwy', () => {
  assert.match(MIGRACJA, /create policy follows_select_relacja on public\.follows for select to authenticated\s+using \(follower_id in \(select a\.id from public\.athletes a where a\.user_id = \(select auth\.uid\(\)\)\)\s+or following_id in/);
  assert.match(MIGRACJA, /create policy notifications_insert_relacja on public\.notifications for insert to authenticated/);
  assert.match(MIGRACJA, /or public\.powiadomienie_relacja\(from_athlete_id, athlete_id, type\)/);
  assert.match(MIGRACJA, /and exists \(select 1 from public\.athletes ja where ja\.id = p_od and ja\.user_id = \(select auth\.uid\(\)\)\)/, 'pomocnik mówi tylko o relacjach pytającego');
  for (const f of ['powiadomienie_relacja(uuid, uuid, text)', 'obserwujacy_liczba(uuid)']) {
    assert.ok(MIGRACJA.includes('revoke all on function public.' + f + ' from public, anon;'), f);
    assert.ok(MIGRACJA.includes('grant execute on function public.' + f + ' to authenticated;'), f);
  }
  assert.match(MIGRACJA, /'E1: inne polityki odczytu\/wstawiania/, 'inna polityka permissive obeszłaby zawężenie: wyjątek');
  assert.match(MIGRACJA, /select komunikat from _e1_komunikat;\ncommit;\n$/, 'komunikat jako wiersz (db query nie pokazuje notice)');
  assert.match(WYCOFANIE, /create policy select_follows on public\.follows for select to public using \(auth\.uid\(\) is not null\);/);
  assert.match(WYCOFANIE, /create policy notifications_insert_authenticated on public\.notifications for insert to authenticated/);
  assert.doesNotMatch(WYCOFANIE, /drop function if exists public\.obserwujacy_liczba/, 'licznik zostaje: front go woła');
  const runner = czytaj('tools/relacje-uprawnienia-test.sh');
  assert.match(runner, /E1_Z_MIGRACJA/); assert.match(runner, /echo 'rollback;'/);
});
