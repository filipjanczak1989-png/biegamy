// STATUS SYNCHRONIZACJI — czysta logika (bez Deno): które OGNIWO rury zegarek → intervals.icu → BiegaMy stoi. Ładuje ją EF
// intervals-status i testy (blizna-121). Zasada z blizny-20: SAM CZAS nie odróżnia „rura zepsuta” od „człowiek ma przerwę” — dlatego
// pytamy intervals (źródło prawdy o zegarku): 401 = nasz token; brak nowych aktywności w intervals = zegarek nie wysyła do intervals;
// intervals ma nowsze niż BiegaMy = nasz import. Błąd inny niż 401 = 'siec' (nie oskarżamy nikogo).
export const PROG_CISZY_DNI = 7, OKNO_DNI = 30;
export const NAZWY_ZRODEL = { GARMIN_CONNECT: "Garmin Connect", GARMIN: "Garmin Connect", COROS: "Coros", SUUNTO: "Suunto", POLAR: "Polar Flow", STRAVA: "Strava",
  WAHOO: "Wahoo", ZWIFT: "Zwift", DROPBOX: "Dropbox", UPLOAD: "plik wgrany ręcznie", OAUTH_CLIENT: "aplikacja", MANUAL: "wpis ręczny", HAMMERHEAD: "Hammerhead", XERT: "Xert" };
/** nazwa źródła po polsku z pola intervals `source` (np. GARMIN_CONNECT) albo z device_name */
export function nazwaZrodla(source, device) {
  const s = String(source || "").toUpperCase();
  if (NAZWY_ZRODEL[s]) return NAZWY_ZRODEL[s];
  const d = String(device || "").toLowerCase();
  if (/garmin|fenix|forerunner|venu|instinct|enduro/.test(d)) return "Garmin Connect";
  if (/coros|pace|apex|vertix/.test(d)) return "Coros";
  if (/suunto/.test(d)) return "Suunto";
  if (/polar|vantage|pacer|grit/.test(d)) return "Polar Flow";
  if (/apple watch/.test(d)) return "Apple Watch";
  if (/amazfit|zepp|huawei|xiaomi|samsung|galaxy/.test(d)) return "aplikacja zegarka";
  return s ? s.toLowerCase().replace(/_/g, " ") : null;
}
const dni = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

/** @param {{polaczony:boolean, http:number|null, aktywnosci:Array<{start_date_local?:string, start_date?:string, source?:string, device_name?:string}>, ostBiegamy:string|null, dzis:string}} o
    @returns {{ogniwo:string, zrodlo:string|null, urzadzenie:string|null, ost_intervals:string|null, ost_biegamy:string|null, dni_ciszy:number|null, szczegoly:object}} */
export function ustalOgniwo(o) {
  const dzis = o.dzis;
  const akt = (Array.isArray(o.aktywnosci) ? o.aktywnosci : []).map((a) => ({ d: String(a.start_date_local || a.start_date || "").slice(0, 10), source: a.source || null, device: a.device_name || null }))
    .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.d)).sort((a, b) => (a.d < b.d ? 1 : -1));
  const ost = akt[0] || null;
  const baza = { zrodlo: ost ? nazwaZrodla(ost.source, ost.device) : null, urzadzenie: ost ? (ost.device ? String(ost.device).slice(0, 80) : null) : null,
    ost_intervals: ost ? ost.d : null, ost_biegamy: o.ostBiegamy || null, dni_ciszy: ost ? Math.max(0, dni(dzis, ost.d)) : null, szczegoly: { aktywnosci_30d: akt.length, http: o.http ?? null } };
  if (!o.polaczony) return { ogniwo: "brak", ...baza };
  if (o.http === 401 || o.http === 403) return { ogniwo: "token", ...baza };
  if (o.http != null && (o.http < 200 || o.http >= 300)) return { ogniwo: "siec", ...baza };
  if (!ost || dni(dzis, ost.d) > PROG_CISZY_DNI) return { ogniwo: "zegarek", ...baza, dni_ciszy: ost ? Math.max(0, dni(dzis, ost.d)) : OKNO_DNI };
  if (!o.ostBiegamy || dni(ost.d, o.ostBiegamy) > 1) return { ogniwo: "import", ...baza };
  return { ogniwo: "ok", ...baza };
}
