/* BLIZNA 220 (11.11.2026) — dane wpisane przez użytkownika (imię i cel zawodnika, inicjały, pola wpisu treningu, nazwy startów, avatary) idą do HTML wyłącznie przez
   helpery z sb.js w MIEJSCU wstawienia (CLAUDE.md: escapeHtml dla tekstu i atrybutów, safeUrlAttr dla src, safeExternalHref dla linków, dataset zamiast kodu w onclick).
   Pilnuje punktów wstawienia w widokach trenera (trener.html, kalendarz.html), Społeczności i pojedynków (zawodnik.html, wyzwania.html, gra.html, profil.html).
   Ładunki: imię i cel z tagiem i apostrofem, tempo z tagiem, komentarz trenera z tagiem (wiersz należy do zawodnika, więc może go wpisać właściciel). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const IMIE = `Ola<img src=x onerror=alert(1)>'); alert(2); ('`, CEL = `5 km <svg onload=alert(3)>`, TEMPO = `5:30<script>alert(4)</script>`, KOM = `<img src=x onerror=alert(5)> super`;

function helpery() {
  const w = {}; const ctx = { window: w, document: { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), addEventListener() {} }, navigator: {}, console, URL, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { hostname: 'biegamy.run', origin: 'https://biegamy.run', pathname: '/', search: '', hash: '' } };
  ctx.globalThis = ctx; w.location = ctx.location;
  const start = SB.indexOf('window.escapeHtml = function'), koniec = SB.indexOf('window.safeExternalHref = function');
  assert.ok(start > 0 && koniec > start, 'helpery w sb.js');
  const kod = SB.slice(start, SB.indexOf('\n  };', koniec) + 5);   /* od escapeHtml do końca safeExternalHref, bez reszty sb.js */
  ctx.window = ctx;
  vm.runInNewContext(kod, ctx);
  return ctx;
}

test('helpery: ładunki w imieniu, celu, tempie i komentarzu trenera nie zostawiają tagu ani apostrofu; src tylko z białej listy; javascript: odrzucone', () => {
  const H = helpery();
  for (const t of [IMIE, CEL, TEMPO, KOM]) { const e = H.escapeHtml(t); assert.doesNotMatch(e, /[<>"']/, t); assert.ok(e.includes('&lt;') || e.includes('&#39;') || e.includes('&quot;')); }
  assert.equal(H.safeUrlAttr('javascript:alert(1)'), ''); assert.equal(H.safeUrlAttr('https://zle.example/x.png'), '');
  assert.equal(H.safeExternalHref('javascript:alert(1)'), ''); assert.equal(H.safeExternalHref('data:text/html,x'), '');
  assert.match(H.safeExternalHref('https://www.strava.com/activities/1'), /^https:\/\/www\.strava\.com/);
});

test('trener.html: imię, inicjały, cel, reakcja, tempo, komentarz i GIF trenera przez helpery; imię do handlerów przez dataset', () => {
  const t = czytaj('trener.html');
  for (const w of [
    "+ escapeHtml(initials) + '</div>'", "+ escapeHtml(athName) + '</span>'", "'\"' + escapeHtml(feedbackText) +",
    "const pace = l.pace ? escapeHtml(l.pace) + '/km' : '';", "'GAP ' + escapeHtml(l.gap_pace)", "'♥ ' + escapeHtml(l.heart_rate)",
    "${escapeHtml(l.athlete_reaction)}", "${l.coach_gif && safeUrlAttr(l.coach_gif) ? `<div style=\"margin-bottom:6px;\"><img src=\"${safeUrlAttr(l.coach_gif)}\"", "${escapeHtml(l.coach_comment)}</div>",
    "data-name=\"${escapeHtml(a.full_name || '')}\" onclick=\"doCopyToAthlete('${a.id}', this.dataset.name, ", "onclick=\"openAthleteProfile(this.dataset.id, this.dataset.name)\"",
    "+ escapeHtml(ini) + '</div>'", "+ escapeHtml(name) + '</div>'", "+ escapeHtml(a.goal) + '</div>'", "+ escapeHtml(n.name) + '</div>'",
    "'+escapeHtml(ini)+'</div>'", "'+escapeHtml(name)+'</div>'", "'+escapeHtml(l.pace)+'</span><span", "title=\"${escapeHtml(t)}: ${n}\"",
  ]) assert.ok(t.includes(w), 'trener: ' + w);
  assert.doesNotMatch(t, /\+ athName \+|\+ a\.goal \+|\+ n\.name \+|\$\{l\.coach_comment\}|\$\{l\.athlete_reaction\}|src="\$\{l\.coach_gif\}"|esc\(x\.a\.full_name\)\.replace/, 'stare surowe wstawienia zniknęły');
});

test('kalendarz.html: typ, tempo, tętno, czas, nazwa aktywności, imię przy celu, zdjęcia i link Stravy przez helpery; adres zdjęcia przez dataset', () => {
  const k = czytaj('kalendarz.html');
  for (const w of [
    "${escapeHtml(t.type.toUpperCase())}", "${displayPace?escapeHtml(displayPace)+'/km':''}", "<span>${escapeHtml(type.toUpperCase())}</span>", "${pace?escapeHtml(pace)+'/km':''}",
    "data-url=\"${escapeHtml(url)}\" onclick=\"event.stopPropagation();openMoveScreenModal('${logId}',this.dataset.url,'${ds}')\"", "${escapeHtml(a.name)}</div>", "${escapeHtml(g.athlete_name.split(' ')[0])}",
    "<img src=\"${safeUrlAttr(url)}\" style=\"width:100%;max-height:120px;", "onclick=\"executeMoveScreen('${logId}',this.dataset.url,'${currentDs}')\"", "${escapeHtml(typeLabel||'')}",
    "⏱ ${escapeHtml(pace)}/km", "♥ ${escapeHtml(hr)} bpm", "<span class=\"ds-stat-val\">${escapeHtml(c.val)}</span>", "${escapeHtml(planItem.type)}</strong>", "${escapeHtml(planItem.pace)}/km",
    "<img src=\"${safeUrlAttr(url)}\" data-url=\"${escapeHtml(url)}\" onclick=\"_openDsPhoto(this.dataset.url)\"", "stravaLink.href = safeExternalHref(sv);",
  ]) assert.ok(k.includes(w), 'kalendarz: ' + w);
  assert.equal((k.match(/\$\{escapeHtml\(typeLabel\|\|''\)\}/g) || []).length, 2);
  assert.doesNotMatch(k, /\$\{t\.type\.toUpperCase\(\)\}|\$\{a\.name\}<|\$\{c\.val\}<|stravaLink\.href = sv;|_openDsPhoto\('\$\{url\}'\)/);
});

test('zawodnik.html (zamrożony, osobny diff): Społeczność, Znajomi, Porównaj, pojedynki, plan od trenera i powiadomienia', () => {
  const z = czytaj('zawodnik.html');
  for (const w of [
    "(isOwn?'Ty':escapeHtml(name))+followBadge", "'+escapeHtml(l.pace)+'<span style=\"font-size:9px;color:rgba(255,255,255,0.55)",
    "var avInner = a.avatar_url && safeUrlAttr(a.avatar_url)", "onerror=\"this.parentElement.textContent=this.alt\"", "const inner = athl?.avatar_url && safeUrlAttr(athl.avatar_url)",
    "(t.label || escapeHtml(d.type)) + ' · ' + escapeHtml(String(d.duration_days))", "escapeHtml(challenger?.full_name || 'Biegacz')", "escapeHtml((opponent?.full_name || 'Biegacz').toUpperCase())", "vs ' + escapeHtml(opponent?.full_name || 'Biegacz')",
    "data-name=\"' + nameEsc + '\" onclick=\"window._runCompareWith(this.dataset.id, this.dataset.name)", "' + escapeHtml(initials) + '</span>'",
    "${escapeHtml(t.pace)}</div>", "${data.pace ? escapeHtml(data.pace)+' /km' : '—'}", "${escapeHtml(data.heart_rate || '—')}", "if (rid && !/^[0-9a-f-]{36}$/i.test(String(rid))) rid = null;",
  ]) assert.ok(z.includes(w), 'zawodnik: ' + w);
  assert.equal((z.match(/escapeHtml\(opponent\?\.full_name \|\| 'Biegacz'\)/g) || []).length, 2, 'wychodzący i zakończony pojedynek');
  assert.doesNotMatch(z, /\(isOwn\?'Ty':name\)|'<img src="'\+a\.avatar_url\+'"|'<img src="' \+ athl\.avatar_url \+ '"|\(t\.label \|\| d\.type\)|_runCompareWith\(\\'' \+ f\.id/);
});

test('wyzwania.html, gra.html, profil.html: imię przeciwnika i gracza, avatar, typ pojedynku, nazwa startu (dataset), rekordy, odznaki', () => {
  const w = czytaj('wyzwania.html'), g = czytaj('gra.html'), p = czytaj('profil.html');
  assert.ok(w.includes("const ini = escapeHtml((other.full_name || '?')") && w.includes("other.avatar_url && safeUrlAttr(other.avatar_url)") && w.includes("escapeHtml(other.full_name || 'Biegacz') + '</div>'") && w.includes("escapeHtml(typeName) + ' · ' + escapeHtml(String(d.duration_days))"));
  assert.doesNotMatch(w, /'<img src="' \+ other\.avatar_url \+/);
  assert.equal((g.match(/\$\{escapeHtml\(name\)\}\$\{isMe \? ' \(Ty\)' : ''\}/g) || []).length, 2, 'ranking globalny i znajomych');
  assert.ok(p.includes("'<div class=\"pb-time\">' + escHtml(pb.val) + '</div>'") && p.includes("'openRaceDetails(this.dataset.raceName)'") && p.includes("data-race-name=\"' + escHtml(g.name) + '\"") && p.includes("${escHtml(b.label)}</div>") && p.includes("'+escHtml(raceName)+'</div>'") && p.includes("'+escHtml(l.pace)+'/km</span>'"));
  assert.doesNotMatch(p, /openRaceDetails\(\\'' \+ escHtml\(g\.name\)\.replace/);
});

/* RUNDA 2 (12.11.2026, audyt 11.2026 poz. 3 i 10–15): baner pojedynków, cele startowe w atrybucie, tempo i ból w panelu trenera, typ posiłku,
   liczby briefu, avatary innych osób przez safeUrlAttr (dataset do onerror), karta odznaki w feedzie, stary format zdjęcia w czacie,
   obrazki jedzenia w url() przez helper https + percent-encode (safeCssUrl z sb.js odciąłby Unsplash). Bramka tools/bramka-escape.js
   pilnuje, żeby te wzorce nie wróciły. */
test('runda 2: zawodnik.html — baner pojedynków, avatary przez safeUrlAttr + data-ini, odznaka w feedzie', () => {
  const z = czytaj('zawodnik.html');
  for (const w of [
    "+ escapeHtml(firstName) + ' wyzwał Cię na pojedynek'",
    "(ath.avatar_url&&safeUrlAttr(ath.avatar_url)?('<img src=\"'+safeUrlAttr(ath.avatar_url)+'\" data-ini=\"'+escapeHtml(ini)+'\"",
    "const avInner=av&&safeUrlAttr(av)?'<img src=\"'+safeUrlAttr(av)+'\" data-ini=\"'+iniSafe+'\"",
    "const avInner = a.avatar_url && safeUrlAttr(a.avatar_url)",
    "var av = a.avatar_url && safeUrlAttr(a.avatar_url)",
    "if (avatarUrl && safeUrlAttr(avatarUrl)) {",
    "if (data?.avatar_url && safeUrlAttr(data.avatar_url)) {",
    "font-size:13px;flex-shrink:0;\">${escapeHtml(ini)}</div>",
    "<div style=\"font-size:12px;font-weight:600;\">${escapeHtml(name)}</div>",
  ]) assert.ok(z.includes(w), 'brak: ' + w.slice(0, 80));
  for (const zle of [
    "+ firstName + ' wyzwał",
    "'<img src=\"'+escapeHtml(av)+'\"", "'<img src=\"'+escapeHtml(a.avatar_url)+'\"", "'<img src=\"'+escapeHtml(ath.avatar_url)+'\"",
    "this.parentElement.textContent=\\''+iniSafe+'\\'", "this.outerHTML=\\''+escapeHtml(ini)+'\\'",
    "img.src=avatarUrl;", "img.src = data.avatar_url;",
    "flex-shrink:0;\">${ini}</div>", "font-weight:600;\">${name}</div>",
  ]) assert.ok(!z.includes(zle), 'wrócił stary wzorzec: ' + zle.slice(0, 80));
});

test('runda 2: trener.html — data celu w atrybucie, tempo, ból, typ posiłku i liczby briefu przez escape/Number', () => {
  const t = czytaj('trener.html');
  for (const w of [
    "data-date=\"${escapeHtml(g.date || '')}\" data-type=\"${escapeHtml(raceType)}\"",
    "const pace=l.pace?escapeHtml(l.pace)+'/km':'';",
    "${escapeHtml(window.BOL ? BOL.nazwaPoziomu(a.bol.poziom) : a.bol.poziom)}, ${escapeHtml(window.BOL ? BOL.nazwaMiejsca(a.bol.miejsce) : a.bol.miejsce)}",
    "🩹 ${escapeHtml(window.BOL ? BOL.nazwaMiejsca(a.bol.miejsce) : 'ból')}",
    "const typeLabel = escapeHtml(typeLabels[m.meal_type] || m.meal_type || '');",
    "Wszystko OK · ${Number(brief.ok_count)||0}",
    "${Number(s.km_week)||0}", "${Number(s.regularity_pct)||0}%", "${Number(s.pending_intakes)||0}",
  ]) assert.ok(t.includes(w), 'brak: ' + w.slice(0, 80));
  assert.ok(!t.includes("data-date=\"${g.date || ''}\""));
  assert.ok(!t.includes("const pace=l.pace?l.pace+'/km':'';"));
});

test('runda 2: sb.js stary format zdjęcia w czacie otwiera this.src, nie adres wpisany w onclick', () => {
  assert.ok(SB.includes("onclick=\"window.open(this.src,\\'_blank\\')\""));
  assert.ok(!SB.includes("onclick=\"window.open(\\'' + safe + '\\'"));
});

test('runda 2: nutrition.html obrazki jedzenia w url() przez cssUrlJedzenia (https/http + percent-encode); races i compare avatary przez safeUrlAttr', () => {
  const n = czytaj('nutrition.html');
  assert.ok(n.includes('function cssUrlJedzenia(u)'));
  assert.equal((n.match(/url\('\$\{cssUrlJedzenia\((?:initImg|initialImg)\)\}'\)/g) || []).length, 3);
  assert.ok(!/url\('\$\{initImg\}'\)|url\('\$\{initialImg\}'\)/.test(n));
  /* helper wycięty z pliku i uruchomiony: apostrof i nawias nie wychodzą z url('…'), javascript: odpada, Unsplash przechodzi */
  const kod = n.slice(n.indexOf('function cssUrlJedzenia(u)'), n.indexOf('function getFoodImageSync'));
  const ctx = { URL, encodeURIComponent }; vm.runInNewContext(kod + '\nthis.f = cssUrlJedzenia;', ctx);
  assert.equal(ctx.f("javascript:alert(1)"), '');
  assert.match(ctx.f("https://images.unsplash.com/photo-1?x='),url(\"javascript:alert(1)\")"), /^https:\/\/images\.unsplash\.com\//);
  assert.doesNotMatch(ctx.f("https://images.unsplash.com/photo-1?x='),url(\"javascript:alert(1)\")"), /['"()<>]/);
  const r = czytaj('races.html'), c = czytaj('compare.html');
  assert.ok(r.includes("const inner = a.avatar_url && safeUrlAttr(a.avatar_url)") && r.includes("data-ini=\"${escapeHtml(ini)}\"") && r.includes("this.parentElement.textContent=this.dataset.ini"));
  assert.ok(!r.includes("escAttr(a.avatar_url)"));
  assert.ok(c.includes("f.avatar_url && safeUrlAttr(f.avatar_url)") && c.includes("profile.avatar_url && safeUrlAttr(profile.avatar_url)"));
  assert.ok(!c.includes("escapeHtml(f.avatar_url)") && !c.includes("escapeHtml(profile.avatar_url)"));
});
