// ─────────────────────────────────────────────────────────────────────────────
// GRUPOWANIE BŁĘDÓW KLIENTA — jedna kopia logiki dla dwóch odbiorców.
//
//   tools/przeglad-bledow.js                  → wydruk lokalny, na żądanie
//   supabase/functions/<digest>/index.ts (B)  → JEDEN wiersz w notifications
//
// !! DLACZEGO TEN PLIK LEŻY W supabase/functions/_shared/, A NIE W tools/.
//    Edge Function przy wdrożeniu widzi wyłącznie katalog supabase/functions/,
//    więc moduł MUSI tu mieszkać, żeby B nie dostał własnej kopii. Alternatywa
//    (moduł w tools/ + kopia w EF) kosztuje dokładnie to, co już raz kosztowała
//    zduplikowana logika czatu: poprawka w jednym pliku przestaje znaczyć
//    poprawkę w obu.
//    Rozszerzenie `.mjs`, bo repo nie ma package.json — Node potraktowałby
//    `.js` jako CommonJS i wywrócił się na `export`. Deno czyta `.mjs` wprost.
//
// !! WSZYSTKO TU JEST CZYSTE: zero sieci, zero Date.now(), zero I/O.
//    To warunek, żeby dało się to przetestować i żeby B różnił się od A
//    WYŁĄCZNIE wyjściem, a nie zachowaniem.
//
// !! GRUPUJEMY PO USTERCE, NIE PO NAPISIE. Zmierzone 15.08.2026: 10 różnych
//    komunikatów w całej historii tabeli składa się na 6 usterek. Sam
//    `PRSclose` rozbijał się na dwa wiersze (8 + 3), bo Safari i Chrome
//    nazywają ten sam błąd inaczej — i przez to wyglądał na drobiazg.

/* Rodzina View Transitions: CZTERY komunikaty, JEDNA przyczyna.
   Nie jest to zgadywanie — udowodnione 15.08.2026 testem porównawczym starego
   i nowego sb.js w tym samym harnessie: nieprzypięty `viewTransition.finished`
   dawał odrzucenia na ścieżce nie-swipe i na `pageswap`, a po naprawie
   wszystkie cztery napisy znikły razem.
   !! WARIANTY ZOSTAJĄ W PODWIERSZU. Gdyby kiedyś okazało się, że iOS ma
      osobny mechanizm, zobaczysz to po tym, że JEDEN wariant został,
      a reszta zniknęła — czego sklejka bez wariantów by ukryła. */
const VT = [
  /transition was skipped/i,
  /skipping view transition/i,
  /transition was aborted/i,
];

/** Czy wiersz pochodzi z sesji diagnostycznej (nasz własny przyrząd). */
export function czyDiagnostyczny(url) {
  /* !! PO URL, NIE PO TREŚCI KOMUNIKATU. Przyrząd `?vtdebug=selftest` celowo
     produkuje nieobsłużone odrzucenie, więc ląduje w client_errors jak każdy
     inny błąd. Wykluczanie po napisie („vtdebug selftest") przestałoby działać
     PO CICHU przy pierwszej zmianie tego napisu. Kolumna `url` niesie
     `?vtdebug=…` strukturalnie, bo logger zapisuje location.search.
     ⚠️ Cena: prawdziwy błąd, który wypadnie w trakcie sesji diagnostycznej,
     też zostanie pominięty. Dlatego liczba pominiętych JEST RAPORTOWANA —
     nigdy nie znika po cichu. */
  return /[?&]vtdebug=/.test(String(url || ''));
}

/** Komunikat → nazwa usterki + wariant. `null` = pomijamy wiersz. */
export function normalizuj(message) {
  const m = String(message || '').trim();
  if (!m) return null;

  for (const re of VT) {
    if (re.test(m)) return { usterka: 'View Transition — pominięte/przerwane', wariant: m.slice(0, 46) };
  }

  // Safari: "Can't find variable: X"   ·   Chrome: "X is not defined"
  const safari = /Can't find variable:\s*([A-Za-z_$][\w$]*)/.exec(m);
  if (safari) return { usterka: 'ReferenceError: ' + safari[1], wariant: "Can't find variable" };
  const chrome = /([A-Za-z_$][\w$]*)\s+is not defined/.exec(m);
  if (chrome) return { usterka: 'ReferenceError: ' + chrome[1], wariant: 'is not defined' };

  if (/Failed to update a ServiceWorker/i.test(m)) {
    return { usterka: 'ServiceWorker: aktualizacja nieudana', wariant: '' };
  }

  const czysty = m
    .replace(/^Uncaught\s+/, '')              // Chrome dodaje, Safari nie
    .replace(/https?:\/\/[^\s'")]+/g, '<url>') // adresy rozbijałyby po originie
    .replace(/\b\d{4,}\b/g, '<n>');            // identyfikatory w treści
  return { usterka: czysty.slice(0, 90), wariant: '' };
}

/** user_agent → środowisko. Kohorta bywa CAŁĄ przyczyną: 15.08.2026 pełny
 *  Chrome Android przestał produkować objaw VT, a Messenger i iOS nie. */
export function kohorta(userAgent) {
  const u = String(userAgent || '');
  if (/FB_IAB|FBAV/.test(u)) return 'Messenger';
  if (/Instagram/.test(u)) return 'Instagram';
  if (/\bwv\b/.test(u)) return 'WebView';
  if (/CriOS/.test(u)) return 'ChromeiOS';
  if (/iPhone|iPad/.test(u)) return 'iOS';
  if (/Android/.test(u)) return 'Android';
  return 'desktop';
}

/** Stabilny klucz usterki — B używa go, żeby nie zgłaszać dwa razy tego samego. */
export function klucz(usterka) {
  return String(usterka).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Wiersze → usterki. Czysta funkcja.
 * Wejście: [{ message, url, user_agent, user_id, created_at }]
 * Wyjście: { grupy: [...], pominietych: n, wierszy: n }
 * Sortowanie po LICZBIE OSÓB — jedna osoba z 42 wierszami to jedna osoba.
 * `wierszy` zostaje widoczne, bo 42 u jednej osoby znaczy, że coś się zapętla.
 */
export function grupuj(wiersze) {
  const mapa = new Map();
  let pominietych = 0;

  for (const w of wiersze || []) {
    if (czyDiagnostyczny(w.url)) { pominietych++; continue; }
    const n = normalizuj(w.message);
    if (!n) { pominietych++; continue; }

    let g = mapa.get(n.usterka);
    if (!g) {
      g = { usterka: n.usterka, klucz: klucz(n.usterka), wierszy: 0,
            _osoby: new Set(), _strony: new Set(), _kohorty: new Map(),
            _warianty: new Map(), ostatnie: null, pierwsze: null };
      mapa.set(n.usterka, g);
    }
    g.wierszy++;
    if (w.user_id) g._osoby.add(w.user_id);
    g._strony.add(String(w.url || '').split('?')[0].replace(/^\//, '') || '/');
    const k = kohorta(w.user_agent);
    g._kohorty.set(k, (g._kohorty.get(k) || 0) + 1);
    if (n.wariant) g._warianty.set(n.wariant, (g._warianty.get(n.wariant) || 0) + 1);
    const t = String(w.created_at || '');
    if (!g.ostatnie || t > g.ostatnie) g.ostatnie = t;
    if (!g.pierwsze || t < g.pierwsze) g.pierwsze = t;
  }

  const posortuj = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, i]) => ({ nazwa: n, ile: i }));
  const grupy = [...mapa.values()].map((g) => ({
    usterka: g.usterka, klucz: g.klucz, wierszy: g.wierszy,
    osob: g._osoby.size,
    strony: [...g._strony].sort(),
    kohorty: posortuj(g._kohorty),
    warianty: posortuj(g._warianty),
    pierwsze: g.pierwsze, ostatnie: g.ostatnie,
  })).sort((a, b) => (b.osob - a.osob) || (b.wierszy - a.wierszy));

  return { grupy, pominietych, wierszy: (wiersze || []).length };
}

/**
 * Jedno zdanie dla B. Musi zmieścić się w treści powiadomienia, więc
 * wymienia najwyżej `maks` usterek i dopisuje resztę jako liczbę.
 * !! B ma wysłać JEDEN wiersz w notifications, nie pętlę — trigger
 *    notifications_send_push siedzi na AFTER INSERT, więc każdy wiersz
 *    to osobny push na telefon.
 */
export function podsumowanie(grupy, opcje) {
  const maks = (opcje && opcje.maks) || 3;
  if (!grupy || !grupy.length) return 'Brak nowych usterek u zawodników.';
  const osobRazem = grupy.reduce((s, g) => s + g.osob, 0);
  const czolo = grupy.slice(0, maks).map((g) =>
    g.usterka + ' (' + (g.strony[0] || '?') + ', ' + g.osob + ' os.)').join(' · ');
  const reszta = grupy.length - Math.min(maks, grupy.length);
  return grupy.length + (grupy.length === 1 ? ' usterka' : ' usterki') + ' u ' + osobRazem
    + (osobRazem === 1 ? ' osoby: ' : ' osób: ') + czolo
    + (reszta > 0 ? ' + ' + reszta + ' więcej' : '');
}
