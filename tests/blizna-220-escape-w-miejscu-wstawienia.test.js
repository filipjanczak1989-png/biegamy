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
