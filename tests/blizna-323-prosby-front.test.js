/* BLIZNA 323 (20.11.2026) — front K2 „prośba o trenera”. Trenera wybiera się prośbą (popros_o_trenera), przyjmuje trener w panelu
   (rozpatrz_prosbe). W zawodnik.html i profil.html nie ma już zapisu coach_id innego niż NULL — „Bez trenera” to wycofanie oczekującej
   prośby + coach_id = NULL. Oczekująca prośba jest widoczna (do kogo, kiedy) z „Wycofaj”. W panelu trenera sekcja „Prośby o trenera”
   (imię przez escapeHtml, po przyjęciu odświeżona lista zawodników), a martwe „Przypisz po e-mailu” zdjęte.
   Wykrywacz zapisów działa na kodzie bez komentarzy; samokontrola karmi go dawnymi wierszami, które MUSI złapać. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const Z = czytaj('zawodnik.html'), P = czytaj('profil.html'), T = czytaj('trener.html');

/* Lokalny obiekt w profil.html opisujący CUDZY profil (wynik odczytu, nie zapis) — jedyny dozwolony coach_id ≠ null w obiekcie. */
const DOZWOLONE = ['coach_id: podRow ? _myUserId : null }', 'coach_id: _myUserId } : null);'];

function zapisyTrenera(zrodlo) {
  const kod = zrodlo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const zle = [];
  for (const m of kod.matchAll(/(?<![\w.])coach_id\s*:\s*([^,}\n]+)/g)) {
    const wart = m[1].trim(), linia = kod.slice(kod.lastIndexOf('\n', m.index) + 1, kod.indexOf('\n', m.index));
    if (wart !== 'null' && !DOZWOLONE.some((d) => linia.includes(d))) zle.push(linia.trim());
  }
  for (const m of kod.matchAll(/(?:\.coach_id|\[\s*['"]coach_id['"]\s*\])\s*=(?!=)\s*([^;\n]+)/g))
    if (m[1].trim() !== 'null') zle.push(m[0].trim());
  return zle;
}
const funkcja = (zrodlo, nazwa) => {
  const i = zrodlo.indexOf('function ' + nazwa + '(');
  assert.ok(i >= 0, 'brak funkcji ' + nazwa);
  return zrodlo.slice(i, zrodlo.indexOf('\n}\n', i) + 2);
};

test('zawodnik.html i profil.html: żadnego zapisu coach_id innego niż NULL', () => {
  assert.deepEqual(zapisyTrenera(Z), [], 'zawodnik.html');
  assert.deepEqual(zapisyTrenera(P), [], 'profil.html');
});

test('samokontrola wykrywacza: dawne zapisy trenera są łapane, NULL i parametr funkcji nie', () => {
  for (const stary of ['    if (_selectedCoachId) athleteData.coach_id = _selectedCoachId;',
    "  const { error } = await sb.from('athletes').update({ coach_id: _changeCoachId }).eq('id', _athleteId);",
    '    .update({ coach_id: newCoachId })', "    athleteData['coach_id'] = x;"])
    assert.equal(zapisyTrenera(stary + '\n').length, 1, stary);
  assert.deepEqual(zapisyTrenera("update({ coach_id: null }); rpc('popros_o_trenera', { p_coach_id: x }); /* a.coach_id = b */\n"), []);
});

test('onboarding: trener tylko w trybie „Mam trenera”, prośba po zapisie wiersza, komunikat o prośbie', () => {
  assert.ok(Z.includes("function _obTrener() { return _obMode === 'coach' ? _selectedCoachId : null; }"));
  const ob = funkcja(Z, 'obFinish');
  assert.ok(!/athleteData\.coach_id/.test(ob));
  assert.ok(ob.indexOf("sb.rpc('popros_o_trenera', { p_coach_id: _obTrener() })") > ob.indexOf(".insert({ ...athleteData, user_id: session.user.id })"), 'prośba po zapisie wiersza');
  assert.ok(ob.includes('Prośba wysłana — trener potwierdzi'));
  assert.ok(!/COACH_ID\s*=\s*_selectedCoachId/.test(ob), 'COACH_ID nie zmienia się przed przyjęciem');
  assert.ok(Z.includes("'Tylko Ty i Twój trener (gdy przyjmie Twoją prośbę) widzicie Twoje treningi'"));
});

test('zawodnik.html „Zmień trenera”: prośba, „Bez trenera” = wycofanie + NULL, widoczna oczekująca prośba z „Wycofaj”', () => {
  const zapisz = funkcja(Z, 'saveCoachChange');
  assert.ok(zapisz.indexOf("sb.rpc('wycofaj_prosbe_o_trenera')") >= 0 && zapisz.indexOf("sb.rpc('wycofaj_prosbe_o_trenera')") < zapisz.indexOf('update({ coach_id: null })'), 'wycofanie przed NULL');
  assert.ok(zapisz.includes("sb.rpc('popros_o_trenera', { p_coach_id: _changeCoachId })") && zapisz.includes("'Prośba wysłana — trener potwierdzi'"));
  assert.ok(funkcja(Z, 'openChangeCoach').includes("_kartaTreneraHtml(_BEZ_TRENERA, 'Bez trenera'"));
  const moja = funkcja(Z, '_mojaProsbaOTrenera');
  assert.ok(moja.includes(".from('prosby_trenera')") && moja.includes(".eq('athlete_id', _athleteId).eq('status', 'oczekuje')"));
  const pokaz = funkcja(Z, '_pokazProsbe');
  assert.ok(pokaz.includes("escapeHtml(p.trener)") && pokaz.includes('escapeHtml(kiedy)') && pokaz.includes('onclick="wycofajProsbeOTrenera()"') && pokaz.includes('min-height:44px'));
  assert.ok(funkcja(Z, 'wycofajProsbeOTrenera').includes("sb.rpc('wycofaj_prosbe_o_trenera')"));
  assert.ok(Z.includes('id="change-coach-prosba"') && Z.includes('id="profile-coach-prosba"') && Z.includes("_pokazProsbe('profile-coach-prosba');"));
});

test('profil.html: wybór = prośba, „Bez trenera” = wycofanie + NULL, oczekująca prośba pod kartą i w oknie wyboru', () => {
  const wyb = funkcja(P, 'selectCoach');
  assert.ok(wyb.indexOf("sb.rpc('wycofaj_prosbe_o_trenera')") >= 0 && wyb.indexOf("sb.rpc('wycofaj_prosbe_o_trenera')") < wyb.indexOf('update({ coach_id: null })'), 'wycofanie przed NULL');
  assert.ok(wyb.includes("sb.rpc('popros_o_trenera', { p_coach_id: newCoachId })") && wyb.includes("'Prośba wysłana — trener potwierdzi'"));
  /* wybór tego, co już jest: wczesny powrót TYLKO bez oczekującej prośby; z prośbą o zmianę — popros_o_trenera (null) i „Zostajesz…” */
  const wczesny = "if ((newCoachId || null) === currentId && !(await _mojaProsbaOTrenera())) { closeCoachPicker(); return; }";
  assert.ok(wyb.includes(wczesny), 'wczesny powrót zależny od oczekującej prośby');
  assert.ok(wyb.indexOf(wczesny) < wyb.indexOf("sb.rpc('popros_o_trenera'") && wyb.indexOf(wczesny) < wyb.indexOf("sb.rpc('wycofaj_prosbe_o_trenera')"));
  assert.equal((wyb.match(/closeCoachPicker\(\); return; \}/g) || []).length, 1, 'jedyny wczesny powrót');
  assert.ok(wyb.includes("showToast(idProsby ? 'Prośba wysłana — trener potwierdzi' : 'Zostajesz u obecnego trenera ✓');"));
  const pokaz = funkcja(P, 'pokazProsbeOTrenera');
  assert.ok(pokaz.includes("escHtml(p.trener)") && pokaz.includes('escHtml(kiedy)') && pokaz.includes('wycofajProsbeOTrenera()') && pokaz.includes("['coach-prosba', 'coach-picker-prosba']"));
  assert.ok(funkcja(P, '_mojaProsbaOTrenera').includes(".eq('athlete_id', _myId).eq('status', 'oczekuje')"));
  assert.ok(P.includes('id="coach-prosba"') && P.includes('id="coach-picker-prosba"'));
});

test('trener.html: sekcja „Prośby o trenera” (escapeHtml imienia, Przyjmij/Odrzuć, odświeżenie zawodników), „Przypisz po e-mailu” zdjęte', () => {
  const lad = funkcja(T, 'loadProsbyTrenera');
  assert.ok(lad.includes("sb.rpc('prosby_do_mnie')") && lad.includes('${escapeHtml(imie)}') && lad.includes('${escapeHtml(ini)}'));
  assert.ok(lad.includes('data-id="${escapeHtml(p.id)}" onclick="rozpatrzProsbe(this.dataset.id, true, this)"') && lad.includes('rozpatrzProsbe(this.dataset.id, false, this)'));
  const roz = funkcja(T, 'rozpatrzProsbe');
  assert.ok(roz.includes("sb.rpc('rozpatrz_prosbe', { p_id: id, p_przyjmij: przyjmij })") && roz.includes('await loadAthletes();'));
  /* przy prośbie o ZMIANĘ zawodnik zostaje u obecnego trenera — tekst nie może mówić „zostanie bez trenera” */
  assert.ok(roz.includes("confirm('Odrzucić prośbę? Zawodnik nie zostanie przypisany do Ciebie i może poprosić ponownie.')"));
  assert.ok(!T.includes('zostanie bez trenera'));
  /* „+ Nowy” (wpis zawodnika bez konta, odrzucany przez RLS) zdjęty razem z „Przypisz po e-mailu”; okno „Dodaj zawodnika” tylko informuje */
  for (const zle of ['saveAthlete', '_ATH_PB_POLA', 'switchAthTab', 'ath-tab-new', "from('athletes').insert(", '>Nowy zawodnik<'])
    assert.ok(!T.includes(zle), 'wróciło: ' + zle);
  assert.ok(T.includes('<div id="ath-tab-existing" style="padding:20px;">') && T.includes('przy rejestracji (<b>„Mam trenera”</b>)'));
  assert.ok(T.includes('id="prosby-sec-hdr"') && T.includes('id="prosby-section"') && T.includes('loadPendingIntakes(); loadPendingMoments(); loadProsbyTrenera();'));
  for (const zle of ['assignAthleteByEmail', 'searchAthleteByEmail', 'ath-email-search', 'btn-assign', '_foundAthleteId', '>Przypisz istniejącego<'])
    assert.ok(!T.includes(zle), 'wróciło: ' + zle);
  assert.doesNotMatch(T, /\.update\(\{\s*coach_id:\s*_coachId\s*\}\)/, 'trener zapisuje coach_id wprost');
});
