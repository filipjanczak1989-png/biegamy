/* wstaw-z-odzyskiem.mjs — INSERT masowy, który nie ginie przez jeden zły wiersz.
 *
 * ⚠️ KLASA BŁĘDU, DLA KTÓREJ TO POWSTAŁO: „batch pada w całości przy jednym złym
 * wierszu". Zgłoszone 14.08.2026 przy dokładaniu CHECK-a `training_logs_distance_sane`,
 * naprawione 19.08.2026 w `intervals-sync`. Wzorzec wróci przy KAŻDYM następnym
 * imporcie masowym — dlatego stoi tutaj, a nie w ciele jednej funkcji brzegowej.
 *
 * STRATEGIA — batch, a przy błędzie retry wiersz po wierszu TYLKO dla tej paczki:
 *   · ścieżka normalna kosztuje JEDNO zapytanie, dokładnie tyle co przedtem
 *   · awaria kosztuje jeden dodatkowy przebieg, raz
 * Zmierzone 19.08.2026 na produkcji, dlaczego nie „zawsze pojedynczo": rutynowy
 * sync wstawia 0–3 wiersze (rekord aktywności w jednym dniu to 3), a pierwsze
 * połączenie z 8-letnią historią najwyżej 452 (rekord bazy przy 17 osobach,
 * średnia 98). „Zawsze pojedynczo" mnożyłoby round-tripy ~450× przy każdym
 * pierwszym połączeniu — dla awarii, która dotąd nie zaszła.
 *
 * ⚠️ ZWRACA `ok:false` GDY NIE PRZESZŁO NIC. To nie jest wtedy „import
 * z pominięciami", tylko awaria systemowa (zerwane połączenie, zły klucz, tabela
 * w blokadzie) — a odpowiedź „zsynchronizowano 0 z 452" wyglądałaby na spokojny
 * wynik. Wołający ma wtedy oddać pierwotny błąd batcha, nie listę 452 pominięć.
 *
 * ⚠️ NIE JEST TRANSAKCYJNE i to jest świadome. Po odzysku część wierszy jest
 * w bazie, część nie — dokładnie o to chodzi. Kto potrzebuje „wszystko albo nic",
 * NIE ma używać tej funkcji.
 */

/* Ile wstawek jednocześnie w fazie odzysku. 452 wiersze to ~46 fal zamiast 452
   rund sekwencyjnych — trzyma odzysk w budżecie czasu funkcji brzegowej.
   ⚠️ OSĄD, nie pomiar. */
export const ROWNOLEGLE_DOMYSLNIE = 10;

/**
 * ⚠️ `klient` jest typu `any` ŚWIADOMIE. Dokładny kształt `from().insert()`
 * w supabase-js to PostgrestFilterBuilder — thenable, ale NIE Promise, więc
 * wąska sygnatura wywalała `deno check` w intervals-sync. Kontrakt, na którym
 * naprawdę polegamy, brzmi: `klient.from(t).insert(x)` da się `await`-ować
 * i zwraca `{ error }`. Atrapa w teście spełnia dokładnie to.
 * @param {any} klient  supabase-js albo jego atrapa
 * @param {string} tabela
 * @param {any[]} wiersze
 * @param {{rownolegle?:number, klucz?:(w:any)=>{external_id?:string,data?:string}}} [opcje]
 * @returns {Promise<{ok:boolean, wstawione:number, pominiete:{external_id:string,data:string,powod:string}[], bladBatcha:string|null}>}
 */
export async function wstawZOdzyskiem(klient, tabela, wiersze, opcje = {}) {
  const pominiete = [];
  if (!Array.isArray(wiersze) || wiersze.length === 0) {
    return { ok: true, wstawione: 0, pominiete, bladBatcha: null };
  }

  const { error } = await klient.from(tabela).insert(wiersze);
  if (!error) {
    return { ok: true, wstawione: wiersze.length, pominiete, bladBatcha: null };
  }

  const R = Math.max(1, opcje.rownolegle || ROWNOLEGLE_DOMYSLNIE);
  const klucz = opcje.klucz || ((w) => ({
    external_id: String((w && w.external_id) || ''),
    data: String((w && w.logged_at) || '').slice(0, 10),
  }));

  let wstawione = 0;
  for (let i = 0; i < wiersze.length; i += R) {
    const paczka = wiersze.slice(i, i + R);
    const wyniki = await Promise.all(paczka.map(async (w) => {
      /* ⚠️ try/catch, nie samo sprawdzenie `error`: atrapa i prawdziwy klient
         mogą RZUCIĆ (sieć, timeout), a wtedy Promise.all wywaliłoby cały odzysk
         — czyli dokładnie ten błąd, który tu naprawiamy, piętro wyżej. */
      try {
        const { error: e1 } = await klient.from(tabela).insert(w);
        return e1 ? { zly: w, powod: String(e1.message || e1) } : null;
      } catch (e) {
        return { zly: w, powod: String((e && e.message) || e) };
      }
    }));
    for (const z of wyniki) {
      if (z) pominiete.push({ ...klucz(z.zly), powod: z.powod });
      else wstawione++;
    }
  }

  return {
    ok: wstawione > 0,
    wstawione,
    pominiete,
    bladBatcha: String(error.message || error),
  };
}
