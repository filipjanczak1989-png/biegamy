// OKNO SYNCU (3.11.2026, przypadek Kasi — blizna-121): każdy sync z intervals ciągnie OSTATNIE 90 DNI, nie „od ostatniego”, a dedup po
// external_id zapewnia brak duplikatów. Dzięki temu luka (zegarek nie wysyłał miesiąc, potem „Download old data” w intervals) domyka się
// jednym kliknięciem „Pobierz zaległe treningi”. full = cała praktyczna historia (pierwsze połączenie, ręczny przycisk w Profilu).
export const DNI_OKNA = 90, DNI_PELNY = 365 * 8;

/** @returns {{dni:number, oldest:string, newest:string}} daty YYYY-MM-DD dla intervals (?oldest=&newest=) */
export function oknoSyncu(full, teraz = Date.now()) {
  const dni = full ? DNI_PELNY : DNI_OKNA;
  return { dni, oldest: new Date(teraz - dni * 864e5).toISOString().slice(0, 10), newest: new Date(teraz + 864e5).toISOString().slice(0, 10) };
}

/** aktywności z intervals, których BiegaMy jeszcze nie ma (po external_id = intervals activity id) */
export function nowe(aktywnosci, zaimportowaneIds) {
  const seen = new Set(Array.from(zaimportowaneIds || [], (x) => String(x)));
  return (Array.isArray(aktywnosci) ? aktywnosci : []).filter((a) => a && a.id != null && !seen.has(String(a.id)));
}
