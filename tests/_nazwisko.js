/* Strażnik nazwiska dziecka bez nazwiska w repo (luka 20, repo publiczne): porównujemy odcisk każdego słowa o tej długości. Samo słowo jest tylko w bazie, w linku zbiórki. */
'use strict';
const crypto = require('node:crypto');
const ODCISK = 'bc36425e8fd7eb67591004255c02981989ec073b81ae6625592c886a415e233f', DLUGOSC = 9;
function maNazwisko(tekst) {
  const slowa = String(tekst).toLowerCase().split(/[^a-ząćęłńóśźż]+/);
  for (const s of slowa) {
    if (s.length === DLUGOSC && crypto.createHash('sha256').update(s).digest('hex') === ODCISK) return true;
  }
  return false;
}
module.exports = { maNazwisko };
