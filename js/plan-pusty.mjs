// PLAN PUSTY — JEDNA reguła (M3b, 1.11.2026, projekt M3 v2 pkt 4): co pokazać, gdy w zakresie planu nie ma treningu.
// Wołają ją: zawodnik.html (CTA „Ułóż plan" na Dziś — _odswiezCtaGeneratora, przez dynamiczny import) i EF okienko
// (narzędzie moj_plan — karta plan_pusty, import względny). Plik leży w js/, bo GitHub Pages nie publikuje supabase/;
// moduł czysty (bez window, bez Deno), żeby ładował się w obu miejscach — nie ma drugiej kopii reguły.
//
// Wejście: maTrenera (true/false/null = nie wiadomo — athletes.coach_id), maPlanGeneratora (trening z
// plan_source='generator' od dziś; brak/null = nie), brakPlanu (true/false/null — w zakresie 0 treningów).
// Wyjście: null (nie wiadomo → nic nie obiecujemy), "plan" (jest trening), "trener" (Napisz do trenera — NIGDY
// generator u osoby z trenerem), "wolne" (plan z generatora przewiduje wolne), "generator" (Ułóż plan).
export function stanPlanu({ maTrenera, maPlanGeneratora, brakPlanu }) {
  if (maTrenera == null || brakPlanu == null) return null;
  if (!brakPlanu) return "plan";
  if (maTrenera) return "trener";
  if (maPlanGeneratora) return "wolne";
  return "generator";
}

/** CTA „Ułóż plan" — tylko stan „generator". */
export function pokazGenerator(wejscie) { return stanPlanu(wejscie) === "generator"; }
