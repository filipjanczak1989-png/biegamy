// BRAMKA: DANE OSÓB W MIGRACJACH I KOMENTARZACH (Filip 9.11.2026, po analizie „Miasto Dobra”).
// Repo jest publiczne. 9.11 do `main` weszła migracja z komentarzem „<imię> (… <kwota> zł)” (kwota darczyńcy miała być NIGDY publiczna),
// a starsze migracje miały e-maile i UUID kont organizatora oraz tajny cel wyprawy. Ta reguła łapie trzy KSZTAŁTY:
//   1) adres e-mail,
//   2) kwotę w zł/PLN przy imieniu (słowo z wielkiej litery albo WERSALIKI, nie z listy zwykłych słów),
//   3) UUID przy słowach o koncie (athlete, user_id, auth.users, trener, konto, startujący, zawodnik…).
// Gdzie: CAŁA linia w plikach .sql (migracje, testy SQL, migawki schematu) i KOMENTARZ w kodzie (//, /*, *, <!--, # w skryptach).
// Treść w kodzie (np. adres nadawcy maila w EF, mailto w stopce) nie jest komentarzem i tu nie trafia.
// ⚠️ GRANICA: kształt, nie sens. Imię bez kwoty, cel wyprawy, nazwisko w zwykłym zdaniu PRZEJDĄ; komentarz blokowy
//    rozpoznajemy po `/*` albo `*` na początku linii, środek długiego bloku bez gwiazdki przejdzie. Adresy testowe (example.*, *.invalid,
//    *.local, *.test) i UUID-atrapy (np. 11111111-1111-…, 00000000-…) przechodzą.
'use strict';

const RE_EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,}))(?![A-Za-z0-9-])/g;
const DOMENY_TESTOWE = /(^|\.)(example\.(com|org|net|pl)|[a-z0-9-]+\.(invalid|local|localhost|test|example))$|^[a-z0-9]\.[a-z]{2,}$/i;   // a@a.pl, x@x.com = atrapy w testach
const KONCOWKI_PLIKOW = /^(png|jpe?g|webp|svg|gif|avif|ico|js|mjs|ts|css|html?|json|mp3|mp4|webm|sql|md|txt|woff2?|ttf)$/i;
const RE_KWOTA = /(?<![\p{L}\d])\d{1,3}(?:[  .]?\d{3})*(?:[.,]\d{1,2})?\s?(?:zł|PLN)(?![\p{L}])/gu;
const RE_SLOWO = /(?<![\p{L}_])(\p{Lu}\p{Ll}{2,}|\p{Lu}{3,})(?![\p{L}_])/gu;
/* Imię przy kwocie: (a) imię z listy najczęstszych polskich imion (z formami zdrobniałymi), albo (b) słowo WERSALIKAMI (imiona w murze
   bywają zapisane wersalikami, np. z formularza). Zwykłe słowo z wielkiej litery na początku zdania („Błąd”, „Publicznie”) NIE jest imieniem:
   skan całego repo 9.11 dawał na nim 4 fałszywe alarmy na 6 trafień. Imię spoza listy przy kwocie PRZEJDZIE (granica kształtu). */
const IMIONA = new Set(('adam adrian agata agnieszka aleksander aleksandra alicja amelia ania anna antoni antek arek arkadiusz artur asia barbara bartek bartosz '
  + 'beata bogdan bożena czesław damian daniel danuta dariusz darek dawid dominik dominika dorota edyta elżbieta emil emilia ewa ewelina filip franciszek '
  + 'gabriela grażyna grzegorz halina hanna helena henryk hubert iga igor irena iwona izabela jacek jadwiga jakub jan janek janina janusz jarek jarosław '
  + 'jerzy joanna jola jolanta józef julia julian justyna kacper kamil kamila karol karolina kasia katarzyna kazimierz kinga klaudia konrad kornelia '
  + 'krystian krystyna krzysiek krzysztof kuba lena leon leszek liliana lucyna łucja łukasz maciej maciek magda magdalena maja małgorzata małgosia marcel '
  + 'marcin marek maria marian mariusz marta marzena mateusz michał mikołaj milena mirek mirosław monika natalia nikola nikodem norbert ola oliwia oliwer '
  + 'oskar patryk paula paulina paweł piotr przemek przemysław rafał renata robert roman ryszard sebastian sławek sławomir stanisław stefan sylwia szymon '
  + 'tadeusz teresa tomasz tomek urszula wanda weronika wiesław wiktor wiktoria witold władysław wojciech wojtek zbigniew zdzisław zenek zenon zofia zosia '
  + 'zuzanna zuzia żaneta').split(/\s+/));
const NIE_IMIONA_WERSALIKAMI = /^(PLN|SQL|RLS|FAIL|TESTY|TEST|OK|UPDATE|INSERT|SELECT|DELETE|WHERE|VALUES|AND|NOT|NULL|TRUE|FALSE|ZIELONE|EF|RPC|API|URL|PDF|KRS|NIP|VAT|BLIK|USD|EUR|ID|UUID|CHECK|DEFAULT|GRANT|REVOKE|BRAK|UWAGA|WAŻNE|NIGDY|TYLKO|ZAWSZE|NIE|TAK)$/;
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SLOWA_KONTA = /athlete|user_?id|auth\.users|\buid\b|_uid\b|_ath\b|coach|trener|konto|konta|startuj|zawodni|profil|organizator|darczy/i;

function atrapaUuid(u) {
  const g = u.toLowerCase().split('-');
  if (/^0{8}$/.test(g[0])) return true;
  return g.every((x) => new Set(x.replace(/^4/, '')).size <= 1) || g.slice(0, 2).every((x) => new Set(x).size === 1);
}

/** Część linii do sprawdzenia: cała linia w .sql, sam komentarz w innym kodzie, nic w pozostałych plikach. */
function fragmentDoSprawdzenia(plik, linia) {
  const p = String(plik || '').toLowerCase();
  if (/\.sql$/.test(p)) return linia;
  if (/\.(js|mjs|cjs|ts|css)$/.test(p)) {
    const t = linia.trimStart();
    if (/^(\*|\/\*|\/\/)/.test(t)) return linia;
    const i = linia.search(/(?<![:\/\\'"`])\/\/(?![\/])|\/\*/);
    return i >= 0 ? linia.slice(i) : '';
  }
  if (/\.html?$/.test(p)) { const i = linia.indexOf('<!--'); return i >= 0 ? linia.slice(i) : ''; }
  if (/\.(sh|ya?ml|py|toml)$/.test(p) || /(^|\/)\.githooks\//.test(p)) { const m = /(^|\s)#(?!!)(.*)$/.exec(linia); return m ? m[2] : ''; }
  return '';
}

/** Trafienia reguł w jednym fragmencie. kontekst = fragment + do 3 poprzednich linii tego samego pliku (dla UUID przy koncie). */
function trafienia(fragment, kontekst) {
  const wyn = [];
  if (!fragment) return wyn;
  for (const m of fragment.matchAll(RE_EMAIL)) {
    if (DOMENY_TESTOWE.test(m[1]) || KONCOWKI_PLIKOW.test(m[2])) continue;
    wyn.push({ regula: 'adres e-mail', fragment: m[0] }); break;
  }
  for (const k of fragment.matchAll(RE_KWOTA)) {
    const okno = fragment.slice(Math.max(0, k.index - 60), k.index + k[0].length + 60);
    const imie = [...okno.matchAll(RE_SLOWO)].map((s) => s[1]).find((s) => (s === s.toUpperCase() ? !NIE_IMIONA_WERSALIKAMI.test(s) : IMIONA.has(s.toLowerCase())));
    if (imie) { wyn.push({ regula: 'kwota w zł przy imieniu', fragment: imie + ' … ' + k[0] }); break; }
  }
  if (SLOWA_KONTA.test(kontekst || fragment)) {
    for (const u of fragment.matchAll(RE_UUID)) {
      if (atrapaUuid(u[0])) continue;
      wyn.push({ regula: 'UUID konta użytkownika', fragment: u[0] }); break;
    }
  }
  return wyn;
}

/** Linie jednego pliku (dodane albo całe) → trafienia z numerem linii w tej liście. */
function sprawdzPlik(plik, linie) {
  const wyn = [], frag = linie.map((l) => fragmentDoSprawdzenia(plik, l));
  for (let i = 0; i < linie.length; i++) {
    if (!frag[i] || /bramka:przyklad/.test(linie[i])) continue;
    const kontekst = frag.slice(Math.max(0, i - 3), i + 1).join('\n');
    for (const t of trafienia(frag[i], kontekst)) wyn.push({ ...t, nr: i + 1, plik });
  }
  return wyn;
}

/** Dodane linie z diffu pogrupowane po plikach: [{plik, linie: []}] → trafienia. */
function sprawdzDodane(wPlikach) {
  const wyn = [];
  for (const { plik, linie } of wPlikach || []) wyn.push(...sprawdzPlik(plik, linie));
  return wyn;
}

module.exports = { fragmentDoSprawdzenia, trafienia, sprawdzPlik, sprawdzDodane, atrapaUuid, IMIONA };
