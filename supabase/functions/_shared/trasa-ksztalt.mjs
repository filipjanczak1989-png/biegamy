// TRASA — kształt treningu BEZ WSPÓŁRZĘDNYCH (T2, plan dzis\spolecznosc\plan-s2.md §1, decyzje Filipa 27.11). Czysta logika: ładują ją
// intervals-webhook i intervals-sync (za flagą TRASY_WLACZONE=1, domyślnie wyłączone) oraz testy (blizna-417).
//
// Wejście: strumień latlng z intervals (GET /activity/{id}/streams?types=latlng: szerokości w `data`, długości w `data2`).
// Wyjście do tabeli trasy (migracja 20261232): dwa napisy z kształtem w pudełku 0–1000 (dłuższy bok = 1000, północ u góry), bez stopni i metrów:
//   ksztalt     — cały ślad, dla właściciela i jego trenera (mała trasa w „Ostatnim treningu”);
//   ksztalt_pub — tylko bieg, z ucięciem wokół startu i mety: usuwamy KAŻDY punkt bliżej niż R od startu albo od mety (także gdy trasa wraca
//                 pod dom w połowie), R = 300 m + 0–200 m stałe dla danego treningu (z id wpisu); po ucięciu co najmniej 2 km, inaczej null.
//                 Pokazanie w Społeczności dopiero ze zgodą (T5) i tylko u profili publicznych; tu tylko liczymy.
// Dziura w śladzie (skok > 300 m między kolejnymi próbkami, utrata GPS) dzieli kształt na odcinki: bez kreski przez miejsce, którego nie było.
// Bieżnia i ślad drgający w miejscu (rozpiętość < 100 m) = brak kształtu. Najwyżej 60 punktów na kształt (Douglas–Peucker), ok. 150–250 B.
// Kodowanie: odcinki rozdzielone spacją; w odcinku różnice x, y jak w polilinii Google (znaki 63–126), od (0,0) na początku każdego odcinka.
export const WERSJA = 1, PUNKTY_MAKS = 60, MIN_PUB_M = 2000, R_BAZA_M = 300, R_ROZRZUT_M = 200, DZIURA_M = 300, MIN_ROZPIETOSC_M = 100, SKALA = 1000;
const ZIEMIA_M = 6371000;

/** R ucięcia dla treningu: 300–500 m, zawsze to samo dla tego samego id (FNV-1a), różne dla różnych treningów. */
export function promienDla(logId) {
  let h = 0x811c9dc5;
  const s = String(logId || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return R_BAZA_M + (h % (R_ROZRZUT_M + 1));
}

/** Strumień latlng → [[lat, lon], …]; puste, null, (0,0) i spoza zakresu odrzucone. Pary w `data` też przechodzą (zmiana po stronie intervals). */
export function punktyZeStrumienia(strumien) {
  const d = strumien && strumien.data;
  if (!Array.isArray(d)) return [];
  const pary = Array.isArray(strumien.data2) ? d.map((lat, i) => [lat, strumien.data2[i]]) : d;
  return pary.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && !(p[0] === 0 && p[1] === 0));
}

/** [[lat, lon]] → [[x, y]] w metrach względem pierwszego punktu (rzut równokątny; na kilkunastu km błąd pomijalny dla kształtu). */
export function doMetrow(latlng) {
  if (!latlng.length) return [];
  const [la0, lo0] = latlng[0], k = Math.cos(la0 * Math.PI / 180), r = Math.PI / 180 * ZIEMIA_M;
  return latlng.map(([la, lo]) => [(lo - lo0) * r * k, (la - la0) * r]);
}

const odl = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function dlugoscM(odcinki) { let d = 0; for (const s of odcinki) for (let i = 1; i < s.length; i++) d += odl(s[i - 1], s[i]); return d; }
function pudelko(odcinki) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of odcinki) for (const [x, y] of s) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1, y0, y1, rozp: Math.max(x1 - x0, y1 - y0) };
}

/** Podział na odcinki przy skoku > dziura m; odcinek musi mieć co najmniej 2 punkty. */
export function odcinki(punkty, dziura = DZIURA_M) {
  const out = []; let cur = [];
  for (const p of punkty) {
    if (cur.length && odl(cur[cur.length - 1], p) > dziura) { if (cur.length > 1) out.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Ucięcie: każdy punkt bliżej niż R od startu (pierwszy punkt) albo mety (ostatni) znika; odcinek pęka w tym miejscu. */
export function przytnij(odc, R) {
  if (!odc.length) return [];
  const start = odc[0][0], ostatni = odc[odc.length - 1], meta = ostatni[ostatni.length - 1], out = [];
  for (const s of odc) {
    let cur = [];
    for (const p of s) {
      if (odl(p, start) < R || odl(p, meta) < R) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

function odlOdOdcinka(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  if (!L) return odl(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const zostaw = new Uint8Array(pts.length); zostaw[0] = 1; zostaw[pts.length - 1] = 1;
  const stos = [[0, pts.length - 1]];
  while (stos.length) {
    const [a, b] = stos.pop(); let dmax = -1, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = odlOdOdcinka(pts[i], pts[a], pts[b]); if (d > dmax) { dmax = d; idx = i; } }
    if (idx > 0 && dmax > eps) { zostaw[idx] = 1; stos.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => zostaw[i]);
}
/** Douglas–Peucker z rosnącą tolerancją, aż wszystkie odcinki razem mają ≤ maks punktów; przy zbyt wielu odcinkach zostają najdłuższe. */
export function uprosc(odc, maks = PUNKTY_MAKS) {
  let w = odc;
  const ileOdcinkow = Math.floor(maks / 2);
  if (w.length > ileOdcinkow) {
    const dl = w.map((s, i) => [dlugoscM([s]), i]).sort((p, q) => q[0] - p[0]).slice(0, ileOdcinkow).map((p) => p[1]).sort((p, q) => p - q);
    w = dl.map((i) => w[i]);
  }
  let eps = 1, wynik = w;
  for (let i = 0; i < 60; i++) {
    wynik = w.map((s) => dp(s, eps));
    if (wynik.reduce((n, s) => n + s.length, 0) <= maks) return wynik;
    eps *= 1.4;
  }
  return wynik;
}

/** Pudełko 0–SKALA (dłuższy bok), północ u góry, liczby całkowite; kolejne jednakowe punkty zlane. null, gdy nie ma rozpiętości. */
export function normalizuj(odc) {
  const { x0, y1, rozp } = pudelko(odc);
  if (!(rozp > 0)) return null;
  const k = SKALA / rozp;
  return odc.map((s) => {
    const out = [];
    for (const [x, y] of s) { const p = [Math.round((x - x0) * k), Math.round((y1 - y) * k)]; const o = out[out.length - 1]; if (!o || o[0] !== p[0] || o[1] !== p[1]) out.push(p); }
    return out;
  }).filter((s) => s.length > 1);
}

function liczbaNaZnaki(v) {
  let u = v < 0 ? ~(v << 1) : v << 1, s = '';
  while (u >= 0x20) { s += String.fromCharCode((0x20 | (u & 0x1f)) + 63); u >>= 5; }
  return s + String.fromCharCode(u + 63);
}
export function koduj(odc) {
  return odc.map((s) => { let px = 0, py = 0, t = ''; for (const [x, y] of s) { t += liczbaNaZnaki(x - px) + liczbaNaZnaki(y - py); px = x; py = y; } return t; }).join(' ');
}
export function dekoduj(napis) {
  return String(napis || '').split(' ').filter(Boolean).map((t) => {
    const out = []; let i = 0, x = 0, y = 0;
    const jedna = () => { let wynik = 0, przes = 0, b; do { b = t.charCodeAt(i++) - 63; wynik |= (b & 0x1f) << przes; przes += 5; } while (b >= 0x20); return wynik & 1 ? ~(wynik >> 1) : wynik >> 1; };
    while (i < t.length) { x += jedna(); y += jedna(); out.push([x, y]); }
    return out;
  });
}

/** Strumień latlng → { ksztalt, ksztalt_pub, dystans_m, wersja } albo null (bez śladu, bieżnia, drganie w miejscu). Bez współrzędnych w wyniku. */
export function zbudujKsztalty({ logId, strumien, czyBieg }) {
  const odc = odcinki(doMetrow(punktyZeStrumienia(strumien)));
  if (!odc.length || pudelko(odc).rozp < MIN_ROZPIETOSC_M) return null;
  const wlasny = normalizuj(uprosc(odc));
  if (!wlasny || !wlasny.length) return null;
  let pub = null;
  if (czyBieg) {
    const t = przytnij(odc, promienDla(logId));
    if (t.length && dlugoscM(t) >= MIN_PUB_M) { const n = normalizuj(uprosc(t)); if (n && n.length) pub = koduj(n); }
  }
  return { ksztalt: koduj(wlasny), ksztalt_pub: pub, dystans_m: Math.round(dlugoscM(odc)), wersja: WERSJA };
}

/** Flaga TRASY_WLACZONE: tylko dokładnie '1' włącza. */
export function trasyWlaczone(wartosc) { return wartosc === '1'; }

/** Nagłówek intervals z intervals_credentials (OAuth Bearer albo klucz Basic); null bez poświadczeń. Nigdy do logu. */
export function naglowekIntervals(c) {
  if (!c) return null;
  if (c.access_token) return 'Bearer ' + c.access_token;
  if (c.api_key) return 'Basic ' + btoa('API_KEY:' + c.api_key);
  return null;
}

/** Pobranie śladu jednej aktywności i zapis kształtów (upsert po log_id). Nie rzuca: wynik { zapisano, powod }. fetchFn do testów. */
export async function zapiszTrase(svc, { logId, athleteId, activityId, auth, czyBieg, fetchFn = globalThis.fetch }) {
  const f = fetchFn;
  if (!logId || !athleteId || activityId == null || !auth) return { zapisano: false, powod: 'brak danych' };
  let strumienie;
  try {
    const r = await f('https://intervals.icu/api/v1/activity/' + encodeURIComponent(String(activityId)) + '/streams?types=latlng', { headers: { Authorization: auth } });
    if (!r.ok) return { zapisano: false, powod: 'intervals ' + r.status };
    strumienie = await r.json();
  } catch (e) { return { zapisano: false, powod: 'intervals sieć' }; }
  const latlng = (Array.isArray(strumienie) ? strumienie : []).find((s) => s && s.type === 'latlng');
  const k = zbudujKsztalty({ logId, strumien: latlng, czyBieg: !!czyBieg });
  if (!k) return { zapisano: false, powod: 'bez trasy' };
  try {
    const { error } = await svc.from('trasy').upsert({ log_id: logId, athlete_id: athleteId, ...k }, { onConflict: 'log_id' });
    return error ? { zapisano: false, powod: 'zapis ' + (error.code || error.message) } : { zapisano: true };
  } catch (e) { return { zapisano: false, powod: 'zapis wyjątek' }; }
}
