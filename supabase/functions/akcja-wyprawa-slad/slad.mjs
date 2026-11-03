// WYPRAWA — ślad GPS (projekt F, komenda Filipa 4.11): czysta logika bez Deno — ładuje ją EF akcja-wyprawa-slad i testy (blizna-116).
//   uprosc(latlng, krok)      — ≤ 1 punkt / 50 m (pierwszy i ostatni zawsze), z dystansem narastającym w metrach;
//   ukryj(aktywnosci, opcje)  — PRYWATNOŚĆ (twarde, komenda C): pierwsze 2 000 m wyprawy ukryte NA ZAWSZE (dom dziecka);
//                               2 000 m przed i po każdej przerwie > 3 h (nocleg) ukryte na zawsze; ostatnie 500 m każdej aktywności
//                               ukryte, dopóki wyprawa trwa (postoje, aktualna pozycja); bez punktu „teraz”.
// Dystans liczony wzdłuż CAŁEJ wyprawy (aktywności po kolei), więc strefy nie zależą od tego, jak zegarek pociął dzień.
export const KROK_M = 50, START_UKRYJ_M = 2000, PRZERWA_H = 3, PRZERWA_UKRYJ_M = 2000, KONCOWKA_UKRYJ_M = 500;

const R = 6371000;
export function odleglosc(a, b) {
  const f1 = a[0] * Math.PI / 180, f2 = b[0] * Math.PI / 180, df = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** [[lat,lon],…] (null-e pomijane) → [[lat,lon,dist_m],…]: ≤ 1 punkt na `krok` m, pierwszy i ostatni zawsze */
export function uprosc(latlng, krok = KROK_M) {
  const p = (Array.isArray(latlng) ? latlng : []).filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) && Math.abs(x[0]) <= 90 && Math.abs(x[1]) <= 180);
  if (!p.length) return [];
  const out = [[p[0][0], p[0][1], 0]];
  let d = 0, ostatni = p[0], odOstatniegoZapisu = 0;
  for (let i = 1; i < p.length; i++) {
    const s = odleglosc(ostatni, p[i]);
    d += s; odOstatniegoZapisu += s; ostatni = p[i];
    if (odOstatniegoZapisu >= krok || i === p.length - 1) { out.push([p[i][0], p[i][1], Math.round(d)]); odOstatniegoZapisu = 0; }
  }
  return out;
}

/** aktywności [{start_at, koniec_at, punkty:[[lat,lon,d]]}] (posortowane po start_at) → ukryte przedziały dystansu globalnego [od, do] */
export function strefyUkryte(aktywnosci, o = {}) {
  const startM = o.startM ?? START_UKRYJ_M, przerwaH = o.przerwaH ?? PRZERWA_H, przerwaM = o.przerwaM ?? PRZERWA_UKRYJ_M, koncowkaM = o.koncowkaM ?? KONCOWKA_UKRYJ_M;
  const strefy = [[0, startM]];
  let offset = 0;
  const granice = aktywnosci.map((a) => { const dl = a.punkty.length ? a.punkty[a.punkty.length - 1][2] : 0; const g = { od: offset, do: offset + dl }; offset += dl; return g; });
  for (let i = 0; i < aktywnosci.length; i++) {
    const g = granice[i];
    if (!o.dotarla) strefy.push([g.do - koncowkaM, g.do]);   // dopóki trwa: końcówka każdej aktywności (postój, aktualna pozycja)
    if (i + 1 < aktywnosci.length) {
      const przerwaMs = Date.parse(aktywnosci[i + 1].start_at) - Date.parse(aktywnosci[i].koniec_at);
      if (przerwaMs > przerwaH * 3600000) { strefy.push([g.do - przerwaM, g.do]); strefy.push([granice[i + 1].od, granice[i + 1].od + przerwaM]); }   // nocleg: na zawsze
    }
  }
  return { strefy: strefy.map(([a, b]) => [Math.max(0, a), b]), granice, dlugosc: offset };
}

/** → { segmenty:[[[lat,lon],…],…], dlugosc_m, ostatni:[lat,lon]|null } — punkty w strefach znikają, segment pęka na dziurze i na granicy aktywności */
export function ukryj(aktywnosci, o = {}) {
  const akt = (aktywnosci || []).filter((a) => a && Array.isArray(a.punkty) && a.punkty.length).slice().sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const { strefy, granice, dlugosc } = strefyUkryte(akt, o);
  const ukryty = (D) => strefy.some(([a, b]) => D >= a && D <= b);
  const segmenty = [];
  let ostatni = null;
  akt.forEach((a, i) => {
    let seg = [];
    for (const p of a.punkty) {
      const D = granice[i].od + p[2];
      if (ukryty(D)) { if (seg.length > 1) segmenty.push(seg); seg = []; continue; }
      seg.push([p[0], p[1]]); ostatni = [p[0], p[1]];
    }
    if (seg.length > 1) segmenty.push(seg);
  });
  return { segmenty, dlugosc_m: Math.round(dlugosc), ostatni };
}

/** typy aktywności, które liczą się do śladu (bieg i chód na zewnątrz — bieżnia i wirtualne nie mają trasy) */
export const TYPY_SLADU = new Set(["Run", "TrailRun", "Walk", "Hike"]);
