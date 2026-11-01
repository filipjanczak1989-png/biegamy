/* BLIZNA 86 (1.11.2026) — logowanie WYŁĄCZNIE e-mailem i hasłem. Decyzja Filipa po zwiadzie „hasło": przycisk „Kontynuuj
   z Google" był wyłączony komentarzem od wiosny („do czasu Google branding verification"), a w auth.identities nie ma ani
   jednej tożsamości innej niż `email` (90/90 kont). Martwy kod (CSS .btn-google, .divider, loginGoogle, signInWithOAuth)
   zdjęty z index.html i login.html. Ten test pilnuje, że nie wróci po cichu — powrót Google to decyzja produktowa, nie
   odkomentowanie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

test('index.html i login.html: bez Google (przycisk, CSS, funkcja, OAuth); logowanie i rejestracja hasłem zostają', () => {
  for (const p of ['index.html', 'login.html']) {
    const h = czytaj(p);
    for (const wz of [/loginGoogle/, /signInWithOAuth/, /btn-google/, /Kontynuuj z Google/, /class="divider"/, /\.divider\{/, /provider:\s*'google'/])
      assert.ok(!wz.test(h), `${p}: ${wz}`);
    assert.match(h, /sb\.auth\.signInWithPassword\(\{ email, password \}\)/, p + ': logowanie hasłem');
    assert.match(h, /sb\.auth\.signUp\(\{/, p + ': rejestracja');
    assert.match(h, /resetPasswordForEmail\(email, \{ redirectTo:/, p + ': reset hasła (blizna-85)');
  }
});

test('nigdzie w aplikacji nie ma logowania przez dostawcę zewnętrznego', () => {
  const pliki = fs.readdirSync(KORZEN).filter((f) => /\.html$/.test(f)).concat(['sb.js'], fs.readdirSync(path.join(KORZEN, 'js')).map((f) => 'js/' + f));
  for (const p of pliki) assert.ok(!/signInWithOAuth|signInWithIdToken/.test(czytaj(p)), p);
});
