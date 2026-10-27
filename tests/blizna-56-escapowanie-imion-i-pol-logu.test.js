// BLIZNA 56 (27.10.2026) — imiona, cel i pola wpisu treningu w cudzych widokach bez escapeHtml.
//
// CO SIĘ STAŁO. `athletes.full_name`, `athletes.goal` i pola `training_logs` (pace, gap_pace, heart_rate,
// athlete_reaction, coach_comment, coach_gif, training_type, elevation_gain) to tekst zapisywany przez zawodnika —
// trigger `training_logs_guard_coach_fields` przepuszcza właściciela, więc także coach_comment. W panelu trenera
// (rejestracje, realtime, feed, logi, analityka), w feedzie zawodnika i w kalendarzu trafiały do innerHTML surowo,
// choć sąsiednie linie tych samych funkcji już escapowały. Stored XSS: zawodnik -> trener, zawodnik -> feed.
//
// Test pilnuje DOKŁADNIE tych linii: każda ma być w pliku raz, mieć opakowanie i nie mieć surowej interpolacji.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const E = 'escapeHtml', U = 'safeUrlAttr';
const LINIE = [
  ['kalendarz.html', 'renderGoals: imię zawodnika', "const athleteStr = (_urlRole === 'coach' && g.athlete_name)", "g.athlete_name.split(' ')[0]", E],
  ['trener.html', 'renderLogs_db: pace', 'const pace = l.pace ?', 'l.pace', E],
  ['trener.html', 'renderLogs_db: gap_pace', 'const gap = l.gap_pace ?', 'l.gap_pace', E],
  ['trener.html', 'renderLogs_db: heart_rate', 'const hr = l.heart_rate ?', 'l.heart_rate', E],
  ['trener.html', 'renderLogs_db: athlete_reaction', 'const reaction = l.athlete_reaction ?', 'l.athlete_reaction', E],
  ['trener.html', 'renderLogs_db: coach_gif', '${l.coach_gif ? `<div style="margin-bottom:6px;"><img src=', 'l.coach_gif', U],
  ['trener.html', 'renderLogs_db: coach_comment', '<div style="font-size:12px;line-height:1.5;">${', 'l.coach_comment', E],
  ['trener.html', '_renderNotifPanel: inicjały', "border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-family:\\'Bebas Neue\\',sans-serif;font-size:12px;flex-shrink:0;\">' + ", 'ini', E],
  ['trener.html', '_renderNotifPanel: full_name', "'<div style=\"font-size:13px;font-weight:500;\">' + ", 'name', E],
  ['trener.html', '_renderNotifPanel: goal', '+ (a.goal ?', 'a.goal', E],
  ['trener.html', '_renderNotifPanel realtime: inicjały', "background:#3db870;display:flex;align-items:center;justify-content:center;font-family:\\'Bebas Neue\\',sans-serif;font-size:11px;", 'ini', E],
  ['trener.html', '_renderNotifPanel realtime: full_name', "'<div style=\"flex:1;font-size:12px;\">' + ", 'n.name', E],
  ['trener.html', 'loadCoachSocialFeed: inicjały', 'width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid var(--border);', 'ini', E],
  ['trener.html', 'loadCoachSocialFeed: full_name', '<div style="font-size:13px;font-weight:600;">\'+', 'name', E],
  ['trener.html', 'loadCoachSocialFeed: pace', "+(l.pace?'<div><span style=\"font-family:Bebas Neue,sans-serif;font-size:20px;", 'l.pace', E],
  ['trener.html', 'loadCoachSocialFeed: elevation_gain', "+(l.elevation_gain?'<div>", 'l.elevation_gain', E],
  ['trener.html', '_loadCComments: inicjały', 'width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);display:flex;', 'ini', E],
  ['trener.html', 'loadAnalytics: training_type', '<div style="font-size:11px;flex:1;">${', "l.training_type||'Trening'", E],
  ['trener.html', 'loadAnalytics: pace', "${l.pace?`<div style=\"font-size:9px;color:var(--muted);font-family:'DM Mono',monospace;\">", 'l.pace', E],
  ['zawodnik.html', 'loadSocialFeed: full_name', "text-overflow:ellipsis;\">'+(isOwn?'Ty':", 'name', E],
  ['zawodnik.html', 'loadSocialFeed: pace', "+(l.pace?'<span style=\"font-family:Bebas Neue,sans-serif;font-size:18px;", 'l.pace', E],
  ['zawodnik.html', '_renderBadgeEvent: inicjały', "border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:13px;flex-shrink:0;\">${", 'ini', E],
  ['zawodnik.html', '_renderBadgeEvent: full_name', '<div style="font-size:12px;font-weight:600;">${', 'name', E],
];

const pliki = {};
for (const [plik, opis, kontekst, wyr, opak] of LINIE) {
  test(`${plik} ${opis}: ${opak}(${wyr})`, () => {
    const linie = (pliki[plik] ||= czytaj(plik).split('\n')).filter((l) => l.includes(kontekst));
    assert.equal(linie.length, 1, 'kontekst ma wskazywać jedną linię (przesunięty kod = przejrzyj test)');
    const opakowane = `${opak}(${wyr})`;
    assert.ok(linie[0].includes(opakowane), 'brak ' + opakowane);
    const reszta = linie[0].split(opakowane).join('');
    assert.ok(!new RegExp('(\\$\\{|[+?:]\\s*)' + re(wyr) + '(\\s*[+})])').test(reszta), 'surowa interpolacja ' + wyr);
  });
}
