/* BLIZNA 160 (luka 20, Filip 4.11): nazwisko dziecka nie leży w bieżących plikach repo, także w testach i migracjach. Repo jest publiczne. Historia gita zostaje, to decyzja świadoma. Na stronach użytkownika nazwisko było tylko w linku zbiórki z bazy i tak zostaje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { maNazwisko } = require('./_nazwisko.js');
const KORZEN = path.join(__dirname, '..');
const POMIN = new Set(['.git', 'node_modules', 'vendor', 'assets']);
const TEKSTOWE = /\.(html|js|mjs|ts|sql|md|json|toml|py|sh|yml|css|txt)$/i;

test('żaden plik tekstowy repo nie zawiera nazwiska dziecka', () => {
  const zle = [];
  (function chodz(kat) {
    for (const w of fs.readdirSync(kat, { withFileTypes: true })) {
      const p = path.join(kat, w.name);
      if (w.isDirectory()) { if (!POMIN.has(w.name)) chodz(p); continue; }
      if (TEKSTOWE.test(w.name) && maNazwisko(fs.readFileSync(p, 'utf8'))) zle.push(path.relative(KORZEN, p));
    }
  })(KORZEN);
  assert.deepEqual(zle, []);
});
