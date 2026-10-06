// Domykanie planu (`trainings.status = 'done'`) po wpadnięciu logu — ta sama reguła, co
// saveLog w zawodnik.html (SSOT w sb.js: `window.wybierzPlanDoDomkniecia`). Tu DRUGA KOPIA
// dla Deno; rozjazd zachowania wykrywa tools/bramka-reguly.js (część E) i
// tests/blizna-37-*.test.js, które karmią obie kopie TYMI SAMYMI przypadkami.
//
// Po co (paczka 2, 06.10.2026): intervals-sync i intervals-webhook wstawiały training_logs
// i NIE dotykały trainings — plan zostawał `planned` mimo wykonania. To główne źródło
// 293 wiszących planów z logiem tego samego dnia (completionRate28 w EF raportów zaniżony
// o jedną trzecią, LEKCJE „ROZSTRZYGNIĘTE 21.08"). Decyzja Filipa 06.10: import domyka plan
// dokładnie tak, jak ręczny zapis logu.
//
// REGUŁA (1:1 z saveLog):
//   · kandydaci = treningi zawodnika z TEGO dnia ze statusem ≠ done; `missed` NIE jest
//     kandydatem (człowiek powiedział „nie zrobiłem" — log tego nie unieważnia bez pytania);
//   · jeden kandydat → on;
//   · kilku → ten o TYM SAMYM typie co log, jeśli dokładnie jeden pasuje;
//   · inaczej nic — zgadywanie między dwoma różnymi planami jest gorsze niż pustka
//     (fałszywy `done` wygląda na fakt).
//   · powiązanie logu z planem (training_logs.planned_training_id) TYLKO gdy dystans logu
//     mieści się w 0,5–2,0 × dystansu planu — jak w saveLog; domknięcie statusu jest
//     niezależne od tej wiarygodności.

/** Czysta reguła wyboru. @param kandydaci wiersze trainings {id,type,status,distance_km}
 *  z jednego dnia (status ≠ done); @param typLogu training_type logu. @returns wiersz | null */
export function wybierzPlanDoDomkniecia(kandydaci, typLogu) {
  const k = (kandydaci || []).filter((r) => r && r.status !== 'missed');
  if (k.length === 1) return k[0];
  if (k.length > 1) {
    const typ = String(typLogu || '').trim();
    const tegoTypu = k.filter((r) => String(r.type || '').trim() === typ);
    if (tegoTypu.length === 1) return tegoTypu[0];
  }
  return null;
}

/** Czy dystans logu jest wiarygodnym wykonaniem planu (0,5–2,0×). Bez obu dystansów → false. */
export function wiarygodneWykonanie(planKm, logKm) {
  const p = parseFloat(planKm) || 0, l = parseFloat(logKm) || 0;
  if (!(p > 0 && l > 0)) return false;
  const s = l / p;
  return s >= 0.5 && s <= 2.0;
}

/** Klucz dnia logu w czasie POLSKIM — bo trainings.date to data PL, a logged_at wraca z bazy
 *  jako timestamptz w UTC (np. '2026-10-06T22:30:00+00:00' = 00:30 PL 7.10).
 *  ⚠️ Pierwsza wersja (06.10, przed bramką Filipa) robiła `slice(0,10)` — liczyła w UTC
 *  i gubiła dzień dla biegów po 22:00 latem / 23:00 zimą. Ten sam błąd klasy „strefa"
 *  co etykieta JUTRO z 27.08.
 *  Dwa kształty wejścia:
 *   · z offsetem/Z (z bazy)            → instant → Intl w Europe/Warsaw (DST liczy Intl, nie my);
 *   · naiwny 'YYYY-MM-DDTHH:MM:SS'      → start_date_local z intervals, JUŻ lokalny → slice.
 *  `new Date()` na naiwnym napisie w Deno (UTC) przesunęłoby go o 2 h — dlatego rozróżnienie. */
const Z_OFFSETEM = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const FORMAT_PL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
export function kluczDnia(loggedAt) {
  const s = String(loggedAt || '').trim();
  if (!s) return '';
  if (!Z_OFFSETEM.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);   // nie wyjątek, nie 'Invalid Date' (LEKCJE #6)
  return FORMAT_PL.format(d);                             // 'sv-SE' daje YYYY-MM-DD
}

/**
 * Domyka plany dla paczki świeżo wstawionych logów JEDNEGO zawodnika.
 * Jedno zapytanie po trainings w zakresie dat, potem tylko tyle UPDATE-ów, ile dopasowań.
 * Nigdy nie rzuca — błąd domknięcia nie może cofnąć importu (ten sam wzorzec co wzbogacanie).
 * @param svc klient service_role
 * @param athleteId
 * @param logi [{ id, logged_at, training_type, distance_km }] — wstawione wiersze
 * @returns {Promise<{domkniete:number, powiazane:number, bledy:number}>}
 */
export async function domknijPlanyPoImporcie(svc, athleteId, logi) {
  const wynik = { domkniete: 0, powiazane: 0, bledy: 0 };
  const lista = (logi || []).filter((l) => l && l.id && l.logged_at);
  if (!athleteId || !lista.length) return wynik;
  const dni = [...new Set(lista.map((l) => kluczDnia(l.logged_at)))].sort();
  let plany;
  try {
    const { data, error } = await svc.from('trainings')
      .select('id,date,type,status,distance_km')
      .eq('athlete_id', athleteId)
      .neq('status', 'done')
      .gte('date', dni[0]).lte('date', dni[dni.length - 1]);
    if (error) { wynik.bledy++; return wynik; }
    plany = data || [];
  } catch (_) { wynik.bledy++; return wynik; }
  const naDzien = new Map();
  for (const p of plany) {
    if (!naDzien.has(p.date)) naDzien.set(p.date, []);
    naDzien.get(p.date).push(p);
  }
  const juzDomkniete = new Set();
  for (const l of lista) {
    const dzien = kluczDnia(l.logged_at);
    const kandydaci = (naDzien.get(dzien) || []).filter((p) => !juzDomkniete.has(p.id));
    const plan = wybierzPlanDoDomkniecia(kandydaci, l.training_type);
    if (!plan) continue;
    try {
      const { error: e1 } = await svc.from('trainings').update({ status: 'done' }).eq('id', plan.id);
      if (e1) { wynik.bledy++; continue; }
      juzDomkniete.add(plan.id);
      wynik.domkniete++;
      if (wiarygodneWykonanie(plan.distance_km, l.distance_km)) {
        const { error: e2 } = await svc.from('training_logs').update({ planned_training_id: plan.id }).eq('id', l.id);
        if (e2) wynik.bledy++; else wynik.powiazane++;
      }
    } catch (_) { wynik.bledy++; }
  }
  return wynik;
}
