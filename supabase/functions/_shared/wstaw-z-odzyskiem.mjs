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

/* ⚠️ POWÓD MUSI BYĆ CZYTELNY, INACZEJ „dwa pominięte" TO ZAGADKA dla kogoś, kto
   właśnie podłączył zegarek. Surowy komunikat Postgresa („new row for relation
   … violates check constraint \"training_logs_distance_sane\"") nie jest
   odpowiedzią na pytanie „czemu mój bieg nie wszedł".
   ⚠️ Gdy wzorzec nie pasuje, ODDAJEMY SUROWY TEKST, nie „nieznany błąd" —
   nierozpoznany powód, który dało się przeczytać, jest wart więcej niż nasza
   uprzejma etykieta zasłaniająca go w całości. */
export function czytelnyPowod(surowy) {
  const t = String(surowy || '');
  if (/training_logs_distance_sane|distance_km/i.test(t)) return 'dystans poza zakresem 0–500 km';
  if (/duplicate key|already exists|unique constraint/i.test(t)) return 'duplikat — ten trening już jest';
  const nn = /null value in column "([^"]+)"/i.exec(t);
  if (nn) return 'brak wymaganego pola: ' + nn[1];
  if (/violates foreign key/i.test(t)) return 'odwołanie do nieistniejącego wiersza';
  if (/invalid input syntax for type ([a-z ]+)/i.test(t)) return 'zła wartość dla typu ' + RegExp.$1.trim();
  if (/check constraint "([^"]+)"/i.exec(t)) return 'nie spełnia reguły bazy: ' + RegExp.$1;
  return t.slice(0, 120);
}

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
 * @returns {Promise<{ok:boolean, wstawione:number, pominiete:{external_id:string,data:string,powod:string,powodCzytelny:string}[], bladBatcha:string|null}>}
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
      /* `powod` zostaje SUROWY (do logu i do diagnozy), `powodCzytelny` idzie do
         człowieka. Dwa pola, nie jedno — podmiana surowego na ładny zabrałaby
         jedyny ślad, po którym da się dojść, co naprawdę odbiło. */
      if (z) pominiete.push({ ...klucz(z.zly), powod: z.powod, powodCzytelny: czytelnyPowod(z.powod) });
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
